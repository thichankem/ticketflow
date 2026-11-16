import crypto from 'node:crypto';
import { withTransaction, reserveTickets, releaseTickets, query, InventoryExhaustedError } from '../config/db.js';
import { memoryOrders, memoryAttendees, getNextOrderId, getNextAttendeeId } from '../data/order-store.js';
import ticketsService from './tickets.service.js';
import promosService from './promos.service.js';
import seatingService from './seating.service.js';
import eventsService from './events.service.js';
import notificationsService from './notifications.service.js';
import waitingRoomService from './waiting-room.service.js';
import recommendationService from './recommendation.service.js';
import refundService from './refund.service.js';
import paymentService from './payment.service.js';
import attendeeService from './attendee.service.js';

export { InventoryExhaustedError };

/**
 * OrderDomainModel / OrdersService
 * Authoritative service managing Order lifecycle, atomic inventory reservations,
 * checkout sessions, cancellations, and digital receipts.
 */
class OrdersService {
  constructor() {
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
    } catch {}

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
    await this.cleanupExpiredReservations();

    const numEventId = Number(eventId);
    const event = await eventsService.getEventById(numEventId);
    if (!event) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (typeof waitingRoomService?.isWaitingRoomActive === 'function' && waitingRoomService.isWaitingRoomActive(eventId)) {
      if (!queueToken) {
        const err = new Error('Virtual Waiting Room is active: Queue token required to reserve tickets');
        err.statusCode = 429;
        throw err;
      }
      const isValid = waitingRoomService.verifyAdmissionToken(eventId, queueToken);
      if (!isValid) {
        const err = new Error('Invalid or expired waiting room token. Please re-enter the queue.');
        err.statusCode = 403;
        throw err;
      }
    }

    if (!items || items.length === 0) {
      const err = new Error('No ticket items specified for reservation');
      err.statusCode = 400;
      throw err;
    }

    for (const it of items) {
      if (!it.ticket_tier_id || !it.quantity || it.quantity <= 0) {
        const err = new Error('Invalid item: ticket_tier_id and positive quantity required');
        err.statusCode = 400;
        throw err;
      }

      const tier = await ticketsService.getTierById(it.ticket_tier_id);
      if (!tier) {
        const err = new Error(`Ticket tier #${it.ticket_tier_id} not found`);
        err.statusCode = 404;
        throw err;
      }
      if (Number(tier.event_id) !== numEventId) {
        const err = new Error(`Ticket tier #${it.ticket_tier_id} does not belong to event #${eventId}`);
        err.statusCode = 400;
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

    let discount = 0;
    let appliedPromo = null;
    if (promoCode && eventId) {
      try {
        const promoRes = await promosService.validatePromo(eventId, promoCode, subtotal);
        if (promoRes.valid) {
          discount = promoRes.discount;
          appliedPromo = promoRes.promo;
        }
      } catch {}
    }

    const total = Math.max(0, subtotal - discount);
    let orderId = getNextOrderId();
    let orderShortId = `ORD-${1000 + orderId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    try {
      await withTransaction(async (client) => {
        await reserveTickets(client, items);

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
          numEventId,
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

          for (const it of reservedItems) {
            await client.query(
              `
              INSERT INTO order_items (
                order_id, ticket_tier_id, item_name, quantity, price,
                total_before_additions, total_tax, total_service_fee, total_gross,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $6, NOW(), NOW())
            `,
              [orderId, it.ticket_tier_id, it.name, it.quantity, it.unit_price, it.total_price]
            );
          }
        }
      });

      if (appliedPromo) {
        await promosService.incrementUsage(eventId, appliedPromo.code);
      }
    } catch (err) {
      if (err instanceof InventoryExhaustedError || err.statusCode === 409) {
        throw err;
      }
      for (const it of items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        if (memTier) {
          if (memTier.remaining_quantity < it.quantity) {
            const outErr = new Error(`Ticket tier #${it.ticket_tier_id} is exhausted`);
            outErr.statusCode = 409;
            throw outErr;
          }
          memTier.remaining_quantity -= it.quantity;
        }
      }
      if (appliedPromo) {
        promosService.incrementUsage(eventId, appliedPromo.code);
      }
    }

    const reservedOrder = {
      id: orderId,
      orderShortId,
      event_id: numEventId,
      user_id: user ? user.id : null,
      items: reservedItems,
      subtotal,
      discount,
      promo_code: appliedPromo ? appliedPromo.code : null,
      total,
      status: 'RESERVED',
      expires_at: expiresAt,
      seats: [],
      created_at: new Date().toISOString(),
    };

    memoryOrders.set(orderId, reservedOrder);

    const responsePayload = {
      orderId,
      orderShortId,
      status: 'RESERVED',
      items: reservedItems,
      subtotal,
      discount,
      total,
      expires_at: expiresAt,
      seats: [],
      message: 'Tickets reserved successfully for 15 minutes',
    };
    responsePayload.order = { ...responsePayload };

    return responsePayload;
  }

  async getOrderById(orderId, user = null, sessionSecret = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [numId]);
        if (res.rowCount > 0) {
          const row = res.rows[0];

          let items = [];
          try {
            const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [numId]);
            if (itemsRes.rows && itemsRes.rows.length > 0) {
              items = itemsRes.rows.map((r) => ({
                ticket_tier_id: Number(r.ticket_tier_id),
                name: r.item_name,
                quantity: Number(r.quantity),
                unit_price: Number(r.price),
                total_price: Number(r.total_gross || r.total_before_additions),
              }));
            }
          } catch {}

          let attendees = [];
          try {
            const attRes = await query('SELECT * FROM attendees WHERE order_id = $1', [numId]);
            if (attRes.rows && attRes.rows.length > 0) {
              attendees = attRes.rows.map((a) => ({
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
      try {
        const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [numId]);
        if (itemsRes.rows && itemsRes.rows.length > 0) {
          order.items = itemsRes.rows.map((r) => ({
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

    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN' && user.role !== 'ORGANIZER')) {
        const err = new Error('Forbidden: You do not own this order');
        err.statusCode = 403;
        throw err;
      }
    } else {
      const isAdminOrOrg = user && (user.role === 'ADMIN' || user.role === 'ORGANIZER');
      const hasValidSecret =
        sessionSecret &&
        (sessionSecret === order.public_id || sessionSecret === order.short_id || sessionSecret === order.orderShortId);
      if (!isAdminOrOrg && !hasValidSecret) {
        const err = new Error('Forbidden: Accessing guest orders requires valid order session token');
        err.statusCode = 403;
        throw err;
      }
    }

    return order;
  }

  async checkoutOrder(
    orderId,
    { buyer = {}, attendees = [], payment_method = 'VNPAY', payment_intent_id = null, user = null, sessionToken = null }
  ) {
    const numId = Number(orderId);
    const order = memoryOrders.get(numId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.user_id) {
      if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
        const err = new Error('Forbidden: You do not have permission to checkout this order');
        err.statusCode = 403;
        throw err;
      }
    } else {
      if (
        order.public_id &&
        sessionToken &&
        sessionToken !== order.public_id &&
        sessionToken !== order.short_id &&
        sessionToken !== order.orderShortId
      ) {
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

    const isFreeOrder = order.total === 0 || order.subtotal - (order.discount || 0) <= 0;
    const hasPreauthorizedPayment = Boolean(payment_intent_id);

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

    const createdAttendees = [];
    const attendeeSource = attendees && attendees.length > 0 ? attendees : [{ name: buyer.name, email: buyer.email }];

    for (let i = 0; i < attendeeSource.length; i++) {
      const att = attendeeSource[i];
      let attId = getNextAttendeeId();
      const barcode = `TKT-${order.id}-${attId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const initialAttendeeStatus = 'ACTIVE';
      const seat = order.seats && order.seats[i] ? order.seats[i] : null;

      try {
        const publicId = `att_pub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const shortId = `att_${Date.now().toString().slice(-6)}`;
        const attRes = await query(
          `
          INSERT INTO attendees (
            short_id, public_id, order_id, ticket_tier_id, event_id,
            first_name, last_name, email, status, barcode, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, NOW(), NOW())
          RETURNING id, short_id, public_id, barcode
        `,
          [
            shortId,
            publicId,
            order.id,
            att.ticket_tier_id || (order.items[0] && order.items[0].ticket_tier_id),
            order.event_id,
            att.name || buyer.name,
            (att.email || buyer.email).toLowerCase().trim(),
            initialAttendeeStatus,
            barcode,
          ]
        );
        if (attRes.rowCount > 0) {
          attId = Number(attRes.rows[0].id);
        }
      } catch {}

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
      await query(
        `
        UPDATE orders
        SET status = $1, first_name = $2, email = $3, payment_status = $4, payment_gateway = $5, payment_transaction_id = $6, updated_at = NOW()
        WHERE id = $7
      `,
        [order.status, buyer.name, buyer.email, order.payment_status, order.payment_gateway, order.payment_transaction_id, numId]
      );
    } catch {}

    if (hasPreauthorizedPayment && !isFreeOrder) {
      try {
        const totalAmount = Number(order.total_gross || order.total || 0);
        if (totalAmount > 0) {
          const commissionRate = 5.0;
          const commission = Math.round(totalAmount * (commissionRate / 100));
          const balance = totalAmount - commission;
          await query(
            `
            INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
            VALUES ($1, $2, 0, $3, $4, 'HOLDING', NOW())
            ON CONFLICT (event_id) DO UPDATE SET
              gross_revenue = escrow_accounts.gross_revenue + $2,
              current_balance = escrow_accounts.current_balance + $3,
              commission_held = escrow_accounts.commission_held + $4,
              updated_at = NOW()
          `,
            [order.event_id, totalAmount, balance, commission]
          );
        }
      } catch (escrowErr) {
        console.warn('[checkoutOrder] Escrow sync warning:', escrowErr.message);
      }
    }

    if (order.user_id && order.event_id) {
      recommendationService.trackPurchase(order.user_id, order.event_id);
    }

    return {
      order,
      attendees: createdAttendees,
    };
  }

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
      console.warn('[OrdersService._restoreInventoryAndHolds] DB ticket release notice:', relErr.message);
    }

    for (const item of order.items || []) {
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

  async getDigitalReceipt(orderIdentifier, { user = null } = {}) {
    let order = null;
    let isAuthorized = false;
    const isNumeric = /^\d+$/.test(String(orderIdentifier).trim());

    if (isNumeric) {
      const numId = Number(orderIdentifier);
      if (!user) {
        const err = new Error('Unauthorized: Vui lòng đăng nhập để xem biên nhận theo mã đơn hàng');
        err.statusCode = 401;
        throw err;
      }
      order = memoryOrders.get(numId);
      if (!order) {
        try {
          const res = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [numId]);
          if (res.rowCount > 0) {
            order = await this.getOrderById(numId, user).catch(() => null);
          }
        } catch {}
      }
      if (order) {
        const isOwner =
          (order.user_id && Number(order.user_id) === Number(user.id)) ||
          (order.buyer?.email && user.email && order.buyer.email.toLowerCase() === user.email.toLowerCase());
        if (user.role === 'ADMIN' || isOwner) {
          isAuthorized = true;
        } else {
          const err = new Error('Forbidden: Bạn không có quyền xem biên nhận của đơn hàng này');
          err.statusCode = 403;
          throw err;
        }
      }
    } else {
      const tokenStr = String(orderIdentifier).trim();
      try {
        const res = await query('SELECT id FROM orders WHERE public_id = $1 OR short_id = $1 LIMIT 1', [tokenStr]);
        if (res.rowCount > 0) {
          order = await this.getOrderById(res.rows[0].id, { role: 'ADMIN' }).catch(() => null);
        }
      } catch {}

      if (!order) {
        for (const ord of memoryOrders.values()) {
          if (ord.public_id === tokenStr || ord.orderShortId === tokenStr || ord.short_id === tokenStr) {
            order = ord;
            break;
          }
        }
      }

      if (order && user) {
        const isOwner =
          (order.user_id && Number(order.user_id) === Number(user.id)) ||
          (order.buyer?.email && user.email && order.buyer.email.toLowerCase() === user.email.toLowerCase());
        if (user.role === 'ADMIN' || isOwner) {
          isAuthorized = true;
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
      receipt_id: `RCP-${order.orderShortId || order.short_id || order.id}`,
      order_id: order.id,
      order_short_id: order.orderShortId || order.short_id,
      event: {
        id: event ? event.id : order.event_id,
        title: event ? event.title : 'Event Registration',
        starts_at: event ? event.starts_at || event.start_date : null,
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
        name: a.name || a.first_name || 'Khách Mua Vé',
        email: a.email,
        ticket_tier_id: a.ticket_tier_id,
        tier_name: a.tier_name || 'Vé Phổ Thông',
        ticket_code: isAuthorized ? a.barcode || a.ticket_code : 'REDACTED_PUBLIC_VIEW',
        qr_hash: isAuthorized ? a.barcode || a.ticket_code : 'REDACTED_PUBLIC_VIEW',
        barcode: isAuthorized ? a.barcode : 'REDACTED_PUBLIC_VIEW',
        seat: null,
        status: a.status,
      })),
    };
  }

  // Delegations to cohesive domain services (Composition over Inheritance)
  async refundOrder(orderId, user = null) {
    return refundService.refundOrder(orderId, user, this);
  }

  async massRefundEvent(eventId, user = null) {
    return refundService.massRefundEvent(eventId, user);
  }

  async processPayment(orderId, options = {}) {
    return paymentService.processPayment(orderId, options, this);
  }

  async handlePaymentWebhook(payload) {
    return paymentService.handlePaymentWebhook(payload, this);
  }

  async transferTicket(attendeeId, options) {
    return attendeeService.transferTicket(attendeeId, options);
  }

  async getAttendeesByEvent(eventId, user) {
    return attendeeService.getAttendeesByEvent(eventId, user);
  }

  async createGuestAttendee(eventId, data, user) {
    return attendeeService.createGuestAttendee(eventId, data, user);
  }

  async updateAttendee(eventId, attendeeId, data, user) {
    return attendeeService.updateAttendee(eventId, attendeeId, data, user);
  }

  async deleteAttendee(eventId, attendeeId, user) {
    return attendeeService.deleteAttendee(eventId, attendeeId, user);
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
      return (res.rows || []).map((r) => ({
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
        orderShortId: o.orderShortId || `ORD-${o.id}`,
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
      return (res.rows || []).map((r) => ({
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
          orderShortId: o.orderShortId || `ORD-${o.id}`,
          customer_email: o.buyer?.email || o.email || '',
          email: o.buyer?.email || o.email || '',
          first_name: o.buyer?.name ? o.buyer.name.split(' ')[0] : '',
          last_name:
            o.buyer?.name && o.buyer.name.split(' ').length > 1 ? o.buyer.name.split(' ').slice(1).join(' ') : '',
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
      for (const row of res.rows || []) {
        const numOrderId = Number(row.id);
        const attRes = await query(
          `
          SELECT a.*, COALESCE(t.title, '') AS tier_name
          FROM attendees a
          LEFT JOIN ticket_tiers t ON a.ticket_tier_id = t.id
          WHERE a.order_id = $1
          ORDER BY a.id ASC
        `,
          [numOrderId]
        );

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
          attendees: attRes.rows.map((a) => ({
            id: Number(a.id),
            short_id: a.short_id,
            name: a.first_name || '',
            email: a.email,
            tier_name: a.tier_name || 'Vé tiêu chuẩn',
            ticket_code: a.barcode,
            qr_hash: a.barcode,
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
      console.warn('[OrdersService.getUserOrders] DB error, using fallback:', dbErr.message);
    }

    const list = [];
    for (const o of memoryOrders.values()) {
      const matchUser =
        (o.user_id && Number(o.user_id) === userId) ||
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
