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
      return (res.rows || []).map(r => ({
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
      return null;
    } catch (dbErr) {
      console.warn('[TicketsService.getTierById] DB query error, using fallback:', dbErr.message);
    }
    return memoryTiers.get(numId) || null;
  }

  async createTier(eventId, data, user = null) {
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

    if (user && user.role !== 'ADMIN' && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
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

  getMemoryTiers() {
    return Array.from(memoryTiers.values());
  }

  async updateTier(eventId, tierId, { title, name, price, quantity, total_quantity, initial_quantity, is_hidden }, user = null) {
    const numEventId = Number(eventId);
    const numTierId = Number(tierId);
    const tierName = title || name;
    const newQty = quantity !== undefined ? quantity : (total_quantity !== undefined ? total_quantity : initial_quantity);

    const { default: eventsService } = await import('./events.service.js');
    const ev = await eventsService.getEventById(numEventId);
    if (user && user.role !== 'ADMIN' && ev && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const existing = await this.getTierById(numTierId);
    if (!existing || Number(existing.event_id) !== numEventId) {
      const err = new Error('Ticket tier not found for this event');
      err.statusCode = 404;
      throw err;
    }

    if (price !== undefined && Number(price) < 0) {
      const err = new Error('Price cannot be negative');
      err.statusCode = 400;
      throw err;
    }

    if (newQty !== undefined && Number(newQty) <= 0) {
      const err = new Error('Total quantity must be greater than zero');
      err.statusCode = 400;
      throw err;
    }

    try {
      const oldQty = existing.initial_quantity || existing.total_quantity || 0;
      const updatedQty = newQty !== undefined ? Number(newQty) : oldQty;
      const qtyDiff = updatedQty - oldQty;

      const sql = `
        UPDATE ticket_tiers
        SET title = COALESCE($1, title),
            price = COALESCE($2, price),
            initial_quantity = COALESCE($3, initial_quantity),
            remaining_quantity = GREATEST(0, remaining_quantity + $4),
            is_hidden = COALESCE($5, is_hidden),
            updated_at = NOW()
        WHERE id = $6 AND event_id = $7
        RETURNING *
      `;
      const res = await query(sql, [
        tierName || null,
        price !== undefined ? Number(price) : null,
        newQty !== undefined ? Number(newQty) : null,
        qtyDiff,
        is_hidden !== undefined ? Boolean(is_hidden) : null,
        numTierId,
        numEventId,
      ]);
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          ...r,
          id: Number(r.id),
          event_id: Number(r.event_id),
          price: Number(r.price),
          initial_quantity: Number(r.initial_quantity),
          remaining_quantity: Number(r.remaining_quantity),
          title: r.title,
          name: r.title,
          total_quantity: Number(r.initial_quantity),
          is_hidden: Boolean(r.is_hidden),
        };
      }
    } catch (dbErr) {
      console.warn('[TicketsService.updateTier] DB update error, using fallback:', dbErr.message);
    }

    const memTier = memoryTiers.get(numTierId);
    if (!memTier || memTier.event_id !== numEventId) {
      const err = new Error('Ticket tier not found for this event');
      err.statusCode = 404;
      throw err;
    }
    if (tierName !== undefined) {
      memTier.title = tierName;
      memTier.name = tierName;
    }
    if (price !== undefined) {
      memTier.price = Number(price);
    }
    if (newQty !== undefined) {
      const oldQty = memTier.total_quantity || memTier.initial_quantity || 0;
      const diff = Number(newQty) - oldQty;
      memTier.total_quantity = Number(newQty);
      memTier.initial_quantity = Number(newQty);
      memTier.remaining_quantity = Math.max(0, (memTier.remaining_quantity || 0) + diff);
    }
    if (is_hidden !== undefined) {
      memTier.is_hidden = Boolean(is_hidden);
    }
    return memTier;
  }

  async deleteTier(eventId, tierId, user = null) {
    const numEventId = Number(eventId);
    const numTierId = Number(tierId);

    const { default: eventsService } = await import('./events.service.js');
    const ev = await eventsService.getEventById(numEventId);
    if (user && user.role !== 'ADMIN' && ev && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    // Protection of Accounting Data (SPEC.md Module 2.4):
    // Block deleting tier if any orders or attendees already exist for it
    try {
      const orderCheck = await query('SELECT count(*) FROM order_items WHERE ticket_tier_id = $1', [numTierId]);
      const attCheck = await query('SELECT count(*) FROM attendees WHERE ticket_tier_id = $1', [numTierId]);
      const orderCount = orderCheck.rows ? parseInt(orderCheck.rows[0].count, 10) : 0;
      const attCount = attCheck.rows ? parseInt(attCheck.rows[0].count, 10) : 0;
      if (orderCount > 0 || attCount > 0) {
        const err = new Error('Cannot delete ticket tier with existing orders or issued tickets (TIER_DELETION_LOCKED)');
        err.statusCode = 409;
        err.code = 'TIER_DELETION_LOCKED';
        throw err;
      }
    } catch (checkErr) {
      if (checkErr.statusCode === 409 || checkErr.statusCode === 400) throw checkErr;
    }

    let found = false;

    try {
      const res = await query('DELETE FROM ticket_tiers WHERE id = $1 AND event_id = $2 RETURNING id', [numTierId, numEventId]);
      if (res.rowCount > 0) {
        found = true;
      }
    } catch (err) {
      try {
        const resSoft = await query('UPDATE ticket_tiers SET deleted_at = NOW(), is_hidden = true, updated_at = NOW() WHERE id = $1 AND event_id = $2 RETURNING id', [numTierId, numEventId]);
        if (resSoft.rowCount > 0) found = true;
      } catch (softErr) {
        console.warn('[TicketsService.deleteTier] DB soft-delete error:', softErr.message);
      }
    }

    const memTier = memoryTiers.get(numTierId);
    if (memTier && memTier.event_id === numEventId) {
      memoryTiers.delete(numTierId);
      found = true;
    }

    if (!found) {
      const err = new Error('Ticket tier not found');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }
}

export default new TicketsService();
