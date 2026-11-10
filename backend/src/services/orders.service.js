import { withTransaction, reserveTickets, releaseTickets, query, InventoryExhaustedError } from '../config/db.js';
import ticketsService from './tickets.service.js';
import promosService from './promos.service.js';

const memoryOrders = new Map();
const memoryAttendees = new Map();
let nextOrderId = 100;
let nextAttendeeId = 200;

class OrdersService {
  async reserveOrder({ eventId, items = [], promoCode = null, user = null }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Cart must contain at least one ticket item');
      err.statusCode = 400;
      throw err;
    }

    // 1. Validate constraints for each item
    for (const it of items) {
      if (!it.ticket_tier_id || typeof it.quantity !== 'number' || it.quantity <= 0) {
        const err = new Error('Invalid ticket tier ID or quantity <= 0');
        err.statusCode = 400;
        throw err;
      }
      const tier = await ticketsService.getTierById(it.ticket_tier_id);
      if (!tier) {
        const err = new Error(`Ticket tier ${it.ticket_tier_id} not found`);
        err.statusCode = 404;
        throw err;
      }
      if (it.quantity > tier.max_per_order) {
        const err = new Error(`Quantity ${it.quantity} exceeds maximum allowed of ${tier.max_per_order}`);
        err.statusCode = 400;
        throw err;
      }
      if (it.quantity < tier.min_per_order) {
        const err = new Error(`Quantity ${it.quantity} below minimum required of ${tier.min_per_order}`);
        err.statusCode = 400;
        throw err;
      }
    }

    let reservedItems = [];
    let subtotal = 0;

    // 2. Try PostgreSQL atomic reservation first
    try {
      await withTransaction(async (client) => {
        await reserveTickets(client, items);
      });

      for (const it of items) {
        const tier = await ticketsService.getTierById(it.ticket_tier_id);
        const itemTotal = tier.price * it.quantity;
        subtotal += itemTotal;
        reservedItems.push({
          ticket_tier_id: tier.id,
          name: tier.name || tier.title,
          quantity: it.quantity,
          unit_price: tier.price,
          total_price: itemTotal,
        });
      }
    } catch (pgError) {
      if (pgError.statusCode === 409 || pgError instanceof InventoryExhaustedError) {
        const err = new Error('One or more ticket tiers are sold out or have insufficient quantity');
        err.name = 'InventoryExhaustedError';
        err.statusCode = 409;
        throw err;
      }

      // Fallback to in-memory atomic decrement
      // Lock check: check if any item exceeds remaining
      for (const it of items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        if (!memTier || memTier.remaining_quantity < it.quantity) {
          const err = new Error('One or more ticket tiers are sold out or have insufficient quantity');
          err.name = 'InventoryExhaustedError';
          err.statusCode = 409;
          throw err;
        }
      }

      // Execute decrement
      reservedItems = [];
      subtotal = 0;
      for (const it of items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        memTier.remaining_quantity -= it.quantity;
        const itemTotal = memTier.price * it.quantity;
        subtotal += itemTotal;
        reservedItems.push({
          ticket_tier_id: memTier.id,
          name: memTier.name || memTier.title,
          quantity: it.quantity,
          unit_price: memTier.price,
          total_price: itemTotal,
        });
      }
    }

    // 3. Calculate promo discount if provided
    let discount = 0;
    let appliedPromo = null;
    if (promoCode && eventId) {
      try {
        const promoRes = await promosService.validatePromo(eventId, promoCode, subtotal);
        if (promoRes.valid) {
          discount = promoRes.discount;
          appliedPromo = promoRes.promo;
          await promosService.incrementUsage(eventId, promoCode);
        }
      } catch {
        // Promo invalid or limit reached, ignore or continue
      }
    }

    const total = Math.max(0, subtotal - discount);
    let orderId = ++nextOrderId;
    let orderShortId = `ORD-${1000 + orderId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Persist reservation order to PostgreSQL
    try {
      const publicId = `ord_pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const shortId = `ord_${Date.now().toString().slice(-6)}`;
      const orderInsertSql = `
        INSERT INTO orders (
          short_id, public_id, event_id, user_id, status, subtotal, total_before_additions,
          discount_amount, total_gross, promo_code, reserved_until, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id, short_id, public_id, status
      `;
      const orderRes = await query(orderInsertSql, [
        shortId,
        publicId,
        Number(eventId),
        user ? user.id : null,
        subtotal,
        discount,
        total,
        appliedPromo ? appliedPromo.code : null,
        expiresAt,
      ]);
      if (orderRes.rowCount > 0) {
        orderId = Number(orderRes.rows[0].id);
        orderShortId = orderRes.rows[0].short_id;
      }
    } catch (dbOrderErr) {
      console.warn('[OrdersService.reserveOrder] DB order insert error, using memory order ID:', dbOrderErr.message);
    }

    const orderRecord = {
      id: orderId,
      orderShortId,
      event_id: Number(eventId),
      user_id: user ? user.id : null,
      items: reservedItems,
      subtotal,
      discount,
      total,
      promo_code: appliedPromo ? appliedPromo.code : null,
      status: 'RESERVED',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    memoryOrders.set(orderId, orderRecord);

    return {
      orderId: orderRecord.id,
      order_id: orderRecord.id,
      orderShortId: orderRecord.orderShortId,
      order: orderRecord,
      expires_at: orderRecord.expires_at,
      total: orderRecord.total,
      status: orderRecord.status,
    };
  }

  async getOrderById(orderId, user = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [numId]);
        if (res.rowCount > 0) {
          const row = res.rows[0];
          order = {
            id: Number(row.id),
            orderShortId: row.short_id,
            event_id: Number(row.event_id),
            user_id: row.user_id ? Number(row.user_id) : null,
            subtotal: Number(row.subtotal),
            discount: Number(row.discount_amount),
            total: Number(row.total_gross),
            status: row.status,
            buyer: { name: row.first_name || '', email: row.email || '' },
            items: [],
          };
          memoryOrders.set(numId, order);
        }
      } catch {}
    }

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check: if order belongs to a specific user, ensure requesting user is owner or ADMIN
    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
        const err = new Error('Forbidden: You do not own this order');
        err.statusCode = 403;
        throw err;
      }
    }

    return order;
  }

  async checkoutOrder(orderId, { buyer = {}, attendees = [], payment_method = 'OFFLINE', payment_intent_id = null }) {
    const numId = Number(orderId);
    const order = memoryOrders.get(numId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.status !== 'RESERVED') {
      const err = new Error(`Cannot checkout order in ${order.status} state`);
      err.statusCode = 400;
      throw err;
    }

    if (!buyer.name || !buyer.email) {
      const err = new Error('Buyer name and email are required');
      err.statusCode = 400;
      throw err;
    }

    order.buyer = {
      name: buyer.name,
      email: buyer.email.toLowerCase().trim(),
    };
    order.payment_method = payment_method;
    order.payment_intent_id = payment_intent_id;

    // Issue barcodes and attendees
    const createdAttendees = [];
    const attendeeSource = attendees && attendees.length > 0 ? attendees : [{ name: buyer.name, email: buyer.email }];

    for (const att of attendeeSource) {
      let attId = ++nextAttendeeId;
      const barcode = `TKT-${order.id}-${attId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Persist attendee to PostgreSQL
      try {
        const publicId = `att_pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const shortId = `att_${Date.now().toString().slice(-6)}`;
        const attRes = await query(`
          INSERT INTO attendees (
            short_id, public_id, order_id, ticket_tier_id, event_id,
            first_name, last_name, email, status, barcode, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, 'ACTIVE', $8, NOW(), NOW())
          RETURNING id, short_id, public_id, barcode
        `, [
          shortId,
          publicId,
          order.id,
          att.ticket_tier_id || (order.items[0] && order.items[0].ticket_tier_id),
          order.event_id,
          att.name || buyer.name,
          (att.email || buyer.email).toLowerCase().trim(),
          barcode,
        ]);
        if (attRes.rowCount > 0) {
          attId = Number(attRes.rows[0].id);
        }
      } catch (dbAttErr) {
        // Fallback
      }

      const attendeeRecord = {
        id: attId,
        order_id: order.id,
        event_id: order.event_id,
        name: att.name || buyer.name,
        email: (att.email || buyer.email).toLowerCase().trim(),
        ticket_tier_id: att.ticket_tier_id || (order.items[0] && order.items[0].ticket_tier_id),
        barcode,
        status: 'ACTIVE',
      };
      memoryAttendees.set(attId, attendeeRecord);
      createdAttendees.push(attendeeRecord);
    }

    order.attendees = createdAttendees;
    order.status = 'COMPLETED';

    try {
      await query(`
        UPDATE orders
        SET status = 'COMPLETED', first_name = $1, email = $2, updated_at = NOW()
        WHERE id = $3
      `, [buyer.name, buyer.email, numId]);
    } catch {}

    return {
      order,
      attendees: createdAttendees,
    };
  }

  async cancelOrder(orderId, user = null) {
    const numId = Number(orderId);
    const order = memoryOrders.get(numId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check
    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
        const err = new Error('Forbidden: You do not own this order');
        err.statusCode = 403;
        throw err;
      }
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Order already cancelled');
      err.statusCode = 400;
      throw err;
    }

    // Restore inventory in PostgreSQL or memory
    try {
      await releaseTickets(null, order.items);
    } catch {
      for (const item of order.items) {
        const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
        if (memTier) {
          memTier.remaining_quantity += item.quantity;
        }
      }
    }

    // Restore promo code usage if applied
    if (order.promo_code && order.event_id) {
      await promosService.decrementUsage(order.event_id, order.promo_code);
    }

    order.status = 'CANCELLED';
    try {
      await query(`UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [numId]);
    } catch {}
    return {
      message: 'Order cancelled and inventory restored',
      order,
    };
  }

  async checkInAttendee(eventId, { barcode, attendee_id }) {
    const numEventId = Number(eventId);
    if (!barcode && !attendee_id) {
      const err = new Error('Barcode or attendee_id is required');
      err.statusCode = 400;
      throw err;
    }

    let target = null;
    try {
      let sql = 'SELECT * FROM attendees WHERE event_id = $1';
      const params = [numEventId];
      if (barcode) {
        sql += ' AND barcode = $2';
        params.push(barcode);
      } else {
        sql += ' AND id = $2';
        params.push(Number(attendee_id));
      }
      sql += ' LIMIT 1';
      const res = await query(sql, params);
      if (res.rowCount > 0) {
        target = res.rows[0];
        target.name = target.first_name || target.email;
      }
    } catch (dbErr) {
      // Fallback to memory
    }

    if (!target) {
      for (const att of memoryAttendees.values()) {
        if (att.event_id === numEventId) {
          if ((barcode && att.barcode === barcode) || (attendee_id && att.id === Number(attendee_id))) {
            target = att;
            break;
          }
        }
      }
    }

    if (!target) {
      const err = new Error('Attendee ticket not found');
      err.statusCode = 404;
      throw err;
    }

    if (target.status === 'CHECKED_IN') {
      const err = new Error('Attendee has already been checked in');
      err.name = 'AlreadyCheckedInError';
      err.statusCode = 409;
      throw err;
    }

    target.status = 'CHECKED_IN';
    target.checked_in_at = new Date().toISOString();

    try {
      await query(`UPDATE attendees SET status = 'CHECKED_IN', checked_in_at = NOW() WHERE id = $1`, [target.id]);
    } catch {}

    return {
      message: 'Attendee checked in successfully',
      attendee: target,
    };
  }
}

export default new OrdersService();
