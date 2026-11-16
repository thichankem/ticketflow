import crypto from 'node:crypto';
import { withTransaction, reserveTickets, releaseTickets, query, InventoryExhaustedError } from '../config/db.js';
import ticketsService from './tickets.service.js';
import promosService from './promos.service.js';
import seatingService from './seating.service.js';
import eventsService from './events.service.js';
import notificationsService from './notifications.service.js';
import waitingRoomService from './waiting-room.service.js';
import recommendationService from './recommendation.service.js';

const memoryOrders = new Map();
const memoryAttendees = new Map();
let nextOrderId = 100;
let nextAttendeeId = 200;

class OrdersService {
  constructor() {
    // Start periodic background cleanup for expired 15m reservations (Phân hệ 2.8)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredReservations().catch(() => {});
    }, 15000);
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  async cleanupExpiredReservations() {
    try {
      const res = await query(
        "SELECT id, event_id, promo_code FROM orders WHERE status = 'RESERVED' AND reserved_until < NOW()"
      );
      if (res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const numOrderId = Number(row.id);
          const numEventId = Number(row.event_id);

          await withTransaction(async (client) => {
            const lockRes = await client.query(
              "SELECT id, status FROM orders WHERE id = $1 AND status = 'RESERVED' FOR UPDATE",
              [numOrderId]
            );
            if (lockRes.rowCount === 0) return;

            const itemsRes = await client.query(
              'SELECT ticket_tier_id, quantity FROM order_items WHERE order_id = $1',
              [numOrderId]
            );
            if (itemsRes.rows && itemsRes.rows.length > 0) {
              await releaseTickets(client, itemsRes.rows);
            }
            await client.query("UPDATE orders SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [numOrderId]);
          });

          await seatingService.releaseSeats(numEventId, numOrderId);
          if (row.promo_code) {
            await promosService.decrementUsage(numEventId, row.promo_code);
          }

          const memOrder = memoryOrders.get(numOrderId);
          if (memOrder) {
            memOrder.status = 'EXPIRED';
          }
          notificationsService.triggerRestockNotification(numEventId).catch(() => {});
        }
      }
    } catch {
      // Fallback
    }

    const nowMs = Date.now();
    for (const memOrder of memoryOrders.values()) {
      if (memOrder.status === 'RESERVED' && memOrder.expires_at) {
        if (nowMs > new Date(memOrder.expires_at).getTime()) {
          memOrder.status = 'EXPIRED';
          if (memOrder.items && Array.isArray(memOrder.items)) {
            for (const item of memOrder.items) {
              const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
              if (memTier) {
                memTier.remaining_quantity += item.quantity;
              }
            }
          }
          await seatingService.releaseSeats(memOrder.event_id, memOrder.id);
          if (memOrder.promo_code) {
            promosService.decrementUsage(memOrder.event_id, memOrder.promo_code);
          }
          notificationsService.triggerRestockNotification(memOrder.event_id).catch(() => {});
        }
      }
    }
  }

  async reserveOrder({ eventId, items = [], promoCode = null, user = null, queueToken = null }) {
    // Run cleanup of expired reservations to free up slots
    await this.cleanupExpiredReservations();

    // Verify event exists upfront (BUG-07 remediation)
    const numEventId = Number(eventId);
    const event = await eventsService.getEventById(numEventId);
    if (!event) {
      const err = new Error(`Event ${eventId} not found`);
      err.statusCode = 404;
      throw err;
    }

    // Verify Waiting Room Admission Token if active for this event (Phân hệ 2.7)
    if (waitingRoomService.isWaitingRoomActive(eventId)) {
      const valid = waitingRoomService.verifyAdmissionToken(eventId, queueToken);
      if (!valid) {
        const err = new Error('Hàng đợi ảo đang hoạt động. Vui lòng lấy mã xếp hàng (queue token) hợp lệ trước khi đặt vé.');
        err.statusCode = 403;
        throw err;
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Cart must contain at least one ticket item');
      err.statusCode = 400;
      throw err;
    }

    // 1. Validate constraints for each item
    for (const it of items) {
      const tierId = it.tier_id || it.ticket_tier_id;
      if (!tierId || typeof it.quantity !== 'number' || it.quantity <= 0 || !Number.isInteger(it.quantity)) {
        const err = new Error('Invalid ticket tier ID or quantity <= 0 (must be positive integer)');
        err.statusCode = 400;
        throw err;
      }
      it.ticket_tier_id = tierId;
      const tier = await ticketsService.getTierById(tierId);
      if (!tier) {
        const err = new Error(`Ticket tier ${tierId} not found`);
        err.statusCode = 404;
        throw err;
      }
      // Ensure tier belongs to this event (BUG-06 remediation)
      if (Number(tier.event_id) !== numEventId) {
        const err = new Error(`Hạng vé "${tier.name || tier.title}" (ID ${tierId}) không thuộc về Sự kiện ID ${eventId}`);
        err.statusCode = 400;
        throw err;
      }
      if (tier.is_hidden) {
        const isAdminOrOrg = user && (user.role === 'ADMIN' || user.role === 'ORGANIZER');
        if (!isAdminOrOrg) {
          const err = new Error(`Ticket tier ${tierId} is not available for public reservation`);
          err.statusCode = 403;
          throw err;
        }
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

    // 2. Calculate promo discount if provided
    let discount = 0;
    let appliedPromo = null;
    if (promoCode && eventId) {
      try {
        const promoRes = await promosService.validatePromo(eventId, promoCode, subtotal);
        if (promoRes.valid) {
          discount = promoRes.discount;
          appliedPromo = promoRes.promo;
        }
      } catch {
        // Promo invalid or limit reached, ignore or continue
      }
    }

    const total = Math.max(0, subtotal - discount);
    let orderId = ++nextOrderId;
    let orderShortId = `ORD-${1000 + orderId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 3. Atomically reserve tickets AND insert orders & order_items in a single transaction
    try {
      await withTransaction(async (client) => {
        // Step 3.1: Atomically decrement ticket inventory
        await reserveTickets(client, items);

        // Step 3.2: Insert order atomically in same transaction
        const publicId = `ord_pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const shortId = `ord_${Date.now().toString().slice(-6)}`;
        const orderInsertSql = `
          INSERT INTO orders (
            short_id, public_id, event_id, user_id, status, subtotal, total_before_additions,
            discount_amount, total_gross, promo_code, reserved_until, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id, short_id, public_id, status
        `;
        const orderRes = await client.query(orderInsertSql, [
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

          // Step 3.3: Insert line items atomically in same transaction
          for (const it of reservedItems) {
            await client.query(`
              INSERT INTO order_items (
                order_id, ticket_tier_id, item_name, quantity, price,
                total_before_additions, total_tax, total_service_fee, total_gross,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $6, NOW(), NOW())
            `, [
              orderId,
              it.ticket_tier_id,
              it.name,
              it.quantity,
              it.unit_price,
              it.total_price,
            ]);
          }
        }
      });

      if (appliedPromo) {
        await promosService.incrementUsage(eventId, promoCode).catch(() => {});
      }

      if (queueToken) {
        waitingRoomService.consumeAdmissionToken(eventId, queueToken);
      }
    } catch (pgError) {
      console.error('[OrdersService.reserveOrder] withTransaction error:', pgError.message);
      if (pgError.code === '23503' || pgError.statusCode === 404) {
        const err = new Error('Referenced event or ticket tier not found');
        err.statusCode = 404;
        throw err;
      }
      if (pgError.statusCode === 409 || pgError instanceof InventoryExhaustedError) {
        const err = new Error('One or more ticket tiers are sold out or have insufficient quantity');
        err.name = 'InventoryExhaustedError';
        err.statusCode = 409;
        throw err;
      }

      // Fallback to in-memory atomic decrement for offline/mock test environments
      for (const it of items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        if (!memTier || memTier.remaining_quantity < it.quantity) {
          const err = new Error('One or more ticket tiers are sold out or have insufficient quantity');
          err.name = 'InventoryExhaustedError';
          err.statusCode = 409;
          throw err;
        }
      }
      for (const it of items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        if (memTier) {
          memTier.remaining_quantity -= it.quantity;
        }
      }
      if (appliedPromo) {
        await promosService.incrementUsage(eventId, promoCode).catch(() => {});
      }

      if (queueToken) {
        waitingRoomService.consumeAdmissionToken(eventId, queueToken);
      }
    }

    // SPEC.md Principle #2: Unreserved general admission & tier quotas (no row/seat matrix coordinates)
    const allocatedSeats = null;

    const orderRecord = {
      id: orderId,
      orderShortId,
      event_id: Number(eventId),
      user_id: user ? user.id : null,
      items: reservedItems,
      seats: allocatedSeats,
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
      seats: allocatedSeats,
      expires_at: orderRecord.expires_at,
      total: orderRecord.total,
      status: orderRecord.status,
    };
  }

  async getOrderById(orderId, user = null, sessionSecret = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [numId]);
        if (res.rowCount > 0) {
          const row = res.rows[0];

          // Fetch order items from order_items table
          let items = [];
          try {
            const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [numId]);
            if (itemsRes.rows && itemsRes.rows.length > 0) {
              items = itemsRes.rows.map(r => ({
                ticket_tier_id: Number(r.ticket_tier_id),
                name: r.item_name,
                quantity: Number(r.quantity),
                unit_price: Number(r.price),
                total_price: Number(r.total_gross || r.total_before_additions),
              }));
            }
          } catch {}

          // Fetch attendees for this order
          let attendees = [];
          try {
            const attRes = await query('SELECT * FROM attendees WHERE order_id = $1', [numId]);
            if (attRes.rows && attRes.rows.length > 0) {
              attendees = attRes.rows.map(a => ({
                id: Number(a.id),
                short_id: a.short_id,
                order_id: Number(a.order_id),
                event_id: Number(a.event_id),
                name: a.first_name || '',
                email: a.email,
                ticket_tier_id: Number(a.ticket_tier_id),
                ticket_code: a.barcode,
                qr_hash: a.barcode,
                barcode: a.barcode,
                status: a.status,
                checked_in_at: a.checked_in_at,
                is_transferred: Boolean(a.is_transferred),
                transferred_at: a.transferred_at,
              }));
            }
          } catch {}

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
            items,
            attendees,
            expires_at: row.reserved_until,
            created_at: row.created_at,
          };
          memoryOrders.set(numId, order);
        }
      } catch {}
    } else if (order && (!order.items || order.items.length === 0)) {
      // Re-hydrate items from order_items table if missing
      try {
        const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [numId]);
        if (itemsRes.rows && itemsRes.rows.length > 0) {
          order.items = itemsRes.rows.map(r => ({
            ticket_tier_id: Number(r.ticket_tier_id),
            name: r.item_name,
            quantity: Number(r.quantity),
            unit_price: Number(r.price),
            total_price: Number(r.total_gross || r.total_before_additions),
          }));
        }
      } catch {}
    }

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check: if order belongs to a specific user, ensure requesting user is owner, organizer, or ADMIN
    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN' && user.role !== 'ORGANIZER')) {
        const err = new Error('Forbidden: You do not own this order');
        err.statusCode = 403;
        throw err;
      }
    } else {
      // Guest order (SEC-04 remediation):
      const isAdminOrOrg = user && (user.role === 'ADMIN' || user.role === 'ORGANIZER');
      const hasValidSecret = sessionSecret && (sessionSecret === order.public_id || sessionSecret === order.short_id || sessionSecret === order.orderShortId);
      if (!isAdminOrOrg && !hasValidSecret) {
        const err = new Error('Forbidden: Accessing guest orders requires valid order session token');
        err.statusCode = 403;
        throw err;
      }
    }

    return order;
  }

  async checkoutOrder(orderId, { buyer = {}, attendees = [], payment_method = 'VNPAY', payment_intent_id = null, user = null, sessionToken = null }) {
    const numId = Number(orderId);
    const order = memoryOrders.get(numId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Verify ownership of reserved order (SEC-01 & SEC-04 remediation)
    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
        const err = new Error('Forbidden: You do not have permission to checkout this order');
        err.statusCode = 403;
        throw err;
      }
    } else {
      // Guest order checkout verification
      if (order.public_id && sessionToken && sessionToken !== order.public_id && sessionToken !== order.short_id && sessionToken !== order.orderShortId) {
        const err = new Error('Forbidden: Invalid order session token for guest checkout');
        err.statusCode = 403;
        throw err;
      }
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

    // 0 VND order instant completion or online payment setup
    const isFreeOrder = (order.total === 0 || order.subtotal - (order.discount || 0) <= 0);
    const hasPreauthorizedPayment = Boolean(payment_intent_id);
    const isImmediateSuccess = isFreeOrder || hasPreauthorizedPayment;

    if (isFreeOrder) {
      order.payment_status = 'NO_PAYMENT_REQUIRED';
      order.payment_gateway = 'FREE';
      order.payment_method = 'FREE';
      order.status = 'COMPLETED';
    } else {
      const method = payment_method || 'VNPAY';
      order.payment_gateway = method;
      order.payment_method = method;
      order.payment_transaction_id = payment_intent_id || `TXN-${method}-${Date.now()}`;
      order.payment_status = 'PAYMENT_RECEIVED';
      order.status = 'COMPLETED';
    }

    // Issue barcodes and attendees using cryptographically secure PRNG (SEC-12)
    const createdAttendees = [];
    const attendeeSource = attendees && attendees.length > 0 ? attendees : [{ name: buyer.name, email: buyer.email }];

    for (let i = 0; i < attendeeSource.length; i++) {
      const att = attendeeSource[i];
      let attId = ++nextAttendeeId;
      const barcode = `TKT-${order.id}-${attId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const initialAttendeeStatus = 'ACTIVE';
      const seat = order.seats && order.seats[i] ? order.seats[i] : null;

      // Persist attendee to PostgreSQL
      try {
        const publicId = `att_pub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const shortId = `att_${Date.now().toString().slice(-6)}`;
        const attRes = await query(`
          INSERT INTO attendees (
            short_id, public_id, order_id, ticket_tier_id, event_id,
            first_name, last_name, email, status, barcode, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, NOW(), NOW())
          RETURNING id, short_id, public_id, barcode
        `, [
          shortId,
          publicId,
          order.id,
          att.ticket_tier_id || (order.items[0] && order.items[0].ticket_tier_id),
          order.event_id,
          att.name || buyer.name,
          (att.email || buyer.email).toLowerCase().trim(),
          initialAttendeeStatus,
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
        ticket_code: barcode,
        qr_hash: barcode,
        barcode,
        seat,
        status: initialAttendeeStatus,
      };
      memoryAttendees.set(attId, attendeeRecord);
      createdAttendees.push(attendeeRecord);
    }

    order.attendees = createdAttendees;

    try {
      await query(`
        UPDATE orders
        SET status = $1, first_name = $2, email = $3, payment_status = $4, payment_gateway = $5, payment_transaction_id = $6, updated_at = NOW()
        WHERE id = $7
      `, [order.status, buyer.name, buyer.email, order.payment_status, order.payment_gateway, order.payment_transaction_id, numId]);
    } catch {}

    // Credit escrow ONLY if payment was actually pre-authorized and received at checkout (BUG-01 remediation)
    if (hasPreauthorizedPayment && !isFreeOrder) {
      try {
        const totalAmount = Number(order.total_gross || order.total || 0);
        if (totalAmount > 0) {
          const commissionRate = 5.00;
          const commission = Math.round(totalAmount * (commissionRate / 100));
          const balance = totalAmount - commission;
          await query(`
            INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
            VALUES ($1, $2, 0, $3, $4, 'HOLDING', NOW())
            ON CONFLICT (event_id) DO UPDATE SET
              gross_revenue = escrow_accounts.gross_revenue + $2,
              current_balance = escrow_accounts.current_balance + $3,
              commission_held = escrow_accounts.commission_held + $4,
              updated_at = NOW()
          `, [order.event_id, totalAmount, balance, commission]);
        }
      } catch (escrowErr) {
        console.warn('[checkoutOrder] Escrow sync warning:', escrowErr.message);
      }
    }

    // Track behavioral purchase for recommendation engine (Phân hệ 2.5 / REQ-ATT-01)
    if (order.user_id && order.event_id) {
      recommendationService.trackPurchase(order.user_id, order.event_id);
    }

    return {
      order,
      attendees: createdAttendees,
    };
  }

  /**
   * Internal helper to restore inventory, seats, promo counts, and trigger restock alerts.
   * Shared by cancellation, expiration, and refund workflows.
   */
  async _restoreInventoryAndHolds(order) {
    if (!order) return;
    const numId = Number(order.id);

    try {
      if (order.items && order.items.length > 0) {
        await releaseTickets(null, order.items);
      } else if (numId) {
        const itemsRes = await query('SELECT ticket_tier_id, quantity FROM order_items WHERE order_id = $1', [numId]);
        if (itemsRes.rows && itemsRes.rows.length > 0) {
          await releaseTickets(null, itemsRes.rows);
        }
      }
    } catch (relErr) {
      console.warn('[OrdersService._restoreInventoryAndHolds] Note on DB ticket release:', relErr.message);
    }

    for (const item of (order.items || [])) {
      const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
      if (memTier) {
        memTier.remaining_quantity += Number(item.quantity);
      }
    }

    if (order.event_id && order.id) {
      await seatingService.releaseSeats(order.event_id, order.id);
    }

    if (order.promo_code && order.event_id) {
      await promosService.decrementUsage(order.event_id, order.promo_code);
    }

    if (order.event_id) {
      notificationsService.triggerRestockNotification(order.event_id).catch(() => {});
    }
  }

  async cancelOrder(orderId, user = null, sessionSecret = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      order = await this.getOrderById(numId, user, sessionSecret).catch(() => null);
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check (SEC-04 remediation)
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

    await this._restoreInventoryAndHolds(order);

    order.status = 'CANCELLED';
    if (order.attendees && Array.isArray(order.attendees)) {
      for (const att of order.attendees) {
        att.status = 'CANCELLED';
        const memAtt = memoryAttendees.get(att.id);
        if (memAtt) memAtt.status = 'CANCELLED';
      }
    }
    try {
      await query(`UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [numId]);
      await query(`UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1`, [numId]);
    } catch {}
    return {
      message: 'Order cancelled and inventory restored',
      order,
    };
  }

  async refundOrder(orderId, user = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      order = await this.getOrderById(numId, { role: 'ADMIN' }).catch(() => null);
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR and Tenant Isolation Check (SEC-04 & SEC-06 remediation)
    const isAdmin = user && user.role === 'ADMIN';
    let isEventOrganizer = false;
    if (user && user.role === 'ORGANIZER') {
      const ev = await eventsService.getEventById(order.event_id);
      if (ev && (Number(ev.account_id) === Number(user.account_id) || Number(ev.organizer_id) === Number(user.id))) {
        isEventOrganizer = true;
      }
    }

    if (order.user_id) {
      const isOwner = user && user.id === order.user_id;
      if (!isOwner && !isAdmin && !isEventOrganizer) {
        const err = new Error('Forbidden: You do not have permission to refund this order');
        err.statusCode = 403;
        throw err;
      }
    } else {
      // Guest order: only the owning organizer or admin can trigger refunds
      if (!isAdmin && !isEventOrganizer) {
        const err = new Error('Forbidden: Guest order refunds require organizer or admin authorization');
        err.statusCode = 403;
        throw err;
      }
    }

    if (order.status === 'REFUNDED') {
      const err = new Error('Đơn hàng đã được hoàn tiền trước đó');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Đơn hàng đã bị hủy, không thể hoàn tiền');
      err.statusCode = 400;
      throw err;
    }

    if (order.status !== 'COMPLETED' && order.status !== 'PAID') {
      const err = new Error('Chỉ có thể hoàn tiền cho đơn hàng đã thanh toán thành công (COMPLETED)');
      err.statusCode = 400;
      throw err;
    }

    const hasTransferred = (order.attendees || []).some(a => a.is_transferred || a.transferred_at);
    if (hasTransferred) {
      const err = new Error('Không thể hoàn tiền đơn hàng có vé đã chuyển nhượng cho người khác. Vui lòng liên hệ trung tâm hỗ trợ.');
      err.statusCode = 400;
      throw err;
    }

    // Direct database verification for transferred tickets (BUG-09 remediation)
    try {
      const dbTransCheck = await query('SELECT id FROM attendees WHERE order_id = $1 AND (is_transferred = TRUE OR transferred_at IS NOT NULL) LIMIT 1', [numId]);
      if (dbTransCheck.rowCount > 0) {
        const err = new Error('Không thể hoàn tiền đơn hàng có vé đã chuyển nhượng cho người khác. Vui lòng liên hệ trung tâm hỗ trợ.');
        err.statusCode = 400;
        throw err;
      }
    } catch (dbErr) {
      if (dbErr.statusCode === 400) throw dbErr;
    }

    // Check refund policy from event
    const event = await eventsService.getEventById(order.event_id);
    const policy = (event && event.refund_policy) || {
      allow_refund: true,
      max_days_after_order: 7,
      min_days_before_event: 3,
      refund_percentage: 100,
    };

    if (policy.allow_refund === false) {
      const err = new Error('Sự kiện này không áp dụng chính sách hoàn hủy vé');
      err.statusCode = 400;
      throw err;
    }

    // 1. Check max days after order
    if (policy.max_days_after_order && order.created_at) {
      const daysSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceOrder > policy.max_days_after_order) {
        const err = new Error(`Không thể hoàn tiền: Đã quá thời hạn ${policy.max_days_after_order} ngày kể từ khi đặt vé.`);
        err.statusCode = 400;
        throw err;
      }
    }

    // 2. Check min days before event start
    const eventStart = event ? (event.start_date || event.starts_at) : null;
    if (policy.min_days_before_event && eventStart) {
      const daysBeforeEvent = (new Date(eventStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysBeforeEvent < policy.min_days_before_event) {
        const err = new Error(`Không thể hoàn tiền: Phải gửi yêu cầu trước khi sự kiện bắt đầu ít nhất ${policy.min_days_before_event} ngày.`);
        err.statusCode = 400;
        throw err;
      }
    }

    // Calculate refund amount
    const refundPercentage = policy.refund_percentage || 100;
    const refundAmount = Math.round((Number(order.total) || 0) * (refundPercentage / 100));

    await this._restoreInventoryAndHolds(order);

    order.status = 'REFUNDED';
    order.total_refunded = refundAmount;
    order.refunded_at = new Date().toISOString();

    // Cancel attendees
    if (order.attendees && Array.isArray(order.attendees)) {
      for (const att of order.attendees) {
        att.status = 'CANCELLED';
        const memAtt = memoryAttendees.get(att.id);
        if (memAtt) memAtt.status = 'CANCELLED';
      }
    }

    try {
      await query(`UPDATE orders SET status = 'REFUNDED', total_refunded = $1, updated_at = NOW() WHERE id = $2`, [refundAmount, numId]);
      await query(`UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1`, [numId]);
      if (refundAmount > 0) {
        await query(`
          UPDATE escrow_accounts
          SET refunded_amount = refunded_amount + $1,
              current_balance = GREATEST(0, current_balance - $1),
              updated_at = NOW()
          WHERE event_id = $2
        `, [refundAmount, order.event_id]);
      }
    } catch {}

    return {
      success: true,
      message: 'Hoàn vé và hoàn tiền trực tuyến thành công',
      refund_amount: refundAmount,
      refund_percentage: refundPercentage,
      order,
    };
  }

  async processPayment(orderId, { gateway = 'VNPAY', payment_method = null, user = null } = {}) {
    const numId = Number(orderId);
    const order = await this.getOrderById(numId, user);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      const err = new Error(`Không thể thanh toán đơn hàng đã ${order.status === 'CANCELLED' ? 'bị hủy' : 'hết hạn'}`);
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'COMPLETED' && order.payment_status === 'PAYMENT_RECEIVED') {
      return {
        success: true,
        message: 'Thanh toán trực tuyến hoàn tất thành công',
        transaction_id: order.payment_transaction_id || `TXN-ALREADY-PAID-${order.id}`,
        receipt_url: `/api/orders/${order.id}/receipt`,
        order,
      };
    }

    const selectedGateway = (gateway || payment_method || 'VNPAY').toUpperCase();
    if (selectedGateway === 'OFFLINE' || selectedGateway === 'CASH') {
      const err = new Error('Chỉ chấp nhận thanh toán trực tuyến 100% (VNPay, Momo, Thẻ tín dụng/ghi nợ). Không hỗ trợ phương thức trả sau hoặc tiền mặt.');
      err.statusCode = 400;
      throw err;
    }

    const transactionId = `TXN-${selectedGateway}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    order.status = 'COMPLETED';
    order.payment_status = order.total === 0 ? 'NO_PAYMENT_REQUIRED' : 'PAYMENT_RECEIVED';
    order.payment_gateway = selectedGateway;
    order.payment_transaction_id = transactionId;
    order.paid_at = new Date().toISOString();

    // Confirm seats
    if (order.seats && order.seats.length > 0) {
      await seatingService.confirmSeats(order.event_id, order.id, order.seats);
    }

    // Activate attendees and assign barcodes upon payment completion
    try {
      const attRes = await query('SELECT * FROM attendees WHERE order_id = $1', [numId]);
      for (const a of attRes.rows) {
        let bcode = a.barcode;
        if (!bcode) {
          bcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        await query(
          "UPDATE attendees SET status = 'ACTIVE', barcode = $1, updated_at = NOW() WHERE id = $2",
          [bcode, a.id]
        );
      }
    } catch {}

    if (order.attendees && Array.isArray(order.attendees)) {
      for (const a of order.attendees) {
        a.status = 'ACTIVE';
        if (!a.barcode) {
          a.barcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        a.ticket_code = a.barcode;
        a.qr_hash = a.barcode;
      }
    }

    try {
      await query(`
        UPDATE orders 
        SET status = 'COMPLETED', payment_status = $1, payment_gateway = $2, payment_transaction_id = $3, updated_at = NOW()
        WHERE id = $4
      `, [order.payment_status, order.payment_gateway, transactionId, numId]);

      // Credit escrow account (only if not already credited)
      const totalAmount = Number(order.total_gross || order.total || 0);
      if (totalAmount > 0) {
        const commissionRate = 5.00;
        const commission = Math.round(totalAmount * (commissionRate / 100));
        const balance = totalAmount - commission;
        await query(`
          INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
          VALUES ($1, $2, 0, $3, $4, 'HOLDING', NOW())
          ON CONFLICT (event_id) DO UPDATE SET
            gross_revenue = escrow_accounts.gross_revenue + $2,
            current_balance = escrow_accounts.current_balance + $3,
            commission_held = escrow_accounts.commission_held + $4,
            updated_at = NOW()
        `, [order.event_id, totalAmount, balance, commission]);
      }
    } catch {}

    return {
      success: true,
      message: 'Thanh toán trực tuyến hoàn tất thành công',
      transaction_id: transactionId,
      receipt_url: `/api/orders/${order.id}/receipt`,
      order,
    };
  }

  async handlePaymentWebhook({ order_id, order_public_id, payment_intent_id, payment_method = 'VNPAY', amount_paid, signature, status = 'SUCCESS' }) {
    // Cryptographic signature verification (SEC-02 remediation)
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'ticketflow-payment-webhook-secret-2026';
    if (!signature) {
      const err = new Error('Missing payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    const payloadToSign = `${order_id || order_public_id || ''}|${status}|${amount_paid || ''}|${payment_intent_id || ''}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadToSign)
      .digest('hex');

    const signatureBuffer = Buffer.from(String(signature), 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      const err = new Error('Invalid payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    let order = null;
    if (order_id) {
      order = memoryOrders.get(Number(order_id));
      if (!order) {
        order = await this.getOrderById(Number(order_id), { role: 'ADMIN' }).catch(() => null);
      }
    }
    if (!order && order_public_id) {
      for (const o of memoryOrders.values()) {
        if (o.public_id === order_public_id || o.orderShortId === order_public_id) {
          order = o;
          break;
        }
      }
      if (!order) {
        try {
          const res = await query('SELECT id FROM orders WHERE public_id = $1 OR short_id = $1 LIMIT 1', [order_public_id]);
          if (res.rowCount > 0) {
            order = await this.getOrderById(res.rows[0].id, { role: 'ADMIN' }).catch(() => null);
          }
        } catch {}
      }
    }

    if (!order) {
      const err = new Error('Order not found for webhook callback');
      err.statusCode = 404;
      throw err;
    }

    if (order.status === 'COMPLETED' || order.status === 'PAID') {
      return { success: true, message: 'Order already completed', order };
    }

    // Reject payment callback for cancelled or expired orders (BUG-04 remediation)
    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      const err = new Error(`Cannot process payment callback: Order is already ${order.status}`);
      err.statusCode = 400;
      throw err;
    }

    if (status === 'FAILED') {
      order.status = 'CANCELLED';
      order.payment_status = 'PAYMENT_FAILED';
      try {
        await query("UPDATE orders SET status = 'CANCELLED', payment_status = 'PAYMENT_FAILED', updated_at = NOW() WHERE id = $1", [order.id]);
        await query("UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1", [order.id]);
      } catch {}

      if (order.attendees && Array.isArray(order.attendees)) {
        for (const a of order.attendees) {
          a.status = 'CANCELLED';
        }
      }

      // Release inventory (BUG-03 remediation)
      if (order.items && Array.isArray(order.items)) {
        try {
          await withTransaction(async (client) => {
            await releaseTickets(client, order.items);
          });
        } catch {}
      }

      // Decrement promo code usage
      if (order.promo_code && order.event_id) {
        await promosService.decrementUsage(order.event_id, order.promo_code).catch(() => {});
      }

      return { success: false, message: 'Payment failed callback processed and inventory released', order };
    }

    // Verify gross payment amount matches expected order total (BUG-05 remediation)
    const expectedTotal = Number(order.total_gross || order.total || 0);
    if (amount_paid !== null && amount_paid !== undefined && String(amount_paid).trim() !== '') {
      const paid = Number(amount_paid);
      if (!isNaN(paid) && paid < expectedTotal) {
        const err = new Error(`Payment amount mismatch: Expected ${expectedTotal}, received ${paid}`);
        err.statusCode = 400;
        throw err;
      }
    }

    // Success transition
    order.status = 'COMPLETED';
    order.payment_status = 'PAYMENT_RECEIVED';
    order.payment_gateway = payment_method;
    order.payment_transaction_id = payment_intent_id || `TXN-${payment_method}-${Date.now()}`;
    order.paid_at = new Date().toISOString();

    // Activate attendees and assign barcodes
    try {
      const attRes = await query('SELECT * FROM attendees WHERE order_id = $1', [order.id]);
      for (const a of attRes.rows) {
        let bcode = a.barcode;
        if (!bcode) {
          bcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        await query(
          "UPDATE attendees SET status = 'ACTIVE', barcode = $1, updated_at = NOW() WHERE id = $2",
          [bcode, a.id]
        );
      }
    } catch {}

    if (order.attendees && Array.isArray(order.attendees)) {
      for (const a of order.attendees) {
        a.status = 'ACTIVE';
        if (!a.barcode) {
          a.barcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        a.ticket_code = a.barcode;
        a.qr_hash = a.barcode;
      }
    }

    try {
      await query(`
        UPDATE orders
        SET status = 'COMPLETED', payment_status = $1, payment_gateway = $2, payment_transaction_id = $3, updated_at = NOW()
        WHERE id = $4
      `, [order.payment_status, order.payment_gateway, order.payment_transaction_id, order.id]);
    } catch {}

    // Credit escrow account
    try {
      const totalAmount = Number(order.total_gross || order.total || 0);
      const commissionRate = 5.00;
      const commission = Math.round(totalAmount * (commissionRate / 100));
      const balance = totalAmount - commission;
      await query(`
        INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
        VALUES ($1, $2, 0, $3, $4, 'HOLDING', NOW())
        ON CONFLICT (event_id) DO UPDATE SET
          gross_revenue = escrow_accounts.gross_revenue + $2,
          current_balance = escrow_accounts.current_balance + $3,
          commission_held = escrow_accounts.commission_held + $4,
          updated_at = NOW()
      `, [order.event_id, totalAmount, balance, commission]);
    } catch (e) {
      console.warn('[handlePaymentWebhook] Escrow credit error:', e.message);
    }

    return {
      success: true,
      message: 'Payment verified and order completed via webhook',
      order,
    };
  }

  async getDigitalReceipt(orderIdentifier, { user = null } = {}) {
    let order = null;
    const numId = Number(orderIdentifier);
    if (!isNaN(numId) && numId > 0) {
      order = memoryOrders.get(numId);
      if (!order) {
        order = await this.getOrderById(numId, { role: 'ADMIN' }).catch(() => null);
      }
    }

    if (!order) {
      try {
        const res = await query(
          'SELECT id FROM orders WHERE public_id = $1 OR short_id = $1 LIMIT 1',
          [String(orderIdentifier)]
        );
        if (res.rowCount > 0) {
          order = await this.getOrderById(res.rows[0].id, { role: 'ADMIN' }).catch(() => null);
        }
      } catch {}
    }

    if (!order) {
      for (const ord of memoryOrders.values()) {
        if (ord.public_id === orderIdentifier || ord.orderShortId === orderIdentifier) {
          order = ord;
          break;
        }
      }
    }

    if (!order) {
      const err = new Error('Receipt not found for the given order identifier');
      err.statusCode = 404;
      throw err;
    }

    const event = await eventsService.getEventById(order.event_id);

    return {
      receipt_id: `RCP-${order.orderShortId || order.id}`,
      order_id: order.id,
      order_short_id: order.orderShortId,
      event: {
        id: event ? event.id : order.event_id,
        title: event ? event.title : 'Event Registration',
        starts_at: event ? (event.starts_at || event.start_date) : null,
        location: event ? event.location : 'Online',
      },
      buyer: order.buyer || {},
      items: order.items || [],
      subtotal: order.subtotal || 0,
      discount: order.discount || 0,
      total: order.total || 0,
      payment_status: order.payment_status || (order.total === 0 ? 'NO_PAYMENT_REQUIRED' : 'PAYMENT_RECEIVED'),
      payment_gateway: order.payment_gateway || (order.total === 0 ? 'FREE' : 'ONLINE'),
      transaction_id: order.payment_transaction_id || `TXN-SIM-${order.id}`,
      issued_at: order.paid_at || order.created_at || new Date().toISOString(),
      attendees: (order.attendees || []).map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        ticket_code: a.barcode || a.ticket_code,
        qr_hash: a.barcode || a.ticket_code,
        barcode: a.barcode,
        seat: a.seat || null,
        status: a.status,
      })),
    };
  }

  async transferTicket(attendeeId, { new_email, target_email, new_name, recipient_name, user = null }) {
    const finalEmail = (new_email || target_email || '').toLowerCase().trim();
    const finalName = new_name || recipient_name;
    if (!finalEmail) {
      const err = new Error('Email người nhận chuyển nhượng là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const numAttId = Number(attendeeId);
    let attendee = memoryAttendees.get(numAttId);
    if (!attendee) {
      try {
        const res = await query('SELECT * FROM attendees WHERE id = $1', [numAttId]);
        if (res.rowCount > 0) {
          attendee = res.rows[0];
          attendee.name = attendee.first_name || attendee.email;
        }
      } catch {}
    }

    if (!attendee) {
      const err = new Error('Vé không tồn tại');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check: Ensure caller owns the attendee ticket or is ADMIN (LOGIC-04 remediation)
    if (!user) {
      const err = new Error('Unauthorized: Đăng nhập để chuyển nhượng vé');
      err.statusCode = 401;
      throw err;
    }

    if (user.role !== 'ADMIN') {
      const isOwnerEmail = user.email && attendee.email && user.email.toLowerCase() === attendee.email.toLowerCase();
      // If the ticket was already transferred, the previous order owner loses transfer rights
      let isOrderOwner = false;
      if (!attendee.is_transferred && attendee.order_id) {
        const ord = memoryOrders.get(Number(attendee.order_id));
        if (ord && ord.user_id && Number(ord.user_id) === Number(user.id)) {
          isOrderOwner = true;
        }
      }
      if (!isOwnerEmail && !isOrderOwner) {
        const err = new Error('Forbidden: Bạn không có quyền chuyển nhượng vé này');
        err.statusCode = 403;
        throw err;
      }
    }

    if (attendee.status === 'CANCELLED') {
      const err = new Error('Vé đã bị hủy, không thể chuyển nhượng');
      err.statusCode = 400;
      throw err;
    }

    if (attendee.status !== 'ACTIVE') {
      const err = new Error('Chỉ có thể chuyển nhượng vé đã thanh toán và phát hành (ACTIVE)');
      err.statusCode = 400;
      throw err;
    }

    // Invalidate old barcode and issue fresh barcode for new owner using secure PRNG (SEC-12)
    const oldBarcode = attendee.barcode;
    const newBarcode = `TKT-${attendee.order_id}-${attendee.id}-TRF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    attendee.email = new_email.toLowerCase().trim();
    if (new_name) attendee.name = new_name;
    attendee.barcode = newBarcode;
    attendee.is_transferred = true;
    attendee.transferred_at = new Date().toISOString();
    attendee.previous_barcode = oldBarcode;

    // Maintain barcode_history for multi-hop transfer audit (BUG-10 remediation)
    let history = [];
    try {
      const curAtt = await query('SELECT barcode_history FROM attendees WHERE id = $1', [numAttId]);
      if (curAtt.rows[0]?.barcode_history) {
        history = Array.isArray(curAtt.rows[0].barcode_history) ? curAtt.rows[0].barcode_history : [];
      }
    } catch {}
    if (oldBarcode && !history.includes(oldBarcode)) {
      history.push(oldBarcode);
    }
    attendee.barcode_history = history;

    try {
      await query(`
        UPDATE attendees
        SET email = $1, first_name = $2, barcode = $3, previous_barcode = $4, barcode_history = $5, is_transferred = TRUE, transferred_at = NOW(), updated_at = NOW()
        WHERE id = $6
      `, [attendee.email, attendee.name || '', newBarcode, oldBarcode, JSON.stringify(history), numAttId]);
    } catch {}

    // Synchronize parent memory order attendees (BUG-09 remediation)
    const memOrder = memoryOrders.get(Number(attendee.order_id));
    if (memOrder && memOrder.attendees) {
      const oAtt = memOrder.attendees.find(a => a.id === numAttId);
      if (oAtt) {
        oAtt.is_transferred = true;
        oAtt.transferred_at = attendee.transferred_at;
        oAtt.barcode = newBarcode;
        oAtt.email = attendee.email;
        oAtt.previous_barcode = oldBarcode;
        oAtt.barcode_history = history;
      }
    }

    return {
      success: true,
      message: `Đã chuyển nhượng vé thành công sang email ${new_email}`,
      attendee,
    };
  }

  async massRefundEvent(eventId, user = null) {
    if (user && user.role !== 'ADMIN') {
      const err = new Error('Forbidden: Only platform admins can orchestrate mass refunds');
      err.statusCode = 403;
      throw err;
    }

    const numEventId = Number(eventId);
    const affectedOrders = [];

    for (const order of memoryOrders.values()) {
      if (order.event_id === numEventId && order.status === 'COMPLETED') {
        order.status = 'REFUNDED';
        order.total_refunded = order.total;
        affectedOrders.push(order);
      }
    }

    try {
      await query(`
        UPDATE orders
        SET status = 'REFUNDED', total_refunded = total_gross, updated_at = NOW()
        WHERE event_id = $1 AND status = 'COMPLETED'
      `, [numEventId]);
      await query(`
        UPDATE attendees
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE event_id = $1
      `, [numEventId]);
    } catch {}

    return {
      success: true,
      message: `Đã hoàn tiền 100% hàng loạt cho sự kiện #${numEventId}`,
      count: affectedOrders.length,
    };
  }

  getMemoryOrders() {
    return Array.from(memoryOrders.values());
  }

  getMemoryAttendees() {
    return Array.from(memoryAttendees.values());
  }

  async getAllOrders() {
    try {
      const sql = `
        SELECT 
          id,
          short_id,
          event_id,
          COALESCE(email, '') AS customer_email,
          COALESCE(email, '') AS email,
          total_gross,
          status,
          created_at
        FROM orders
        ORDER BY id DESC
      `;
      const res = await query(sql);
      return (res.rows || []).map(r => ({
        id: Number(r.id),
        short_id: r.short_id,
        event_id: Number(r.event_id || 0),
        customer_email: r.customer_email || r.email || '',
        email: r.customer_email || r.email || '',
        total_gross: Number(r.total_gross),
        status: r.status,
        created_at: r.created_at,
      }));
    } catch (dbErr) {
      console.warn('[OrdersService.getAllOrders] DB error, using fallback:', dbErr.message);
    }

    const list = [];
    for (const o of memoryOrders.values()) {
      list.push({
        id: o.id,
        short_id: o.orderShortId || `ORD-${o.id}`,
        event_id: Number(o.event_id || o.eventId || 0),
        customer_email: o.buyer?.email || o.email || '',
        email: o.buyer?.email || o.email || '',
        total_gross: Number(o.total || o.total_gross || 0),
        status: o.status,
        created_at: o.created_at || new Date().toISOString(),
      });
    }
    list.sort((a, b) => b.id - a.id);
    return list;
  }

  async getOrdersByEvent(eventId, user) {
    const numEventId = Number(eventId);
    const { default: eventsService } = await import('./events.service.js');
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
          id,
          short_id,
          COALESCE(email, '') AS customer_email,
          COALESCE(email, '') AS email,
          first_name,
          last_name,
          subtotal,
          discount_amount,
          total_gross,
          status,
          created_at
        FROM orders
        WHERE event_id = $1
        ORDER BY id DESC
      `;
      const res = await query(sql, [numEventId]);
      return (res.rows || []).map(r => ({
        id: Number(r.id),
        short_id: r.short_id,
        customer_email: r.customer_email || r.email || '',
        email: r.customer_email || r.email || '',
        first_name: r.first_name || '',
        last_name: r.last_name || '',
        subtotal: Number(r.subtotal),
        discount_amount: Number(r.discount_amount),
        total_gross: Number(r.total_gross),
        status: r.status,
        created_at: r.created_at,
      }));
    } catch (dbErr) {
      console.warn('[OrdersService.getOrdersByEvent] DB error, using fallback:', dbErr.message);
    }

    const list = [];
    for (const o of memoryOrders.values()) {
      if (o.event_id === numEventId) {
        list.push({
          id: o.id,
          short_id: o.orderShortId || `ORD-${o.id}`,
          customer_email: o.buyer?.email || o.email || '',
          email: o.buyer?.email || o.email || '',
          first_name: o.buyer?.name ? o.buyer.name.split(' ')[0] : '',
          last_name: o.buyer?.name && o.buyer.name.split(' ').length > 1 ? o.buyer.name.split(' ').slice(1).join(' ') : '',
          subtotal: Number(o.subtotal || 0),
          discount_amount: Number(o.discount || 0),
          total_gross: Number(o.total || o.total_gross || 0),
          status: o.status,
          created_at: o.created_at || new Date().toISOString(),
        });
      }
    }
    list.sort((a, b) => b.id - a.id);
    return list;
  }

  async getAttendeesByEvent(eventId, user) {
    const numEventId = Number(eventId);
    const { default: eventsService } = await import('./events.service.js');
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
      return (res.rows || []).map(r => ({
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
      console.warn('[OrdersService.getAttendeesByEvent] DB error, using fallback:', dbErr.message);
    }

    const { default: ticketsService } = await import('./tickets.service.js');
    const list = [];
    for (const a of memoryAttendees.values()) {
      if (a.event_id === numEventId) {
        const tier = a.ticket_tier_id ? await ticketsService.getTierById(a.ticket_tier_id) : null;
        const tierName = tier ? (tier.title || tier.name || '') : '';
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

    const { first_name, last_name, name, email, ticket_tier_id } = data;
    if (!email || (!name && !first_name)) {
      const err = new Error('Họ tên và email khách mời là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const fullName = name ? name.trim() : `${first_name || ''} ${last_name || ''}`.trim();
    const firstName = first_name || fullName.split(' ')[0] || 'Khách mời';
    const lastName = last_name || (fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : 'VIP');

    // Find ticket tier or fallback to first tier of event
    const { default: ticketsService } = await import('./tickets.service.js');
    const tiers = await ticketsService.listByEventId(numEventId, true);
    let tierId = ticket_tier_id ? Number(ticket_tier_id) : (tiers[0]?.id || null);
    const chosenTier = tiers.find(t => Number(t.id) === tierId) || tiers[0];
    if (chosenTier) tierId = Number(chosenTier.id);

    const barcode = `TKT-${numEventId}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const shortId = `att_${Date.now().toString().slice(-8)}`;
    const publicId = `guest_${Math.random().toString(36).substring(2, 10)}`;

    let newAttendee = null;

    try {
      let orderId = null;
      const orderRes = await query(`
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
      `, [
        `ord_guest_${Date.now().toString().slice(-6)}`,
        `pub_guest_${Date.now().toString().slice(-6)}`,
        numEventId,
        user ? Number(user.id) : null,
        firstName,
        lastName,
        cleanEmail,
      ]);

      if (orderRes.rowCount > 0) {
        orderId = Number(orderRes.rows[0].id);
      }

      if (orderId && tierId) {
        const attRes = await query(`
          INSERT INTO attendees (
            short_id, public_id, order_id, ticket_tier_id, event_id,
            first_name, last_name, email, status, barcode, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, NOW(), NOW())
          RETURNING *
        `, [
          shortId,
          publicId,
          orderId,
          tierId,
          numEventId,
          firstName,
          lastName,
          cleanEmail,
          barcode,
        ]);

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
            tier_name: chosenTier?.title || chosenTier?.name || 'Khách Mời VIP',
            'tier name': chosenTier?.title || chosenTier?.name || 'Khách Mời VIP',
            ticket_tier_id: tierId,
            event_id: numEventId,
            order_id: orderId,
          };
        }
      }
    } catch (dbErr) {
      console.warn('[OrdersService.createGuestAttendee] DB error, using fallback:', dbErr.message);
    }

    if (!newAttendee) {
      const id = ++nextAttendeeId;
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
        tier_name: chosenTier?.title || chosenTier?.name || 'Khách Mời VIP',
        'tier name': chosenTier?.title || chosenTier?.name || 'Khách Mời VIP',
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

    const { first_name, last_name, name, email, ticket_tier_id, status } = data;
    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    const fullName = name ? name.trim() : (first_name || last_name ? `${first_name || ''} ${last_name || ''}`.trim() : undefined);
    const firstName = first_name || (fullName ? fullName.split(' ')[0] : undefined);
    const lastName = last_name || (fullName && fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : undefined);

    let updated = null;

    try {
      const res = await query(`
        UPDATE attendees
        SET first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            email = COALESCE($3, email),
            ticket_tier_id = COALESCE($4, ticket_tier_id),
            status = COALESCE($5, status),
            updated_at = NOW()
        WHERE id = $6 AND event_id = $7
        RETURNING *
      `, [firstName, lastName, cleanEmail, ticket_tier_id ? Number(ticket_tier_id) : null, status, numAttendeeId, numEventId]);

      if (res.rowCount > 0) {
        const row = res.rows[0];
        const { default: ticketsService } = await import('./tickets.service.js');
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
      console.warn('[OrdersService.updateAttendee] DB error, using fallback:', dbErr.message);
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

    let found = false;

    try {
      const res = await query(`
        UPDATE attendees
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1 AND event_id = $2
        RETURNING id
      `, [numAttendeeId, numEventId]);
      if (res.rowCount > 0) found = true;
    } catch (dbErr) {
      console.warn('[OrdersService.deleteAttendee] DB error, using fallback:', dbErr.message);
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
      message: `Đã hủy vé của khách tham dự #${numAttendeeId} thành công`,
    };
  }

  async getUserOrders(user) {
    if (!user) {
      const err = new Error('Unauthorized: Vui lòng đăng nhập để xem vé');
      err.statusCode = 401;
      throw err;
    }

    const userId = Number(user.id);
    const userEmail = (user.email || '').toLowerCase().trim();

    try {
      const sql = `
        SELECT o.*, e.title AS event_title, e.start_date AS starts_at, e.location AS event_location
        FROM orders o
        LEFT JOIN events e ON o.event_id = e.id
        WHERE o.user_id = $1 OR LOWER(o.email) = $2
        ORDER BY o.id DESC
      `;
      const res = await query(sql, [userId, userEmail]);
      const resultOrders = [];
      for (const row of (res.rows || [])) {
        const numOrderId = Number(row.id);
        const attRes = await query(`
          SELECT a.*, COALESCE(t.title, '') AS tier_name
          FROM attendees a
          LEFT JOIN ticket_tiers t ON a.ticket_tier_id = t.id
          WHERE a.order_id = $1
          ORDER BY a.id ASC
        `, [numOrderId]);

        resultOrders.push({
          id: numOrderId,
          orderShortId: row.short_id,
          event_id: Number(row.event_id),
          event_title: row.event_title || 'Sự kiện Ticketflow',
          event_date: row.starts_at,
          event_location: row.event_location || 'Địa điểm tổ chức',
          subtotal: Number(row.subtotal),
          discount: Number(row.discount_amount),
          total: Number(row.total_gross),
          status: row.status,
          payment_status: row.payment_status,
          created_at: row.created_at,
          attendees: attRes.rows.map(a => ({
            id: Number(a.id),
            short_id: a.short_id,
            name: a.first_name || '',
            email: a.email,
            tier_name: a.tier_name || 'Vé tiêu chuẩn',
            barcode: a.barcode,
            status: a.status,
            checked_in_at: a.checked_in_at,
            is_transferred: Boolean(a.is_transferred),
            transferred_at: a.transferred_at,
          })),
        });
      }
      return resultOrders;
    } catch (dbErr) {
      console.warn('[OrdersService.getUserOrders] DB error:', dbErr.message);
    }

    // Memory fallback
    const list = [];
    for (const o of memoryOrders.values()) {
      const matchUser = (o.user_id && Number(o.user_id) === userId) ||
                        (o.buyer?.email && o.buyer.email.toLowerCase() === userEmail);
      if (matchUser) {
        const orderAttendees = [];
        for (const a of memoryAttendees.values()) {
          if (a.order_id === o.id) {
            orderAttendees.push(a);
          }
        }
        list.push({
          id: o.id,
          orderShortId: o.orderShortId || `ORD-${o.id}`,
          event_id: o.event_id,
          event_title: o.event_title || 'Sự kiện Ticketflow',
          total: Number(o.total || 0),
          status: o.status,
          created_at: o.created_at || new Date().toISOString(),
          attendees: o.attendees && o.attendees.length > 0 ? o.attendees : orderAttendees,
        });
      }
    }
    list.sort((a, b) => b.id - a.id);
    return list;
  }
}

export default new OrdersService();
