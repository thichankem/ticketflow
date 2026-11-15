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

const defaultRefundPolicy = {
  allow_refund: true,
  max_days_after_order: 7,
  min_days_before_event: 3,
  refund_percentage: 100,
};

function parseLocationDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

function formatEvent(r) {
  const locDetails = parseLocationDetails(r.location_details);
  return {
    ...r,
    id: Number(r.id),
    account_id: Number(r.account_id),
    category: r.category || 'TECH',
    location: r.location || 'TP. Hồ Chí Minh',
    cover: eventCover(r.slug || r.short_id, r.category),
    tags: r.tags || locDetails.tags || ['Sự kiện', r.category || 'Tech'],
    blog_blocks: r.blog_blocks || locDetails.blog_blocks || (r.description ? [
      { type: 'paragraph', text: r.description }
    ] : []),
    pdf_attachments: r.pdf_attachments || locDetails.pdf_attachments || [],
    refund_policy: r.refund_policy || locDetails.refund_policy || defaultRefundPolicy,
    seat_map_url: r.seat_map_url || locDetails.seat_map_url || '/images/seat-map-theater.svg',
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
  };
}

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
      return (res.rows || []).map(r => formatEvent(r));
    } catch (dbErr) {
      console.warn('[EventsService.listEvents] Database query error, using fallback:', dbErr.message);
    }

    // Fallback in-memory. Lowest id first so events[0] remains Global Tech Summit.
    const { default: ticketsService } = await import('./tickets.service.js');
    const list = [];
    for (const ev of memoryEvents.values()) {
      const tiers = await ticketsService.listByEventId(ev.id, false);
      list.push(formatEvent({ ...ev, ticket_tiers: tiers }));
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
        return formatEvent(res.rows[0]);
      }
      return null;
    } catch (dbErr) {
      console.warn('[EventsService.getEventById] Database query error, using fallback:', dbErr.message);
    }

    const ev = memoryEvents.get(numId);
    if (!ev) return null;
    const { default: ticketsService } = await import('./tickets.service.js');
    const tiers = await ticketsService.listByEventId(ev.id, true);
    return formatEvent({ ...ev, ticket_tiers: tiers });
  }

  async createEvent(user, eventData) {
    const {
      title,
      description,
      starts_at,
      start_date,
      ends_at,
      end_date,
      status = 'LIVE',
      category = 'TECH',
      location = 'TP. Hồ Chí Minh',
      location_name,
      province_code = 'HCM',
      tags = [],
      blog_blocks = [],
      pdf_attachments = [],
      refund_policy = defaultRefundPolicy,
      seat_map_url = '/images/seat-map-theater.svg',
      commission_rate = 5.00,
    } = eventData;

    if (!title) {
      const err = new Error('Event title is required');
      err.statusCode = 400;
      throw err;
    }

    const accountId = user.account_id || 1;
    const finalStartDate = start_date || starts_at || new Date().toISOString();
    const finalEndDate = end_date || ends_at || new Date(Date.now() + 86400000).toISOString();
    const finalLocationName = location_name || location || 'TP. Hồ Chí Minh';
    const finalProvinceCode = province_code || 'HCM';
    const finalTags = tags && tags.length > 0 ? tags : ['Sự kiện', category];
    const finalRefundPolicy = refund_policy || defaultRefundPolicy;

    const locationDetails = JSON.stringify({
      venue: finalLocationName,
      location_name: finalLocationName,
      province_code: finalProvinceCode,
      tags: finalTags,
      blog_blocks: blog_blocks && blog_blocks.length > 0 ? blog_blocks : [{ type: 'paragraph', text: description || '' }],
      pdf_attachments: pdf_attachments || [],
      refund_policy: finalRefundPolicy,
      seat_map_url: seat_map_url || '/images/seat-map-theater.svg',
    });

    try {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `event-${Date.now()}`;
      const shortId = `ev_${Date.now()}`;
      const sql = `
        INSERT INTO events (
          account_id, title, slug, description, status, start_date, end_date,
          short_id, category, location, location_name, province_code, tags,
          refund_policy, commission_rate, location_details, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *, start_date AS starts_at, end_date AS ends_at
      `;
      const res = await query(sql, [
        accountId,
        title,
        slug,
        description || '',
        status,
        finalStartDate,
        finalEndDate,
        shortId,
        category,
        finalLocationName,
        finalLocationName,
        finalProvinceCode,
        finalTags,
        JSON.stringify(finalRefundPolicy),
        commission_rate,
        locationDetails,
      ]);
      const created = res.rows[0];
      // Seed escrow account for the newly created event
      try {
        await query(`
          INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
          VALUES ($1, 0, 0, 0, 0, 'HOLDING', NOW())
          ON CONFLICT (event_id) DO NOTHING
        `, [created.id]);
      } catch {}
      return formatEvent(created);
    } catch (dbErr) {
      console.warn('[EventsService.createEvent] Database insert error, using fallback:', dbErr.message);
      // Fallback in-memory
      const id = ++nextEventId;
      const newEvent = formatEvent({
        id,
        account_id: accountId,
        title,
        description: description || '',
        status,
        category,
        start_date: finalStartDate,
        end_date: finalEndDate,
        starts_at: finalStartDate,
        ends_at: finalEndDate,
        location: finalLocationName,
        location_name: finalLocationName,
        province_code: finalProvinceCode,
        tags: finalTags,
        refund_policy: finalRefundPolicy,
        commission_rate,
        location_details: JSON.parse(locationDetails),
        ticket_tiers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
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

    const currentDetails = parseLocationDetails(existing.location_details);
    const mergedDetails = JSON.stringify({
      ...currentDetails,
      tags: updates.tags || existing.tags || currentDetails.tags,
      blog_blocks: updates.blog_blocks || existing.blog_blocks || currentDetails.blog_blocks,
      pdf_attachments: updates.pdf_attachments || existing.pdf_attachments || currentDetails.pdf_attachments,
      refund_policy: updates.refund_policy || existing.refund_policy || currentDetails.refund_policy,
      seat_map_url: updates.seat_map_url || existing.seat_map_url || currentDetails.seat_map_url,
    });

    try {
      const sql = `
        UPDATE events
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status),
            location_details = $4,
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;
      const res = await query(sql, [
        updates.title,
        updates.description,
        updates.status,
        mergedDetails,
        numId,
      ]);
      return formatEvent(res.rows[0]);
    } catch {
      // Fallback
      if (updates.title) existing.title = updates.title;
      if (updates.description) existing.description = updates.description;
      if (updates.status) existing.status = updates.status;
      if (updates.tags) existing.tags = updates.tags;
      if (updates.blog_blocks) existing.blog_blocks = updates.blog_blocks;
      if (updates.pdf_attachments) existing.pdf_attachments = updates.pdf_attachments;
      if (updates.refund_policy) existing.refund_policy = updates.refund_policy;
      if (updates.seat_map_url) existing.seat_map_url = updates.seat_map_url;
      existing.location_details = mergedDetails;
      memoryEvents.set(numId, existing);
      return formatEvent(existing);
    }
  }

  async addAttachment(eventId, attachment) {
    const event = await this.getEventById(eventId);
    if (!event) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    const attId = `att_${eventId}_${Date.now()}`;
    const newAttachment = {
      id: attId,
      title: attachment.title || 'Tài liệu sự kiện (PDF)',
      filename: attachment.filename || 'brochure.pdf',
      size: attachment.size || '1.5 MB',
      url: attachment.url || `/api/events/${eventId}/attachments/${attId}.pdf`,
      uploaded_at: new Date().toISOString(),
    };
    const attachments = [...(event.pdf_attachments || []), newAttachment];
    await this.updateEvent({ role: 'ADMIN' }, eventId, { pdf_attachments: attachments });
    return newAttachment;
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

  async getAllEventsWithMetrics() {
    try {
      const sql = `
        SELECT 
          e.id,
          e.title,
          e.slug,
          e.status,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          e.created_at,
          COALESCE(SUM(t.initial_quantity), 0)::int AS total_tickets,
          COALESCE(SUM(t.initial_quantity - t.remaining_quantity), 0)::int AS sold_tickets,
          COALESCE(
            (SELECT SUM(total_gross) FROM orders o WHERE o.event_id = e.id AND o.status = 'COMPLETED'),
            0
          )::numeric AS revenue
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        GROUP BY e.id
        ORDER BY e.id ASC
      `;
      const res = await query(sql);
      return (res.rows || []).map(r => ({
        id: Number(r.id),
        title: r.title,
        slug: r.slug,
        status: r.status,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        total_tickets: Number(r.total_tickets),
        sold_tickets: Number(r.sold_tickets),
        revenue: Number(r.revenue),
        created_at: r.created_at,
      }));
    } catch (dbErr) {
      console.warn('[EventsService.getAllEventsWithMetrics] DB error, using fallback:', dbErr.message);
    }

    const { default: ticketsService } = await import('./tickets.service.js');
    const { default: ordersService } = await import('./orders.service.js');
    const allOrders = ordersService.getMemoryOrders ? ordersService.getMemoryOrders() : [];

    const list = [];
    for (const ev of memoryEvents.values()) {
      const tiers = await ticketsService.listByEventId(ev.id, true);
      const total_tickets = tiers.reduce((sum, t) => sum + (Number(t.total_quantity || t.initial_quantity) || 0), 0);
      const sold_tickets = tiers.reduce((sum, t) => sum + ((Number(t.total_quantity || t.initial_quantity) || 0) - (Number(t.remaining_quantity) || 0)), 0);
      const evOrders = allOrders.filter(o => o.event_id === ev.id && o.status === 'COMPLETED');
      const revenue = evOrders.reduce((sum, o) => sum + Number(o.total || o.total_gross || 0), 0);

      list.push({
        id: ev.id,
        title: ev.title,
        slug: ev.slug || `event-${ev.id}`,
        status: ev.status,
        starts_at: ev.starts_at,
        ends_at: ev.ends_at,
        total_tickets,
        sold_tickets,
        revenue,
        created_at: ev.created_at || new Date().toISOString(),
      });
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async updateEventStatus(id, status) {
    const numId = Number(id);
    const validStatuses = ['LIVE', 'DRAFT', 'CANCELLED', 'ARCHIVED'];
    const normalizedStatus = (status || '').toUpperCase().trim();
    if (!validStatuses.includes(normalizedStatus)) {
      const err = new Error(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    try {
      const sql = `
        UPDATE events
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const res = await query(sql, [normalizedStatus, numId]);
      if (res.rowCount > 0) {
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          account_id: Number(res.rows[0].account_id),
        };
      }
    } catch (err) {
      if (err.statusCode) throw err;
    }

    const ev = memoryEvents.get(numId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    ev.status = normalizedStatus;
    memoryEvents.set(numId, ev);
    return ev;
  }

  async adminDeleteEvent(id) {
    const numId = Number(id);
    let found = false;

    // Check existence first
    const existing = await this.getEventById(numId).catch(() => null);
    if (!existing && !memoryEvents.has(numId)) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    try {
      // Clean up child tables to satisfy Postgres RESTRICT foreign key constraints
      await query('DELETE FROM attendees WHERE event_id = $1', [numId]).catch(() => {});
      await query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE event_id = $1)', [numId]).catch(() => {});
      await query('DELETE FROM orders WHERE event_id = $1', [numId]).catch(() => {});
      await query('DELETE FROM seat_reservations WHERE event_id = $1', [numId]).catch(() => {});
      await query('DELETE FROM event_favorites WHERE event_id = $1', [numId]).catch(() => {});
      await query('DELETE FROM promos WHERE event_id = $1', [numId]).catch(() => {});
      await query('DELETE FROM ticket_tiers WHERE event_id = $1', [numId]).catch(() => {});
      const res = await query('DELETE FROM events WHERE id = $1 RETURNING id', [numId]);
      if (res.rowCount > 0) found = true;
    } catch (err) {
      console.warn('[EventsService.adminDeleteEvent] DB error:', err.message);
    }

    if (memoryEvents.has(numId)) {
      memoryEvents.delete(numId);
      found = true;
    }

    if (!found) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }

  async getOrganizerDashboard(user) {
    const accountId = Number(user.account_id || 1);
    const isAdmin = user.role === 'ADMIN';

    try {
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(SUM(t.initial_quantity - t.remaining_quantity), 0)::int AS tickets_sold,
          COALESCE(
            (SELECT SUM(total_gross) FROM orders o WHERE o.event_id = e.id AND o.status = 'COMPLETED'),
            0
          )::numeric AS gross_revenue,
          COALESCE(
            (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id AND a.status != 'CANCELLED'),
            0
          )::int AS attendee_count,
          COALESCE(
            (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id AND a.status = 'CHECKED_IN'),
            0
          )::int AS checked_in_count
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE ($1 = TRUE OR e.account_id = $2)
        GROUP BY e.id
        ORDER BY e.id ASC
      `;
      const res = await query(sql, [isAdmin, accountId]);
      return (res.rows || []).map(r => ({
        ...r,
        id: Number(r.id),
        account_id: Number(r.account_id),
        cover: eventCover(r.slug || r.short_id, r.category),
        tickets_sold: Number(r.tickets_sold),
        gross_revenue: Number(r.gross_revenue),
        attendee_count: Number(r.attendee_count),
        checked_in_count: Number(r.checked_in_count),
      }));
    } catch (dbErr) {
      console.warn('[EventsService.getOrganizerDashboard] DB error, using fallback:', dbErr.message);
    }

    const { default: ticketsService } = await import('./tickets.service.js');
    const { default: ordersService } = await import('./orders.service.js');
    const allOrders = ordersService.getMemoryOrders ? ordersService.getMemoryOrders() : [];
    const allAttendees = ordersService.getMemoryAttendees ? ordersService.getMemoryAttendees() : [];

    const list = [];
    for (const ev of memoryEvents.values()) {
      if (!isAdmin && Number(ev.account_id) !== accountId) {
        continue;
      }
      const tiers = await ticketsService.listByEventId(ev.id, true);
      const tickets_sold = tiers.reduce((sum, t) => sum + ((Number(t.total_quantity || t.initial_quantity) || 0) - (Number(t.remaining_quantity) || 0)), 0);
      const evOrders = allOrders.filter(o => o.event_id === ev.id && o.status === 'COMPLETED');
      const gross_revenue = evOrders.reduce((sum, o) => sum + Number(o.total || o.total_gross || 0), 0);
      const evAttendees = allAttendees.filter(a => a.event_id === ev.id && a.status !== 'CANCELLED');
      const attendee_count = evAttendees.length;
      const checked_in_count = evAttendees.filter(a => a.status === 'CHECKED_IN').length;

      list.push({
        ...ev,
        cover: eventCover(ev.slug || ev.short_id, ev.category),
        tickets_sold,
        gross_revenue,
        attendee_count,
        checked_in_count,
      });
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  getMemoryEvents() {
    return Array.from(memoryEvents.values());
  }
}

export default new EventsService();
