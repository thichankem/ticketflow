import { query } from '../config/db.js';
import { demoPromos } from '../data/demo-catalog.js';

const memoryPromos = new Map(demoPromos.map((promo) => [promo.id, { ...promo }]));
let nextPromoId = Math.max(...demoPromos.map((promo) => promo.id));

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

class PromosService {
  async createPromo(eventId, data, user = null) {
    const numEventId = Number(eventId);
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
    const {
      code,
      discount_type = 'PERCENTAGE',
      discount_amount = 10,
      max_uses = 100,
      ticket_tier_id = null,
    } = data;

    if (!code) {
      const err = new Error('Code is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanCode = stripHtml(code).toUpperCase().trim();

    if (discount_amount <= 0 || (discount_type === 'PERCENTAGE' && discount_amount > 100)) {
      const err = new Error('Invalid discount amount');
      err.statusCode = 400;
      throw err;
    }

    try {
      const sql = `
        INSERT INTO promo_codes (
          event_id, code, discount_type, discount, max_allowed_usages, order_usage_count,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [numEventId, cleanCode, discount_type, discount_amount, max_uses]);
      const row = res.rows[0];
      return {
        ...row,
        id: Number(row.id),
        event_id: Number(row.event_id),
        discount_amount: Number(row.discount),
        max_uses: row.max_allowed_usages,
        used_count: row.order_usage_count,
      };
    } catch (dbErr) {
      console.warn('[PromosService.createPromo] DB insert error, using fallback:', dbErr.message);
      // Fallback
      const id = ++nextPromoId;
      const promo = {
        id,
        event_id: numEventId,
        code: cleanCode,
        discount_type,
        discount_amount,
        max_uses,
        used_count: 0,
        ticket_tier_id: ticket_tier_id || null,
        is_active: true,
      };
      memoryPromos.set(id, promo);
      return promo;
    }
  }

  async validatePromo(eventId, code, subtotal = 0) {
    const numEventId = Number(eventId);
    const cleanCode = code.toUpperCase().trim();

    let promo = null;
    try {
      const sql = `
        SELECT * FROM promo_codes 
        WHERE event_id = $1 AND UPPER(code) = $2 AND deleted_at IS NULL 
        LIMIT 1
      `;
      const res = await query(sql, [numEventId, cleanCode]);
      if (res.rowCount > 0) {
        const row = res.rows[0];
        promo = {
          ...row,
          discount_amount: Number(row.discount),
          max_uses: row.max_allowed_usages,
          used_count: row.order_usage_count,
          is_active: true,
        };
      }
    } catch (dbErr) {
      console.warn('[PromosService.validatePromo] DB query error, using fallback:', dbErr.message);
    }

    if (!promo) {
      for (const p of memoryPromos.values()) {
        if (p.event_id === numEventId && p.code === cleanCode && p.is_active) {
          promo = p;
          break;
        }
      }
    }

    if (!promo) {
      const err = new Error('Invalid or inactive promo code');
      err.statusCode = 404;
      throw err;
    }

    const maxUses = promo.max_uses ?? promo.max_allowed_usages ?? 1000;
    const usedCount = promo.used_count ?? promo.order_usage_count ?? 0;
    const discountVal = Number(promo.discount_amount ?? promo.discount ?? 0);

    const expiry = promo.expiry_date || promo.expiry;
    if (expiry && new Date(expiry).getTime() < Date.now()) {
      const err = new Error('Promo code has expired');
      err.statusCode = 422;
      throw err;
    }

    if (usedCount >= maxUses) {
      const err = new Error('Promo code usage limit reached');
      err.statusCode = 422;
      throw err;
    }

    let discount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      discount = Math.floor((subtotal * discountVal) / 100);
    } else {
      discount = Math.min(subtotal, discountVal);
    }

    return {
      valid: true,
      promo,
      discount,
      new_total: Math.max(0, subtotal - discount),
    };
  }

  async incrementUsage(eventId, code) {
    const cleanCode = code.toUpperCase().trim();
    try {
      const res = await query(
        'UPDATE promo_codes SET order_usage_count = order_usage_count + 1 WHERE event_id = $1 AND UPPER(code) = $2 AND order_usage_count < max_allowed_usages RETURNING id, order_usage_count',
        [Number(eventId), cleanCode]
      );
      if (res.rowCount === 0) {
        const checkSql = 'SELECT order_usage_count, max_allowed_usages FROM promo_codes WHERE event_id = $1 AND UPPER(code) = $2';
        const chk = await query(checkSql, [Number(eventId), cleanCode]);
        if (chk.rowCount > 0 && chk.rows[0].order_usage_count >= chk.rows[0].max_allowed_usages) {
          const err = new Error('Promo code usage limit reached');
          err.statusCode = 422;
          throw err;
        }
      }
    } catch (dbErr) {
      if (dbErr.statusCode === 422) throw dbErr;
      for (const p of memoryPromos.values()) {
        if (p.event_id === Number(eventId) && p.code === cleanCode) {
          p.used_count += 1;
          break;
        }
      }
    }
  }

  async decrementUsage(eventId, code) {
    const cleanCode = code.toUpperCase().trim();
    try {
      await query(
        'UPDATE promo_codes SET order_usage_count = GREATEST(0, order_usage_count - 1) WHERE event_id = $1 AND UPPER(code) = $2',
        [Number(eventId), cleanCode]
      );
    } catch {
      for (const p of memoryPromos.values()) {
        if (p.event_id === Number(eventId) && p.code === cleanCode && p.used_count > 0) {
          p.used_count -= 1;
          break;
        }
      }
    }
  }

  getMemoryPromos() {
    return Array.from(memoryPromos.values());
  }

  async listPromos(eventId, user = null) {
    const numEventId = Number(eventId);
    const { default: eventsService } = await import('./events.service.js');
    const ev = await eventsService.getEventById(numEventId);
    if (user && user.role !== 'ADMIN' && ev && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }
    try {
      const sql = `
        SELECT 
          id,
          event_id,
          code,
          discount_type,
          discount,
          order_usage_count AS usages,
          order_usage_count AS used_count,
          max_allowed_usages AS max_uses,
          expiry_date AS expiry,
          created_at
        FROM promo_codes
        WHERE event_id = $1 AND deleted_at IS NULL
        ORDER BY id ASC
      `;
      const res = await query(sql, [numEventId]);
      return (res.rows || []).map(r => ({
        id: Number(r.id),
        event_id: Number(r.event_id),
        code: r.code,
        discount_type: r.discount_type,
        discount: Number(r.discount),
        usages: Number(r.usages),
        used_count: Number(r.used_count),
        max_uses: r.max_uses ? Number(r.max_uses) : null,
        expiry: r.expiry,
        created_at: r.created_at,
      }));
    } catch (dbErr) {
      console.warn('[PromosService.listPromos] DB error, using fallback:', dbErr.message);
    }

    const list = [];
    for (const p of memoryPromos.values()) {
      if (p.event_id === numEventId && p.is_active !== false) {
        list.push({
          id: p.id,
          event_id: p.event_id,
          code: p.code,
          discount_type: p.discount_type,
          discount: Number(p.discount_amount ?? p.discount ?? 0),
          usages: p.used_count ?? p.order_usage_count ?? 0,
          used_count: p.used_count ?? p.order_usage_count ?? 0,
          max_uses: p.max_uses ?? p.max_allowed_usages ?? null,
          expiry: p.expiry ?? p.expiry_date ?? null,
          created_at: p.created_at || new Date().toISOString(),
        });
      }
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async updatePromo(eventId, promoId, data, user = null) {
    const numEventId = Number(eventId);
    const numPromoId = Number(promoId);
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

    let existing = null;
    try {
      const checkRes = await query('SELECT * FROM promo_codes WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL', [numPromoId, numEventId]);
      if (checkRes.rowCount > 0) {
        existing = checkRes.rows[0];
      }
    } catch {}

    const memPromo = memoryPromos.get(numPromoId);
    if (!existing && memPromo && memPromo.event_id === numEventId && memPromo.is_active !== false) {
      existing = memPromo;
    }

    if (!existing) {
      const err = new Error('Promo code not found');
      err.statusCode = 404;
      throw err;
    }

    const {
      code,
      discount_type,
      discount_amount,
      discount,
      max_uses,
      expires_at,
      expiry,
    } = data;

    const newCode = code ? stripHtml(code).toUpperCase().trim() : existing.code;
    const newType = discount_type || existing.discount_type;
    const rawDiscount = discount_amount !== undefined ? discount_amount : (discount !== undefined ? discount : (existing.discount || existing.discount_amount));
    const newDiscount = Number(rawDiscount);

    if (newDiscount <= 0 || (newType === 'PERCENTAGE' && newDiscount > 100)) {
      const err = new Error('Invalid discount amount');
      err.statusCode = 400;
      throw err;
    }

    const newMaxUses = max_uses !== undefined ? (max_uses === null ? null : Number(max_uses)) : (existing.max_allowed_usages ?? existing.max_uses ?? null);
    const newExpiry = expires_at !== undefined ? expires_at : (expiry !== undefined ? expiry : (existing.expiry_date || existing.expiry || null));

    try {
      const sql = `
        UPDATE promo_codes
        SET code = $1, discount_type = $2, discount = $3, max_allowed_usages = $4, expiry_date = $5, updated_at = NOW()
        WHERE id = $6 AND event_id = $7
        RETURNING *
      `;
      const res = await query(sql, [newCode, newType, newDiscount, newMaxUses, newExpiry, numPromoId, numEventId]);
      if (res.rowCount > 0) {
        const row = res.rows[0];
        const updated = {
          ...row,
          id: Number(row.id),
          event_id: Number(row.event_id),
          code: row.code,
          discount_type: row.discount_type,
          discount: Number(row.discount),
          discount_amount: Number(row.discount),
          usages: Number(row.order_usage_count || 0),
          used_count: Number(row.order_usage_count || 0),
          max_uses: row.max_allowed_usages ? Number(row.max_allowed_usages) : null,
          expiry: row.expiry_date,
        };
        if (memPromo) Object.assign(memPromo, updated);
        return updated;
      }
    } catch (dbErr) {
      console.warn('[PromosService.updatePromo] DB error, using fallback:', dbErr.message);
    }

    if (memPromo) {
      memPromo.code = newCode;
      memPromo.discount_type = newType;
      memPromo.discount_amount = newDiscount;
      memPromo.discount = newDiscount;
      memPromo.max_uses = newMaxUses;
      memPromo.expiry = newExpiry;
      return {
        ...memPromo,
        usages: memPromo.used_count || 0,
      };
    }

    const fallbackPromo = {
      id: numPromoId,
      event_id: numEventId,
      code: newCode,
      discount_type: newType,
      discount: newDiscount,
      discount_amount: newDiscount,
      max_uses: newMaxUses,
      usages: 0,
      used_count: 0,
      expiry: newExpiry,
    };
    memoryPromos.set(numPromoId, fallbackPromo);
    return fallbackPromo;
  }

  async deletePromo(eventId, promoId, user = null) {
    const numEventId = Number(eventId);
    const numPromoId = Number(promoId);
    const { default: eventsService } = await import('./events.service.js');
    const ev = await eventsService.getEventById(numEventId);
    if (user && user.role !== 'ADMIN' && ev && Number(ev.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }
    let found = false;

    try {
      const res = await query(
        'UPDATE promo_codes SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND event_id = $2 RETURNING id',
        [numPromoId, numEventId]
      );
      if (res.rowCount > 0) found = true;
    } catch (dbErr) {
      try {
        const resDel = await query('DELETE FROM promo_codes WHERE id = $1 AND event_id = $2 RETURNING id', [numPromoId, numEventId]);
        if (resDel.rowCount > 0) found = true;
      } catch {}
    }

    const memPromo = memoryPromos.get(numPromoId);
    if (memPromo && memPromo.event_id === numEventId) {
      memoryPromos.delete(numPromoId);
      found = true;
    }

    if (!found) {
      const err = new Error('Promo code not found');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }
}

export default new PromosService();
