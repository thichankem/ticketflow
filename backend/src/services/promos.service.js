import { query } from '../config/db.js';
import { demoPromos } from '../data/demo-catalog.js';

const memoryPromos = new Map(demoPromos.map((promo) => [promo.id, { ...promo }]));
let nextPromoId = Math.max(...demoPromos.map((promo) => promo.id));

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

class PromosService {
  async createPromo(eventId, data) {
    const numEventId = Number(eventId);
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
          event_id, code, discount_type, discount_amount, max_uses, used_count,
          ticket_tier_id, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, true, NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [numEventId, cleanCode, discount_type, discount_amount, max_uses, ticket_tier_id]);
      return res.rows[0];
    } catch {
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
        WHERE event_id = $1 AND UPPER(code) = $2 AND is_active = true 
        LIMIT 1
      `;
      const res = await query(sql, [numEventId, cleanCode]);
      if (res.rowCount > 0) promo = res.rows[0];
    } catch {
      // Fallback
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

    if (promo.used_count >= promo.max_uses) {
      const err = new Error('Promo code usage limit reached');
      err.statusCode = 422;
      throw err;
    }

    let discount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      discount = Math.floor((subtotal * promo.discount_amount) / 100);
    } else {
      discount = Math.min(subtotal, promo.discount_amount);
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
      await query(
        'UPDATE promo_codes SET used_count = used_count + 1 WHERE event_id = $1 AND UPPER(code) = $2',
        [Number(eventId), cleanCode]
      );
    } catch {
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
        'UPDATE promo_codes SET used_count = GREATEST(0, used_count - 1) WHERE event_id = $1 AND UPPER(code) = $2',
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
}

export default new PromosService();
