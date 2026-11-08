import { query } from '../config/db.js';

// In-memory fallback
const memoryEvents = new Map();
let nextEventId = 10;

// Pre-seed sample live event in memory
memoryEvents.set(1, {
  id: 1,
  account_id: 2,
  title: 'Global Tech Summit 2026',
  description: 'Premier developer conference on cloud, AI and distributed systems.',
  status: 'LIVE',
  starts_at: '2026-12-01T09:00:00Z',
  ends_at: '2026-12-03T18:00:00Z',
});

class EventsService {
  async listEvents() {
    try {
      // Eliminates N+1 query patterns using PostgreSQL JSON aggregation
      const sql = `
        SELECT 
          e.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.tier_type,
                'tier_type', t.tier_type,
                'price', t.price,
                'total_quantity', t.total_quantity,
                'remaining_quantity', t.remaining_quantity,
                'min_per_order', t.min_per_order,
                'max_per_order', t.max_per_order,
                'is_hidden', t.is_hidden
              )
            ) FILTER (WHERE t.id IS NOT NULL AND t.is_hidden = false),
            '[]'::json
          ) AS ticket_tiers
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        GROUP BY e.id
        ORDER BY e.created_at DESC
      `;
      const res = await query(sql);
      return res.rows;
    } catch {
      // Fallback in-memory
      const { default: ticketsService } = await import('./tickets.service.js');
      const list = [];
      for (const ev of memoryEvents.values()) {
        const tiers = await ticketsService.listByEventId(ev.id, false);
        list.push({ ...ev, ticket_tiers: tiers });
      }
      return list;
    }
  }

  async getEventById(id) {
    const numId = Number(id);
    try {
      // Single-query fetch eliminating N+1
      const sql = `
        SELECT 
          e.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.tier_type,
                'tier_type', t.tier_type,
                'price', t.price,
                'total_quantity', t.total_quantity,
                'remaining_quantity', t.remaining_quantity,
                'min_per_order', t.min_per_order,
                'max_per_order', t.max_per_order,
                'is_hidden', t.is_hidden
              )
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'::json
          ) AS ticket_tiers
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE e.id = $1
        GROUP BY e.id
      `;
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch {
      // Fallback
    }

    const ev = memoryEvents.get(numId);
    if (!ev) return null;
    const { default: ticketsService } = await import('./tickets.service.js');
    const tiers = await ticketsService.listByEventId(ev.id, true);
    return { ...ev, ticket_tiers: tiers };
  }

  async createEvent(user, { title, description, starts_at, ends_at, status = 'LIVE' }) {
    if (!title) {
      const err = new Error('Event title is required');
      err.statusCode = 400;
      throw err;
    }

    const accountId = user.account_id || 1;

    try {
      const sql = `
        INSERT INTO events (account_id, title, description, status, starts_at, ends_at, short_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `;
      const shortId = `ev_${Date.now()}`;
      const res = await query(sql, [
        accountId,
        title,
        description || '',
        status,
        starts_at || new Date().toISOString(),
        ends_at || new Date(Date.now() + 86400000).toISOString(),
        shortId,
      ]);
      return res.rows[0];
    } catch {
      // Fallback in-memory
      const id = ++nextEventId;
      const newEvent = {
        id,
        account_id: accountId,
        title,
        description: description || '',
        status,
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || new Date(Date.now() + 86400000).toISOString(),
      };
      memoryEvents.set(id, newEvent);
      return newEvent;
    }
  }

  async updateEvent(user, id, updates) {
    const numId = Number(id);
    const existing = await this.getEventById(numId);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role !== 'ADMIN' && existing.account_id !== user.account_id) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    try {
      const sql = `
        UPDATE events
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `;
      const res = await query(sql, [updates.title, updates.description, updates.status, numId]);
      return res.rows[0];
    } catch {
      // Fallback
      if (updates.title) existing.title = updates.title;
      if (updates.description) existing.description = updates.description;
      if (updates.status) existing.status = updates.status;
      memoryEvents.set(numId, existing);
      return existing;
    }
  }

  async deleteEvent(user, id) {
    const numId = Number(id);
    const existing = await this.getEventById(numId);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role !== 'ADMIN' && existing.account_id !== user.account_id) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    try {
      await query('DELETE FROM events WHERE id = $1', [numId]);
    } catch {
      memoryEvents.delete(numId);
    }
    return true;
  }
}

export default new EventsService();
