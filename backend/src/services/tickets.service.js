import { query } from '../config/db.js';
import { demoTiers } from '../data/demo-catalog.js';

const memoryTiers = new Map(demoTiers.map((tier) => [tier.id, { ...tier }]));
let nextTierId = Math.max(...demoTiers.map((tier) => tier.id));

class TicketsService {
  async listByEventId(eventId, includeHidden = false) {
    const numId = Number(eventId);
    try {
      let sql = `SELECT * FROM ticket_tiers WHERE event_id = $1`;
      if (!includeHidden) {
        sql += ` AND is_hidden = false`;
      }
      sql += ` ORDER BY sort_order ASC, id ASC`;
      const res = await query(sql, [numId]);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => ({
          ...r,
          id: Number(r.id),
          event_id: Number(r.event_id),
          price: Number(r.price),
          initial_quantity: Number(r.initial_quantity),
          remaining_quantity: Number(r.remaining_quantity),
          min_per_order: Number(r.min_per_order),
          max_per_order: Number(r.max_per_order),
          name: r.title,
          title: r.title,
          type: r.type,
          tier_type: r.type,
          total_quantity: Number(r.initial_quantity),
        }));
      }
    } catch (dbErr) {
      console.warn('[TicketsService.listByEventId] DB query error, using fallback:', dbErr.message);
    }
    const list = [];
    for (const t of memoryTiers.values()) {
      if (t.event_id === numId) {
        if (includeHidden || !t.is_hidden) {
          list.push(t);
        }
      }
    }
    return list;
  }

  async getTierById(id) {
    const numId = Number(id);
    try {
      const res = await query('SELECT * FROM ticket_tiers WHERE id = $1 LIMIT 1', [numId]);
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          ...r,
          id: Number(r.id),
          event_id: Number(r.event_id),
          price: Number(r.price),
          initial_quantity: Number(r.initial_quantity),
          remaining_quantity: Number(r.remaining_quantity),
          min_per_order: Number(r.min_per_order),
          max_per_order: Number(r.max_per_order),
          name: r.title,
          title: r.title,
          type: r.type,
          tier_type: r.type,
          total_quantity: Number(r.initial_quantity),
        };
      }
    } catch (dbErr) {
      console.warn('[TicketsService.getTierById] DB query error, using fallback:', dbErr.message);
    }
    return memoryTiers.get(numId) || null;
  }

  async createTier(eventId, data) {
    const numEventId = Number(eventId);
    const {
      name,
      title = name,
      type = 'PAID',
      tier_type = type,
      price = 0,
      total_quantity = 10,
      min_per_order = 1,
      max_per_order = 10,
      is_hidden = false,
    } = data;

    const tierName = name || title;
    if (!tierName) {
      const err = new Error('Tier name is required');
      err.statusCode = 400;
      throw err;
    }

    if (price < 0) {
      const err = new Error('Price cannot be negative');
      err.statusCode = 400;
      throw err;
    }

    if (total_quantity <= 0) {
      const err = new Error('Total quantity must be greater than zero');
      err.statusCode = 400;
      throw err;
    }

    if (min_per_order > max_per_order) {
      const err = new Error('min_per_order cannot exceed max_per_order');
      err.statusCode = 400;
      throw err;
    }

    const calculatedPrice = tier_type.toUpperCase() === 'FREE' ? 0 : price;

    const { default: eventsService } = await import('./events.service.js');
    const ev = await eventsService.getEventById(numEventId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    try {
      const sql = `
        INSERT INTO ticket_tiers (
          event_id, title, type, price, initial_quantity, remaining_quantity,
          min_per_order, max_per_order, is_hidden, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [
        numEventId,
        tierName,
        tier_type.toUpperCase(),
        calculatedPrice,
        total_quantity,
        min_per_order,
        max_per_order,
        Boolean(is_hidden),
      ]);
      const r = res.rows[0];
      return {
        ...r,
        id: Number(r.id),
        event_id: Number(r.event_id),
        price: Number(r.price),
        initial_quantity: Number(r.initial_quantity),
        remaining_quantity: Number(r.remaining_quantity),
        min_per_order: Number(r.min_per_order),
        max_per_order: Number(r.max_per_order),
        name: r.title,
        title: r.title,
        type: r.type,
        tier_type: r.type,
        total_quantity: Number(r.initial_quantity),
      };
    } catch (dbErr) {
      console.warn('[TicketsService.createTier] DB insert error, using fallback:', dbErr.message);
      // Fallback
      const id = ++nextTierId;
      const tier = {
        id,
        event_id: numEventId,
        name: tierName,
        title: tierName,
        type: tier_type.toUpperCase(),
        tier_type: tier_type.toUpperCase(),
        price: calculatedPrice,
        total_quantity,
        remaining_quantity: total_quantity,
        min_per_order,
        max_per_order,
        is_hidden: Boolean(is_hidden),
      };
      memoryTiers.set(id, tier);
      return tier;
    }
  }

  // Direct memory access for atomic decrement fallback
  getMemoryTier(id) {
    return memoryTiers.get(Number(id));
  }
}

export default new TicketsService();
