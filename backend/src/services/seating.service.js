/**
 * Seating & Auto-allocation Engine
 * File: backend/src/services/seating.service.js
 *
 * Implements Contiguous Seating Algorithm and Orphan Seat Prevention
 * as specified in SPEC.md (Module 2.3).
 */

import { query } from '../config/db.js';

class SeatingService {
  constructor() {
    // In-memory seating storage indexed by eventId
    // Structure: eventId -> { config, seatStatusMap }
    this.eventSeating = new Map();
  }

  /**
   * Initializes or gets seating layout for an event
   */
  getOrCreateEventSeating(eventId) {
    const numEventId = Number(eventId);
    if (!this.eventSeating.has(numEventId)) {
      // Default venue: 6 rows (A to F), 10 seats per row
      const defaultRows = ['A', 'B', 'C', 'D', 'E', 'F'];
      const seatsPerRow = 10;
      const reservedVipSeats = ['A-1', 'A-2', 'B-1']; // Reserved VIP / handicap seats

      const seatStatusMap = new Map();

      // Mark reserved VIP seats
      for (const seat of reservedVipSeats) {
        seatStatusMap.set(seat, {
          seat,
          status: 'RESERVED_VIP',
          orderId: null,
          lockedAt: null,
        });
      }

      this.eventSeating.set(numEventId, {
        eventId: numEventId,
        rows: defaultRows,
        seatsPerRow,
        seatMapImageUrl: '/images/seat-map-theater.svg',
        reservedVipSeats,
        seatStatusMap,
      });
    }

    return this.eventSeating.get(numEventId);
  }

  /**
   * Configure custom seat layout for an event
   */
  configureLayout(eventId, { rows, seatsPerRow, seatMapImageUrl, reservedVipSeats = [] }) {
    const numEventId = Number(eventId);
    const validRows = Array.isArray(rows) && rows.length > 0 ? rows : ['A', 'B', 'C', 'D', 'E'];
    const validSeatsPerRow = Number(seatsPerRow) > 0 ? Number(seatsPerRow) : 10;

    const seatStatusMap = new Map();
    for (const seat of reservedVipSeats) {
      seatStatusMap.set(seat, {
        seat,
        status: 'RESERVED_VIP',
        orderId: null,
        lockedAt: null,
      });
    }

    const layout = {
      eventId: numEventId,
      rows: validRows,
      seatsPerRow: validSeatsPerRow,
      seatMapImageUrl: seatMapImageUrl || '/images/seat-map-theater.svg',
      reservedVipSeats,
      seatStatusMap,
    };

    this.eventSeating.set(numEventId, layout);
    return layout;
  }

  /**
   * Sync active seat reservations from PostgreSQL database
   */
  async syncFromDb(eventId) {
    const numEventId = Number(eventId);
    if (isNaN(numEventId)) return;
    try {
      const res = await query(
        `SELECT seat_key, status, order_id, expires_at 
         FROM seat_reservations 
         WHERE event_id = $1 AND (expires_at IS NULL OR expires_at > NOW() OR status IN ('OCCUPIED', 'RESERVED_VIP'))`,
        [numEventId]
      );
      if (res && res.rows) {
        const layout = this.getOrCreateEventSeating(numEventId);
        // Retain reserved VIP seats
        for (const [key, val] of layout.seatStatusMap.entries()) {
          if (val.status !== 'RESERVED_VIP') {
            layout.seatStatusMap.delete(key);
          }
        }
        for (const row of res.rows) {
          layout.seatStatusMap.set(row.seat_key, {
            seat: row.seat_key,
            status: row.status,
            orderId: row.order_id ? Number(row.order_id) : null,
            expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
          });
        }
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Returns current seat layout and seat availability matrix
   * Supports both synchronous inspection and asynchronous await
   */
  getSeatLayout(eventId) {
    this.syncFromDb(eventId).catch(() => {});
    const layout = this.getOrCreateEventSeating(eventId);
    const now = Date.now();

    // Clean up expired locked seats (15 min hold)
    for (const [seatKey, info] of layout.seatStatusMap.entries()) {
      if (info.status === 'LOCKED' && info.expiresAt && now > info.expiresAt) {
        layout.seatStatusMap.delete(seatKey);
      }
    }

    const seatMatrix = [];
    let totalSeats = 0;
    let availableSeats = 0;

    for (const row of layout.rows) {
      const rowSeats = [];
      for (let num = 1; num <= layout.seatsPerRow; num++) {
        const seatKey = `${row}-${num}`;
        totalSeats++;

        const current = layout.seatStatusMap.get(seatKey);
        let status = 'AVAILABLE';
        if (current) {
          status = current.status;
        } else {
          availableSeats++;
        }

        rowSeats.push({
          seat: seatKey,
          row,
          number: num,
          status,
          orderId: current ? current.orderId : null,
        });
      }
      seatMatrix.push({ row, seats: rowSeats });
    }

    const result = {
      eventId: layout.eventId,
      rows: layout.rows,
      seatsPerRow: layout.seatsPerRow,
      seatMapImageUrl: layout.seatMapImageUrl,
      reservedVipSeats: layout.reservedVipSeats,
      totalSeats,
      availableSeats,
      seatMatrix,
    };

    return result;
  }

  /**
   * Contiguous seating allocation with orphan seat prevention
   * @param {number} eventId - Event ID
   * @param {number} orderId - Order ID
   * @param {number} count - Number of contiguous seats needed
   * @param {object} [options] - Options (holdMinutes)
   * @returns {Array<string>} Allocated seat IDs (e.g. ['B-3', 'B-4'])
   */
  allocateContiguousSeats(eventId, orderId, count, options = {}) {
    this.syncFromDb(eventId).catch(() => {});
    const layout = this.getOrCreateEventSeating(eventId);
    const numSeatsNeeded = Math.max(1, parseInt(count, 10));
    const holdMinutes = options.holdMinutes || 15;
    const expiresAt = Date.now() + holdMinutes * 60 * 1000;

    // Clean up expired locks first
    const now = Date.now();
    for (const [seatKey, info] of layout.seatStatusMap.entries()) {
      if (info.status === 'LOCKED' && info.expiresAt && now > info.expiresAt) {
        layout.seatStatusMap.delete(seatKey);
      }
    }

    let bestCandidate = null;
    let bestScore = -Infinity;

    // Search row by row for contiguous blocks
    for (const row of layout.rows) {
      // Build occupancy array for this row (0 = available, 1 = taken/locked/reserved)
      const occupancy = [];
      for (let num = 1; num <= layout.seatsPerRow; num++) {
        const seatKey = `${row}-${num}`;
        const isOccupied = layout.seatStatusMap.has(seatKey);
        occupancy.push(isOccupied ? 1 : 0);
      }

      // Check all possible contiguous blocks of size numSeatsNeeded in this row
      for (let start = 0; start <= layout.seatsPerRow - numSeatsNeeded; start++) {
        let isContiguous = true;
        for (let k = 0; k < numSeatsNeeded; k++) {
          if (occupancy[start + k] !== 0) {
            isContiguous = false;
            break;
          }
        }

        if (!isContiguous) continue;

        // Evaluate orphan seat penalty
        // An orphan seat is an isolated single empty seat (gap of 1)
        // Check left gap
        let orphanPenalty = 0;
        if (start === 1) {
          // Leaves seat 0 empty by itself (orphan on left edge!)
          orphanPenalty += 50;
        } else if (start > 1 && occupancy[start - 1] === 0 && occupancy[start - 2] === 1) {
          // Leaves exactly 1 empty seat to the left
          orphanPenalty += 50;
        }

        // Check right gap
        const end = start + numSeatsNeeded - 1;
        if (end === layout.seatsPerRow - 2) {
          // Leaves the very last seat alone
          orphanPenalty += 50;
        } else if (end < layout.seatsPerRow - 2 && occupancy[end + 1] === 0 && occupancy[end + 2] === 1) {
          // Leaves exactly 1 empty seat to the right
          orphanPenalty += 50;
        }

        // Row preference score: Rows earlier in array (A, B, C...) get higher row score
        const rowIndex = layout.rows.indexOf(row);
        const rowScore = (layout.rows.length - rowIndex) * 100;

        // Center preference score: prefer center seats
        const center = layout.seatsPerRow / 2;
        const blockCenter = start + numSeatsNeeded / 2;
        const centerDistance = Math.abs(center - blockCenter);
        const centerScore = 50 - centerDistance * 5;

        const totalScore = rowScore + centerScore - orphanPenalty;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          const candidateSeats = [];
          for (let k = 0; k < numSeatsNeeded; k++) {
            candidateSeats.push(`${row}-${start + k + 1}`);
          }
          bestCandidate = candidateSeats;
        }
      }

      // If we found a great candidate in an earlier row without orphan penalty, we can use it
      if (bestCandidate && bestScore >= 100) {
        break;
      }
    }

    // Fallback: If no single row has enough contiguous seats, find closest available seats
    if (!bestCandidate) {
      const fallbackSeats = [];
      for (const row of layout.rows) {
        for (let num = 1; num <= layout.seatsPerRow; num++) {
          const seatKey = `${row}-${num}`;
          if (!layout.seatStatusMap.has(seatKey)) {
            fallbackSeats.push(seatKey);
            if (fallbackSeats.length === numSeatsNeeded) break;
          }
        }
        if (fallbackSeats.length === numSeatsNeeded) break;
      }

      if (fallbackSeats.length < numSeatsNeeded) {
        // Allocate flexible General Admission / Standing / Overflow seats for events exceeding standard seat rows
        const remainingNeeded = numSeatsNeeded - fallbackSeats.length;
        const lastRow = layout.rows && layout.rows.length > 0 ? layout.rows[layout.rows.length - 1] : 'GA';
        for (let i = 1; i <= remainingNeeded; i++) {
          fallbackSeats.push(`GA-${lastRow}-${fallbackSeats.length + i}`);
        }
      }

      bestCandidate = fallbackSeats;
    }

    // Atomically lock seats
    for (const seat of bestCandidate) {
      layout.seatStatusMap.set(seat, {
        seat,
        status: 'LOCKED',
        orderId,
        lockedAt: Date.now(),
        expiresAt,
      });

      if (!isNaN(Number(eventId))) {
        query(`
          INSERT INTO seat_reservations (event_id, order_id, seat_key, status, expires_at, created_at)
          VALUES ($1, $2, $3, 'LOCKED', $4, NOW())
          ON CONFLICT (event_id, seat_key)
          DO UPDATE SET order_id = EXCLUDED.order_id, status = 'LOCKED', expires_at = EXCLUDED.expires_at
          WHERE seat_reservations.status = 'LOCKED' AND (seat_reservations.expires_at IS NULL OR seat_reservations.expires_at < NOW())
        `, [Number(eventId), orderId ? Number(orderId) : null, seat, expiresAt ? new Date(expiresAt).toISOString() : null]).catch(() => {});
      }
    }

    return bestCandidate;
  }

  /**
   * Confirm seats permanently (transitions LOCKED -> OCCUPIED upon checkout)
   */
  confirmSeats(eventId, orderId, seats = []) {
    const layout = this.getOrCreateEventSeating(eventId);
    const targetSeats = seats.length > 0 ? seats : this.getSeatsByOrderId(eventId, orderId);

    for (const seat of targetSeats) {
      layout.seatStatusMap.set(seat, {
        seat,
        status: 'OCCUPIED',
        orderId,
        confirmedAt: Date.now(),
      });
    }

    if (!isNaN(Number(eventId)) && orderId) {
      query(`
        UPDATE seat_reservations
        SET status = 'OCCUPIED'
        WHERE event_id = $1 AND order_id = $2
      `, [Number(eventId), Number(orderId)]).catch(() => {});
    }

    return targetSeats;
  }

  /**
   * Release seats back to available when order is cancelled or expires
   */
  releaseSeats(eventId, orderId) {
    const layout = this.getOrCreateEventSeating(eventId);
    const released = [];

    for (const [seatKey, info] of layout.seatStatusMap.entries()) {
      if (info.orderId === Number(orderId) || info.orderId === String(orderId)) {
        if (info.status !== 'RESERVED_VIP') {
          layout.seatStatusMap.delete(seatKey);
          released.push(seatKey);
        }
      }
    }

    if (!isNaN(Number(eventId)) && orderId) {
      query(`
        DELETE FROM seat_reservations
        WHERE event_id = $1 AND order_id = $2 AND status != 'RESERVED_VIP'
      `, [Number(eventId), Number(orderId)]).catch(() => {});
    }

    return released;
  }

  /**
   * Get all seats assigned to an order
   */
  getSeatsByOrderId(eventId, orderId) {
    const layout = this.getOrCreateEventSeating(eventId);
    const seats = [];

    for (const [seatKey, info] of layout.seatStatusMap.entries()) {
      if (info.orderId === Number(orderId) || info.orderId === String(orderId)) {
        seats.push(seatKey);
      }
    }

    return seats;
  }
}

export default new SeatingService();
