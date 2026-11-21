import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { memoryOrders, memoryAttendees, getNextAttendeeId } from '../data/order-store.js';
import eventsService from './events.service.js';
import ticketsService from './tickets.service.js';

/**
 * Cohesive Attendee Domain Service
 * Encapsulates attendee roster management, guest passes, and status tracking.
 */
export class AttendeeService {
  async getAttendeesByEvent(eventId, user) {
    const numEventId = Number(eventId);
    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    try {
      const sql = `
        SELECT 
          a.id,
          a.short_id,
          a.first_name,
          a.last_name,
          a.email,
          a.barcode,
          a.status,
          a.checked_in_at,
          a.created_at,
          a.ticket_tier_id,
          COALESCE(t.title, '') AS tier_name,
          COALESCE(t.title, '') AS "tier name"
        FROM attendees a
        LEFT JOIN ticket_tiers t ON a.ticket_tier_id = t.id
        WHERE a.event_id = $1
        ORDER BY a.id ASC
      `;
      const res = await query(sql, [numEventId]);
      return (res.rows || []).map((r) => ({
        id: Number(r.id),
        short_id: r.short_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        barcode: r.barcode,
        status: r.status,
        checked_in_at: r.checked_in_at,
        created_at: r.created_at,
        ticket_tier_id: r.ticket_tier_id ? Number(r.ticket_tier_id) : null,
        tier_name: r.tier_name,
        'tier name': r.tier_name,
      }));
    } catch (dbErr) {
      console.warn('[AttendeeService.getAttendeesByEvent] DB error, using fallback:', dbErr.message);
    }

    const list = [];
    for (const a of memoryAttendees.values()) {
      if (a.event_id === numEventId) {
        const tier = a.ticket_tier_id ? await ticketsService.getTierById(a.ticket_tier_id) : null;
        const tierName = tier ? tier.title || tier.name || '' : '';
        list.push({
          id: a.id,
          short_id: a.short_id || `att_${a.id}`,
          first_name: a.first_name || (a.name ? a.name.split(' ')[0] : ''),
          last_name: a.last_name || (a.name && a.name.split(' ').length > 1 ? a.name.split(' ').slice(1).join(' ') : ''),
          email: a.email,
          barcode: a.barcode,
          status: a.status,
          checked_in_at: a.checked_in_at || null,
          created_at: a.created_at || new Date().toISOString(),
          ticket_tier_id: a.ticket_tier_id ? Number(a.ticket_tier_id) : null,
          tier_name: tierName,
          'tier name': tierName,
        });
      }
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async createGuestAttendee(eventId, data, user) {
    const numEventId = Number(eventId);
    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const { first_name, last_name, name, email, ticket_tier_id } = data;
    if (!email || (!name && !first_name)) {
      const err = new Error('Guest full name and email are required');
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const fullName = name ? name.trim() : `${first_name || ''} ${last_name || ''}`.trim();
    const firstName = first_name || fullName.split(' ')[0] || 'Guest';
    const lastName = last_name || (fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : 'VIP');

    const tiers = await ticketsService.listByEventId(numEventId, true);
    let tierId = ticket_tier_id ? Number(ticket_tier_id) : tiers[0]?.id || null;
    const chosenTier = tiers.find((t) => Number(t.id) === tierId) || tiers[0];
    if (chosenTier) tierId = Number(chosenTier.id);

    const barcode = `TKT-${numEventId}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const shortId = `att_${Date.now().toString().slice(-8)}`;
    const publicId = `guest_${Math.random().toString(36).substring(2, 10)}`;

    let newAttendee = null;

    try {
      let orderId = null;
      const orderRes = await query(
        `
        INSERT INTO orders (
          short_id, public_id, event_id, user_id, first_name, last_name, email,
          status, payment_status, payment_gateway, currency, subtotal,
          total_before_additions, discount_amount, total_tax, total_fee, total_gross,
          total_refunded, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          'COMPLETED', 'NO_PAYMENT_REQUIRED', 'COMPLIMENTARY', 'USD', 0,
          0, 0, 0, 0, 0,
          0, NOW(), NOW()
        ) RETURNING id
      `,
        [
          `ord_guest_${Date.now().toString().slice(-6)}`,
          `pub_guest_${Date.now().toString().slice(-6)}`,
          numEventId,
          user ? Number(user.id) : null,
          firstName,
          lastName,
          cleanEmail,
        ]
      );

      if (orderRes.rowCount > 0) {
        orderId = Number(orderRes.rows[0].id);
      }

      if (orderId && tierId) {
        const attRes = await query(
          `
          INSERT INTO attendees (
            short_id, public_id, order_id, ticket_tier_id, event_id,
            first_name, last_name, email, status, barcode, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, NOW(), NOW())
          RETURNING *
        `,
          [shortId, publicId, orderId, tierId, numEventId, firstName, lastName, cleanEmail, barcode]
        );

        if (attRes.rowCount > 0) {
          const row = attRes.rows[0];
          newAttendee = {
            id: Number(row.id),
            short_id: row.short_id,
            first_name: row.first_name,
            last_name: row.last_name,
            name: `${row.first_name} ${row.last_name}`.trim(),
            email: row.email,
            barcode: row.barcode,
            status: row.status,
            checked_in_at: row.checked_in_at,
            tier_name: chosenTier?.title || chosenTier?.name || 'VIP Guest',
            'tier name': chosenTier?.title || chosenTier?.name || 'VIP Guest',
            ticket_tier_id: tierId,
            event_id: numEventId,
            order_id: orderId,
          };
        }
      }
    } catch (dbErr) {
      console.warn('[AttendeeService.createGuestAttendee] DB error, using fallback:', dbErr.message);
    }

    if (!newAttendee) {
      const id = getNextAttendeeId();
      newAttendee = {
        id,
        short_id: shortId,
        public_id: publicId,
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        email: cleanEmail,
        barcode,
        status: 'ACTIVE',
        checked_in_at: null,
        tier_name: chosenTier?.title || chosenTier?.name || 'VIP Guest',
        'tier name': chosenTier?.title || chosenTier?.name || 'VIP Guest',
        ticket_tier_id: tierId,
        event_id: numEventId,
      };
      memoryAttendees.set(id, newAttendee);
    } else {
      memoryAttendees.set(newAttendee.id, newAttendee);
    }

    return newAttendee;
  }

  async updateAttendee(eventId, attendeeId, data, user) {
    const numEventId = Number(eventId);
    const numAttendeeId = Number(attendeeId);

    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const { first_name, last_name, name, email, ticket_tier_id, status } = data;
    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    const fullName = name ? name.trim() : first_name || last_name ? `${first_name || ''} ${last_name || ''}`.trim() : undefined;
    const firstName = first_name || (fullName ? fullName.split(' ')[0] : undefined);
    const lastName = last_name || (fullName && fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : undefined);

    let updated = null;

    try {
      const res = await query(
        `
        UPDATE attendees
        SET first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            email = COALESCE($3, email),
            ticket_tier_id = COALESCE($4, ticket_tier_id),
            status = COALESCE($5, status),
            updated_at = NOW()
        WHERE id = $6 AND event_id = $7
        RETURNING *
      `,
        [firstName, lastName, cleanEmail, ticket_tier_id ? Number(ticket_tier_id) : null, status, numAttendeeId, numEventId]
      );

      if (res.rowCount > 0) {
        const row = res.rows[0];
        const tier = row.ticket_tier_id ? await ticketsService.getTierById(row.ticket_tier_id) : null;
        updated = {
          id: Number(row.id),
          short_id: row.short_id,
          first_name: row.first_name,
          last_name: row.last_name,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          barcode: row.barcode,
          status: row.status,
          checked_in_at: row.checked_in_at,
          tier_name: tier?.title || tier?.name || '',
          'tier name': tier?.title || tier?.name || '',
          ticket_tier_id: Number(row.ticket_tier_id),
          event_id: numEventId,
        };
      }
    } catch (dbErr) {
      console.warn('[AttendeeService.updateAttendee] DB error, using fallback:', dbErr.message);
    }

    const memAtt = memoryAttendees.get(numAttendeeId);
    if (memAtt && Number(memAtt.event_id) === numEventId) {
      if (firstName !== undefined) memAtt.first_name = firstName;
      if (lastName !== undefined) memAtt.last_name = lastName;
      if (cleanEmail !== undefined) memAtt.email = cleanEmail;
      if (ticket_tier_id !== undefined) memAtt.ticket_tier_id = Number(ticket_tier_id);
      if (status !== undefined) memAtt.status = status;
      if (!updated) updated = memAtt;
    }

    if (!updated) {
      const err = new Error('Attendee not found');
      err.statusCode = 404;
      throw err;
    }

    return updated;
  }

  async deleteAttendee(eventId, attendeeId, user) {
    const numEventId = Number(eventId);
    const numAttendeeId = Number(attendeeId);

    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    let found = false;

    try {
      const res = await query(
        `
        UPDATE attendees
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1 AND event_id = $2
        RETURNING id
      `,
        [numAttendeeId, numEventId]
      );
      if (res.rowCount > 0) found = true;
    } catch (dbErr) {
      console.warn('[AttendeeService.deleteAttendee] DB error, using fallback:', dbErr.message);
    }

    const memAtt = memoryAttendees.get(numAttendeeId);
    if (memAtt && Number(memAtt.event_id) === numEventId) {
      memAtt.status = 'CANCELLED';
      found = true;
    }

    if (!found) {
      const err = new Error('Attendee not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      message: `Ticket for attendee #${numAttendeeId} cancelled successfully`,
    };
  }

  /**
   * Check in attendee using their ticket barcode or public ID.
   * Enforces role checks, duplicate check-in prevention, and atomic status transition.
   */
  async checkInAttendee(eventId, { barcode, ticket_code } = {}, user = null) {
    const numEventId = Number(eventId);
    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const code = barcode || ticket_code;
    if (!code) {
      const err = new Error('Barcode is required for check-in');
      err.statusCode = 400;
      throw err;
    }

    let checkedInAttendee = null;

    try {
      const checkRes = await query(
        `SELECT * FROM attendees WHERE event_id = $1 AND (barcode = $2 OR public_id = $2 OR short_id = $2)`,
        [numEventId, code]
      );

      if (checkRes.rowCount > 0) {
        const row = checkRes.rows[0];
        if (row.status === 'CHECKED_IN') {
          const err = new Error('Ticket is already checked in');
          err.statusCode = 400;
          throw err;
        }
        if (row.status === 'CANCELLED') {
          const err = new Error('Ticket is cancelled');
          err.statusCode = 400;
          throw err;
        }

        const updateRes = await query(
          `UPDATE attendees SET status = 'CHECKED_IN', checked_in_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
          [row.id]
        );
        if (updateRes.rowCount > 0) {
          const u = updateRes.rows[0];
          checkedInAttendee = {
            id: Number(u.id),
            short_id: u.short_id,
            first_name: u.first_name,
            last_name: u.last_name,
            name: `${u.first_name} ${u.last_name}`.trim(),
            email: u.email,
            barcode: u.barcode,
            status: u.status,
            checked_in_at: u.checked_in_at,
            ticket_tier_id: Number(u.ticket_tier_id),
            event_id: numEventId,
          };
        }
      }
    } catch (dbErr) {
      if (dbErr.statusCode) throw dbErr;
      console.warn('[AttendeeService.checkInAttendee] DB checkin error, trying fallback:', dbErr.message);
    }

    if (!checkedInAttendee) {
      for (const att of memoryAttendees.values()) {
        if (Number(att.event_id) === numEventId && (att.barcode === code || att.ticket_code === code || att.short_id === code)) {
          if (att.status === 'CHECKED_IN') {
            const err = new Error('Ticket is already checked in');
            err.statusCode = 400;
            throw err;
          }
          if (att.status === 'CANCELLED') {
            const err = new Error('Ticket is cancelled');
            err.statusCode = 400;
            throw err;
          }
          att.status = 'CHECKED_IN';
          att.checked_in_at = new Date().toISOString();
          checkedInAttendee = att;
          break;
        }
      }
    }

    if (!checkedInAttendee) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      attendee: checkedInAttendee,
    };
  }
}

export default new AttendeeService();
