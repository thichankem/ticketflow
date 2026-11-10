import { query } from '../config/db.js';
import { demoEvents } from '../data/demo-catalog.js';

// In-memory fallback. Id 1 stays the original summit so list order matches the E2E suite.
const memoryEvents = new Map(demoEvents.map((event) => [event.id, { ...event }]));
let nextEventId = Math.max(...demoEvents.map((event) => event.id));

const eventCover = (slug, category) => {
  const bySlug = {
    'tech-conf-2026': '/images/events/summit.svg',
    'tech-conference-2026': '/images/events/summit.svg',
    'saigon-jazz-night': '/images/events/jazz.svg',
    'dalat-marathon': '/images/events/marathon.svg',
    'dalat-highland-marathon': '/images/events/marathon.svg',
    'indie-film-weekend': '/images/events/film.svg',
    'riverside-meetup': '/images/events/meetup.svg',
    'riverside-community-meetup': '/images/events/meetup.svg',
    'midnight-edm': '/images/events/edm.svg',
    'midnight-edm-flash-sale': '/images/events/edm.svg',
    'startup-pitch-night': '/images/events/pitch.svg',
    'ux-studio-workshop': '/images/events/ux.svg',
  };
  const byCategory = {
    TECHNOLOGY: '/images/events/summit.svg',
    TECH: '/images/events/summit.svg',
    MUSIC: '/images/events/jazz.svg',
    SPORTS: '/images/events/marathon.svg',
    FILM: '/images/events/film.svg',
    COMMUNITY: '/images/events/meetup.svg',
    BUSINESS: '/images/events/pitch.svg',
    DESIGN: '/images/events/ux.svg',
  };
  return bySlug[slug] || byCategory[category] || '/images/events/summit.svg';
};

class EventsService {
  async listEvents() {
    try {
      // Real database fetch eliminating N+1 query patterns using PostgreSQL JSON aggregation
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.type,
                'tier_type', t.type,
                'price', t.price,
                'total_quantity', t.initial_quantity,
                'initial_quantity', t.initial_quantity,
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
        ORDER BY e.id ASC
      `;
      const res = await query(sql);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => ({
          ...r,
          id: Number(r.id),
          account_id: Number(r.account_id),
          cover: eventCover(r.slug || r.short_id, r.category),
          ticket_tiers: (r.ticket_tiers || []).map(t => ({
            ...t,
            id: Number(t.id),
            event_id: Number(t.event_id),
            price: Number(t.price),
            total_quantity: Number(t.total_quantity || t.initial_quantity),
            initial_quantity: Number(t.initial_quantity),
            remaining_quantity: Number(t.remaining_quantity),
            min_per_order: Number(t.min_per_order),
            max_per_order: Number(t.max_per_order),
          })),
        }));
      }
    } catch (dbErr) {
      console.warn('[EventsService.listEvents] Database query error, using fallback:', dbErr.message);
    }

    // Fallback in-memory. Lowest id first so events[0] remains Global Tech Summit.
    const { default: ticketsService } = await import('./tickets.service.js');
    const list = [];
    for (const ev of memoryEvents.values()) {
      const tiers = await ticketsService.listByEventId(ev.id, false);
      list.push({ ...ev, ticket_tiers: tiers });
    }
    list.sort((a, b) => Number(a.id) - Number(b.id));
    return list;
  }

  async getEventById(id) {
    const numId = Number(id);
    try {
      // Single-query fetch eliminating N+1
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.type,
                'tier_type', t.type,
                'price', t.price,
                'total_quantity', t.initial_quantity,
                'initial_quantity', t.initial_quantity,
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
        const row = res.rows[0];
        return {
          ...row,
          id: Number(row.id),
          account_id: Number(row.account_id),
          cover: eventCover(row.slug || row.short_id, row.category),
          ticket_tiers: (row.ticket_tiers || []).map(t => ({
            ...t,
            id: Number(t.id),
            event_id: Number(t.event_id),
            price: Number(t.price),
            total_quantity: Number(t.total_quantity || t.initial_quantity),
            initial_quantity: Number(t.initial_quantity),
            remaining_quantity: Number(t.remaining_quantity),
            min_per_order: Number(t.min_per_order),
            max_per_order: Number(t.max_per_order),
          })),
        };
      }
    } catch (dbErr) {
      console.warn('[EventsService.getEventById] Database query error, using fallback:', dbErr.message);
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
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `event-${Date.now()}`;
      const shortId = `ev_${Date.now()}`;
      const startDate = starts_at || new Date().toISOString();
      const endDate = ends_at || new Date(Date.now() + 86400000).toISOString();
      const sql = `
        INSERT INTO events (account_id, title, slug, description, status, start_date, end_date, short_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *, start_date AS starts_at, end_date AS ends_at
      `;
      const res = await query(sql, [
        accountId,
        title,
        slug,
        description || '',
        status,
        startDate,
        endDate,
        shortId,
      ]);
      return {
        ...res.rows[0],
        id: Number(res.rows[0].id),
        account_id: Number(res.rows[0].account_id),
      };
    } catch (dbErr) {
      console.warn('[EventsService.createEvent] Database insert error, using fallback:', dbErr.message);
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

    if (user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id)) {
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
      return {
        ...res.rows[0],
        id: Number(res.rows[0].id),
        account_id: Number(res.rows[0].account_id),
      };
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

    if (user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id)) {
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
