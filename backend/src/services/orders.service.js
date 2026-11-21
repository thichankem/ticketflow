import crypto from 'node:crypto';
import { withTransaction, reserveTickets, releaseTickets, query, InventoryExhaustedError } from '../config/db.js';
import { memoryOrders, memoryAttendees, getNextOrderId, getNextAttendeeId } from '../data/order-store.js';
import ticketsService from './tickets.service.js';
import promosService from './promos.service.js';
import eventsService from './events.service.js';
import notificationsService from './notifications.service.js';
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
        "SELECT id, event_id, promo_code FROM orders WHERE (status = 'RESERVED' OR status = 'PENDING_PAYMENT') AND reserved_until < NOW()"
      );
      if (res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const numOrderId = Number(row.id);
          const numEventId = Number(row.event_id);

          await withTransaction(async (client) => {
            const lockRes = await client.query(
              "SELECT id, status, inventory_released_at FROM orders WHERE id = $1 AND (status = 'RESERVED' OR status = 'PENDING_PAYMENT') FOR UPDATE",
              [numOrderId]
            );
            if (lockRes.rowCount === 0) return;

            const alreadyReleased = Boolean(lockRes.rows[0].inventory_released_at);
            if (!alreadyReleased) {
              const itemsRes = await client.query(
                'SELECT ticket_tier_id, quantity FROM order_items WHERE order_id = $1',
                [numOrderId]
              );
              if (itemsRes.rows && itemsRes.rows.length > 0) {
                await releaseTickets(client, itemsRes.rows);
              }
            }
            // Cancel any attendees created in PENDING state
            await client.query("UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1", [numOrderId]);
            await client.query("UPDATE orders SET status = 'EXPIRED', inventory_released_at = COALESCE(inventory_released_at, NOW()), updated_at = NOW() WHERE id = $1", [numOrderId]);
          });

          if (row.promo_code) {
            await promosService.decrementUsage(numEventId, row.promo_code);
          }

          const memOrder = memoryOrders.get(numOrderId);
          if (memOrder) {
            memOrder.status = 'EXPIRED';
            if (memOrder.attendees && Array.isArray(memOrder.attendees)) {
              for (const a of memOrder.attendees) a.status = 'CANCELLED';
            }
          }
          notificationsService.triggerRestockNotification(numEventId).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[cleanupExpiredReservations] Cleanup error:', err.message);
    }

    const nowMs = Date.now();
    for (const memOrder of memoryOrders.values()) {
      if ((memOrder.status === 'RESERVED' || memOrder.status === 'PENDING_PAYMENT') && memOrder.expires_at) {
        if (nowMs > new Date(memOrder.expires_at).getTime()) {
          memOrder.status = 'EXPIRED';
          if (memOrder.attendees && Array.isArray(memOrder.attendees)) {
            for (const a of memOrder.attendees) a.status = 'CANCELLED';
          }
          if (memOrder.items && Array.isArray(memOrder.items)) {
            for (const item of memOrder.items) {
              const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
              if (memTier) {
                memTier.remaining_quantity += item.quantity;
              }
            }
          }
          if (memOrder.promo_code) {
            promosService.decrementUsage(memOrder.event_id, memOrder.promo_code);
          }
          notificationsService.triggerRestockNotification(memOrder.event_id).catch(() => {});
        }
      }
    }
  }

  async reserveOrder({ eventId, items = [], promoCode = null, user = null }) {
    await this.cleanupExpiredReservations();

    const numEventId = Number(eventId);
    const event = await eventsService.getEventById(numEventId);
    if (!event) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    // Event Lifecycle & Sales Window Verification (TF-P1-07)
    const eventStatus = (event.status || '').toUpperCase();
    if (eventStatus !== 'PUBLISHED' && eventStatus !== 'LIVE') {
      const err = new Error(`Event is not currently open for ticket sales (status: ${eventStatus || 'DRAFT'})`);
      err.statusCode = 400;
      throw err;
    }
    if (event.end_date && new Date(event.end_date).getTime() < Date.now()) {
      const err = new Error('Event has already ended, cannot reserve tickets');
      err.statusCode = 400;
      throw err;
    }

    if (!items || items.length === 0) {
      const err = new Error('No ticket items specified for reservation');
      err.statusCode = 400;
      throw err;
    }

    // Consolidate duplicate cart items by ticket_tier_id before validating order limits (TF-V4-F08)
    const consolidatedMap = new Map();
    for (const it of items) {
      if (!it.ticket_tier_id || !it.quantity || it.quantity <= 0) {
        const err = new Error('Invalid item: ticket_tier_id and positive quantity required');
        err.statusCode = 400;
        throw err;
      }
      const tierId = Number(it.ticket_tier_id);
      const qty = Number(it.quantity);
      if (consolidatedMap.has(tierId)) {
        consolidatedMap.get(tierId).quantity += qty;
      } else {
        consolidatedMap.set(tierId, { ...it, ticket_tier_id: tierId, quantity: qty });
      }
    }
    const consolidatedItems = Array.from(consolidatedMap.values());

    for (const it of consolidatedItems) {
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
    let discount = 0;
    let total = 0;
    let appliedPromo = null;
    let orderId = getNextOrderId();
    let orderShortId = `ORD-${1000 + orderId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Cryptographically secure guest session secret and hash (TF-V3-P1-02)
    const guestSessionSecret = crypto.randomBytes(32).toString('hex');
    const guestSecretHash = crypto.createHash('sha256').update(guestSessionSecret).digest('hex');

    try {
      await withTransaction(async (client) => {
        // Atomic Tier Price Locking & Inventory Reservation on consolidated items (TF-V4-P1-03, TF-V4-F08)
        const sortedItems = [...consolidatedItems].sort((a, b) => Number(a.ticket_tier_id) - Number(b.ticket_tier_id));
        reservedItems = [];
        subtotal = 0;

        for (const it of sortedItems) {
          const tierRes = await client.query(
            'SELECT id, event_id, title, price, remaining_quantity, min_per_order, max_per_order FROM ticket_tiers WHERE id = $1 FOR UPDATE',
            [it.ticket_tier_id]
          );

          if (tierRes.rowCount === 0) {
            const err = new Error(`Ticket tier #${it.ticket_tier_id} not found`);
            err.statusCode = 404;
            throw err;
          }

          const tier = tierRes.rows[0];
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

          if (Number(tier.remaining_quantity) < it.quantity) {
            throw new InventoryExhaustedError(tier.id, it.quantity, tier.remaining_quantity);
          }

          // Atomically decrement remaining quantity under tier row lock
          await client.query(
            'UPDATE ticket_tiers SET remaining_quantity = remaining_quantity - $1, updated_at = NOW() WHERE id = $2',
            [it.quantity, tier.id]
          );

          const unitPrice = Number(tier.price);
          const itemTotal = unitPrice * it.quantity;
          subtotal += itemTotal;
          reservedItems.push({
            ticket_tier_id: tier.id,
            name: tier.name || tier.title,
            quantity: it.quantity,
            unit_price: unitPrice,
            total_price: itemTotal,
          });
        }

        // Atomic Voucher Validation & Claim within Database Transaction against real schema (TF-V4-F04, V6-10)
        discount = 0;
        appliedPromo = null;
        if (promoCode && numEventId) {
          const cleanCode = promoCode.toUpperCase().trim();
          const promoLock = await client.query(
            'SELECT id, event_id, code, discount, discount_type, discount_applies_to, applicable_ticket_ids, max_allowed_usages, order_usage_count, expiry_date, deleted_at FROM promo_codes WHERE event_id = $1 AND UPPER(code) = $2 FOR UPDATE',
            [numEventId, cleanCode]
          );

          if (promoLock.rowCount === 0) {
            const promoErr = new Error('Promo code not found or invalid');
            promoErr.statusCode = 400;
            throw promoErr;
          }

          const pRow = promoLock.rows[0];
          if (pRow.deleted_at != null) {
            const promoErr = new Error('Promo code is inactive or disabled');
            promoErr.statusCode = 400;
            throw promoErr;
          }

          const now = new Date();
          if (pRow.expiry_date && new Date(pRow.expiry_date) < now) {
            const promoErr = new Error('Promo code has expired');
            promoErr.statusCode = 400;
            throw promoErr;
          }

          if (pRow.max_allowed_usages != null && Number(pRow.order_usage_count || 0) >= Number(pRow.max_allowed_usages)) {
            // Promo code limit reached: do not apply discount, proceed with order (REQ-COMB-3.5)
            discount = 0;
            appliedPromo = null;
          } else {
            // Tier targeting & applicable_ticket_ids filtering (V6-10, V7-14)
            let applicableTierIds = null;
            if (pRow.applicable_ticket_ids != null) {
              try {
                if (Array.isArray(pRow.applicable_ticket_ids)) {
                  applicableTierIds = pRow.applicable_ticket_ids.map(Number);
                } else if (typeof pRow.applicable_ticket_ids === 'string') {
                  const parsed = JSON.parse(pRow.applicable_ticket_ids);
                  if (!Array.isArray(parsed)) {
                    const err = new Error('Invalid promo code configuration (applicable_ticket_ids must be an array)');
                    err.statusCode = 400;
                    throw err;
                  }
                  applicableTierIds = parsed.map(Number);
                } else {
                  const err = new Error('Invalid promo code configuration (applicable_ticket_ids format error)');
                  err.statusCode = 400;
                  throw err;
                }
              } catch (parseErr) {
                const err = new Error('Invalid promo code configuration (applicable_ticket_ids format error)');
                err.statusCode = 400;
                throw err;
              }

              if (applicableTierIds.length === 0) {
                const promoErr = new Error('Promo code is not assigned to any ticket tiers');
                promoErr.statusCode = 400;
                throw promoErr;
              }
            }

            let eligibleItems = reservedItems;
            if (applicableTierIds && applicableTierIds.length > 0) {
              eligibleItems = reservedItems.filter((it) => applicableTierIds.includes(Number(it.ticket_tier_id)));
              if (eligibleItems.length === 0) {
                const promoErr = new Error('Promo code does not apply to selected ticket tiers');
                promoErr.statusCode = 400;
                throw promoErr;
              }
            }

            const eligibleSubtotal = eligibleItems.reduce((acc, it) => acc + it.total_price, 0);

            let disc = 0;
            const discountType = (pRow.discount_type || 'PERCENTAGE').toUpperCase();
            const discountVal = Number(pRow.discount || 0);
            const appliesTo = (pRow.discount_applies_to || 'ORDER').toUpperCase();

            if (discountType === 'PERCENT' || discountType === 'PERCENTAGE') {
              disc = Math.round((eligibleSubtotal * discountVal) / 100);
            } else if (appliesTo === 'EACH_PRODUCT') {
              disc = eligibleItems.reduce((acc, it) => acc + (discountVal * it.quantity), 0);
            } else {
              disc = discountVal;
            }

            discount = Math.min(disc, eligibleSubtotal);
            appliedPromo = pRow;

            await client.query(
              'UPDATE promo_codes SET order_usage_count = order_usage_count + 1, updated_at = NOW() WHERE id = $1',
              [pRow.id]
            );
          }
        }

        total = Math.max(0, subtotal - discount);
        const publicId = `ord_pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const shortId = `ord_${Date.now().toString().slice(-6)}`;
        const orderInsertSql = `
          INSERT INTO orders (
            short_id, public_id, event_id, user_id, status, subtotal, total_before_additions,
            discount_amount, total_gross, promo_code, session_secret_hash, reserved_until, currency, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $5, $6, $7, $8, $9, $10, 'VND', NOW(), NOW())
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
          guestSecretHash,
          expiresAt,
        ]);

        if (orderRes.rowCount > 0) {
          orderId = Number(orderRes.rows[0].id);
          orderShortId = orderRes.rows[0].short_id;

          for (const it of reservedItems) {
            await client.query(
              `INSERT INTO order_items (
                 order_id, ticket_tier_id, item_name, quantity, price,
                 total_before_additions, total_tax, total_service_fee, total_gross,
                 created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $6, NOW(), NOW())`,
              [orderId, it.ticket_tier_id, it.name, it.quantity, it.unit_price, it.total_price]
            );
          }
        }
      });
    } catch (err) {
      if (err instanceof InventoryExhaustedError || err.statusCode === 409 || err.statusCode === 400 || err.statusCode === 404) {
        throw err;
      }
      // Fail closed: Never silently fallback to RAM when database operation fails (TF-V3-P0-06)
      console.error('[OrdersService.reserveOrder] DB transaction failed, fail closed:', err.message);
      throw err;
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
      session_secret: guestSessionSecret,
      session_secret_hash: guestSecretHash,
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
      guest_session_token: guestSessionSecret,
      session_token: guestSessionSecret,
      seats: [],
      message: 'Tickets reserved successfully for 15 minutes',
    };
    responsePayload.order = { ...responsePayload };

    return responsePayload;
  }

  _verifyGuestSecret(providedSecret, order) {
    if (!providedSecret || typeof providedSecret !== 'string') return false;
    // Strictly reject public identifiers as secrets (TF-P1-B)
    if (
      providedSecret === order.public_id ||
      providedSecret === order.short_id ||
      providedSecret === order.orderShortId ||
      providedSecret === String(order.id)
    ) {
      return false;
    }
    if (order.session_secret && providedSecret === order.session_secret) {
      return true;
    }
    if (order.session_secret_hash) {
      const providedHash = crypto.createHash('sha256').update(providedSecret).digest('hex');
      const a = Buffer.from(providedHash, 'utf8');
      const b = Buffer.from(order.session_secret_hash, 'utf8');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    return false;
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
              }));
            }
          } catch {}

          order = {
            id: Number(row.id),
            orderShortId: row.short_id,
            public_id: row.public_id,
            short_id: row.short_id,
            session_secret_hash: row.session_secret_hash,
            event_id: Number(row.event_id),
            user_id: row.user_id ? Number(row.user_id) : null,
            subtotal: Number(row.subtotal),
            discount: Number(row.discount_amount),
            total: Number(row.total_gross),
            status: row.status,
            payment_status: row.payment_status,
            payment_gateway: row.payment_gateway,
            payment_transaction_id: row.payment_transaction_id,
            provider_txn_ref: row.provider_txn_ref,
            refund_idempotency_key: row.refund_idempotency_key,
            refund_gateway_ref: row.refund_gateway_ref,
            total_refunded: Number(row.total_refunded || 0),
            inventory_released_at: row.inventory_released_at,
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

    await this.authorizeOrderAccess(order, user, sessionSecret);

    return order;
  }

  /**
   * Unified authorization function for all order read/modify/cancel endpoints (TF-V3-P0-03).
   */
  async authorizeOrderAccess(order, user = null, sessionSecret = null) {
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }
    const currentUser = user && user.user ? user.user : user;
    const currentSecret = user && user.sessionSecret ? user.sessionSecret : sessionSecret;

    if (currentUser && currentUser.role === 'ADMIN') {
      return true;
    }

    if (order.user_id) {
      if (currentUser && Number(currentUser.id) === Number(order.user_id)) {
        return true;
      }
      if (currentUser && currentUser.role === 'ORGANIZER') {
        const ev = await eventsService.getEventById(order.event_id);
        if (ev && (Number(ev.account_id) === Number(currentUser.account_id) || Number(ev.organizer_id) === Number(currentUser.id) || Number(ev.user_id) === Number(currentUser.id))) {
          return true;
        }
      }
      const err = new Error('Forbidden: You do not own this order');
      err.statusCode = 403;
      throw err;
    }

    // Guest order: order.user_id is null
    if (currentUser && currentUser.role === 'ORGANIZER') {
      const ev = await eventsService.getEventById(order.event_id);
      if (ev && (Number(ev.account_id) === Number(currentUser.account_id) || Number(ev.organizer_id) === Number(currentUser.id) || Number(ev.user_id) === Number(currentUser.id))) {
        return true;
      }
    }

    const hasValidSecret = this._verifyGuestSecret(currentSecret, order);
    if (!hasValidSecret) {
      const err = new Error('Forbidden: Accessing or modifying guest orders requires valid cryptographic order session token');
      err.statusCode = 403;
      throw err;
    }
    return true;
  }

  async checkoutOrder(
    orderId,
    { buyer = {}, attendees = [], payment_method = 'VNPAY', payment_intent_id = null, user = null, sessionToken = null }
  ) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      order = await this.getOrderById(numId, user, sessionToken).catch(() => null);
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Unified authorization check (TF-V3-P0-03)
    await this.authorizeOrderAccess(order, user, sessionToken);

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

    const createdAttendees = [];
    const attendeeSource = attendees && attendees.length > 0 ? attendees : [{ name: buyer.name, email: buyer.email }];
    let resolvedOrderStatus = 'PENDING_PAYMENT';
    let resolvedPaymentStatus = 'PENDING';
    let resolvedPaymentGateway = payment_method || 'VNPAY';
    let resolvedPaymentTxnId = payment_intent_id || `PI-${order.id}-${Date.now()}`;
    let isFreeOrder = false;

    // Atomic Checkout Database Transaction under row lock (TF-V4-P1-02, TF-V4-F07)
    await withTransaction(async (client) => {
      const checkRes = await client.query(
        'SELECT id, event_id, status, reserved_until, subtotal, discount_amount, total_gross FROM orders WHERE id = $1 FOR UPDATE',
        [numId]
      );
      const isInDb = checkRes.rowCount > 0;

      if (!isInDb) {
        if (process.env.NODE_ENV === 'production') {
          const err = new Error('Order not found');
          err.statusCode = 404;
          throw err;
        }
        if (order.status !== 'RESERVED') {
          const err = new Error(`Cannot checkout order in ${order.status} state`);
          err.statusCode = 400;
          throw err;
        }
        if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
          const err = new Error('Reservation hold has expired. Please reserve your tickets again.');
          err.statusCode = 400;
          throw err;
        }
        isFreeOrder = order.total === 0 || order.subtotal - (order.discount || 0) <= 0;
        const isConfirmedPayment =
          isFreeOrder ||
          payment_method === 'OFFLINE' ||
          payment_method === 'CARD' ||
          Boolean(payment_intent_id) ||
          (process.env.NODE_ENV !== 'production' && payment_method !== 'GATEWAY_REDIRECT');

        if (isConfirmedPayment) {
          resolvedPaymentStatus = isFreeOrder ? 'NO_PAYMENT_REQUIRED' : 'PAID';
          resolvedPaymentGateway = isFreeOrder ? 'FREE' : (payment_method || 'OFFLINE');
          resolvedPaymentTxnId = payment_intent_id || (isFreeOrder ? null : `TXN-${order.id}-${Date.now()}`);
          resolvedOrderStatus = 'COMPLETED';
        } else {
          resolvedPaymentStatus = 'PENDING';
          resolvedPaymentGateway = payment_method || 'VNPAY';
          resolvedPaymentTxnId = payment_intent_id || `PI-${order.id}-${Date.now()}`;
          resolvedOrderStatus = 'PENDING_PAYMENT';
        }

        const isOrderActive = resolvedOrderStatus === 'COMPLETED';
        const initialAttendeeStatus = isOrderActive ? 'ACTIVE' : 'PENDING';

        for (let i = 0; i < attendeeSource.length; i++) {
          const att = attendeeSource[i];
          const attId = getNextAttendeeId();
          const barcode = isOrderActive
            ? `TKT-${order.id}-${attId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
            : null;
          const seat = order.seats && order.seats[i] ? order.seats[i] : null;

          createdAttendees.push({
            id: attId,
            order_id: order.id,
            event_id: order.event_id || 1,
            name: att.name || buyer.name,
            email: (att.email || buyer.email).toLowerCase().trim(),
            ticket_tier_id: att.ticket_tier_id || (order.items && order.items[0] ? order.items[0].ticket_tier_id : 1),
            ticket_code: barcode,
            qr_hash: barcode,
            barcode,
            seat,
            status: initialAttendeeStatus,
          });
        }
        return;
      }

      const dbRow = checkRes.rows[0];
      if (dbRow.status !== 'RESERVED') {
        const err = new Error(`Cannot checkout order in ${dbRow.status} state`);
        err.statusCode = 400;
        throw err;
      }
      if (dbRow.reserved_until && new Date(dbRow.reserved_until).getTime() < Date.now()) {
        const err = new Error('Reservation hold has expired. Please reserve your tickets again.');
        err.statusCode = 400;
        throw err;
      }

      const sub = Number(dbRow.subtotal || 0);
      const disc = Number(dbRow.discount_amount || 0);
      const tot = Number(dbRow.total_gross || 0);
      isFreeOrder = tot === 0 || sub - disc <= 0;

      const isConfirmedPayment =
        isFreeOrder ||
        payment_method === 'OFFLINE' ||
        payment_method === 'CARD' ||
        Boolean(payment_intent_id) ||
        (process.env.NODE_ENV !== 'production' && payment_method !== 'GATEWAY_REDIRECT');

      if (isConfirmedPayment) {
        resolvedPaymentStatus = isFreeOrder ? 'NO_PAYMENT_REQUIRED' : 'PAID';
        resolvedPaymentGateway = isFreeOrder ? 'FREE' : (payment_method || 'OFFLINE');
        resolvedPaymentTxnId = payment_intent_id || (isFreeOrder ? null : `TXN-${order.id}-${Date.now()}`);
        resolvedOrderStatus = 'COMPLETED';
      } else {
        resolvedPaymentStatus = 'PENDING';
        resolvedPaymentGateway = payment_method || 'VNPAY';
        resolvedPaymentTxnId = payment_intent_id || `PI-${order.id}-${Date.now()}`;
        resolvedOrderStatus = 'PENDING_PAYMENT';
      }

      // Order is in DB: execute atomic update and attendee inserts
      await client.query(
        `UPDATE orders
         SET status = $1, first_name = $2, email = $3, payment_status = $4,
             payment_gateway = $5, payment_transaction_id = $6, updated_at = NOW()
         WHERE id = $7`,
        [resolvedOrderStatus, buyer.name, buyer.email, resolvedPaymentStatus, resolvedPaymentGateway, resolvedPaymentTxnId, numId]
      );

      const resolvedEventId = checkRes.rows[0].event_id || order.event_id || 1;
      const isOrderActive = resolvedOrderStatus === 'COMPLETED';
      const initialAttendeeStatus = isOrderActive ? 'ACTIVE' : 'PENDING';

      for (let i = 0; i < attendeeSource.length; i++) {
        const att = attendeeSource[i];
        let attId = getNextAttendeeId();
        const barcode = isOrderActive
          ? `TKT-${order.id}-${attId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
          : null;
        const seat = order.seats && order.seats[i] ? order.seats[i] : null;

        const publicId = `att_pub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const shortId = `att_${Date.now().toString().slice(-6)}`;
        const attRes = await client.query(
          `INSERT INTO attendees (
             short_id, public_id, order_id, ticket_tier_id, event_id,
             first_name, last_name, email, status, barcode, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, NOW(), NOW())
           RETURNING id, short_id, public_id, barcode`,
          [
            shortId,
            publicId,
            order.id,
            att.ticket_tier_id || (order.items && order.items[0] && order.items[0].ticket_tier_id) || 1,
            resolvedEventId,
            att.name || buyer.name,
            (att.email || buyer.email).toLowerCase().trim(),
            initialAttendeeStatus,
            barcode,
          ]
        );
        if (attRes.rowCount > 0) {
          attId = Number(attRes.rows[0].id);
        }

        createdAttendees.push({
          id: attId,
          order_id: order.id,
          event_id: resolvedEventId,
          name: att.name || buyer.name,
          email: (att.email || buyer.email).toLowerCase().trim(),
          ticket_tier_id: att.ticket_tier_id || (order.items && order.items[0] ? order.items[0].ticket_tier_id : 1),
          ticket_code: barcode,
          qr_hash: barcode,
          barcode,
          seat,
          status: initialAttendeeStatus,
        });
      }
    });

    // Mutate in-memory state only after successful database commit (TF-V4-F07)
    order.buyer = {
      name: buyer.name,
      email: buyer.email.toLowerCase().trim(),
    };
    order.payment_method = payment_method;
    order.payment_intent_id = payment_intent_id;
    order.payment_gateway = resolvedPaymentGateway;
    order.payment_status = resolvedPaymentStatus;
    order.payment_transaction_id = resolvedPaymentTxnId;
    order.status = resolvedOrderStatus;
    if (resolvedOrderStatus === 'COMPLETED') {
      order.paid_at = new Date().toISOString();
    }

    // Mutate in-memory state only after successful database commit
    order.attendees = createdAttendees;
    for (const a of createdAttendees) {
      memoryAttendees.set(a.id, a);
    }

    if (order.user_id && order.event_id) {
      recommendationService.trackPurchase(order.user_id, order.event_id);
    }

    return {
      order,
      status: order.status,
      payment_status: order.payment_status,
      payment_url: !isFreeOrder ? `/api/orders/${order.id}/payment` : null,
      payment_intent_id: order.payment_transaction_id,
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

    if (order.promo_code && order.event_id) {
      await promosService.decrementUsage(order.event_id, order.promo_code);
    }

    if (order.event_id) {
      notificationsService.triggerRestockNotification(order.event_id).catch(() => {});
    }
  }

  async cancelOrder(orderId, user = null, sessionSecret = null) {
    const numId = Number(orderId);
    const currentUser = user && user.user ? user.user : user;
    const currentSecret = user && user.sessionSecret ? user.sessionSecret : sessionSecret;

    let order = memoryOrders.get(numId);
    if (!order) {
      order = await this.getOrderById(numId, currentUser, currentSecret).catch(() => null);
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Strictly enforce authorization on every cancel request, including memory hits (TF-V3-P0-03)
    await this.authorizeOrderAccess(order, currentUser, currentSecret);

    if (order.status === 'COMPLETED' || order.status === 'PAID') {
      const err = new Error('Order is already paid/completed, cannot cancel directly. Please use the refund process.');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'REFUNDED') {
      const err = new Error('Order is already refunded, cannot cancel.');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Order is already cancelled');
      err.statusCode = 400;
      throw err;
    }

    if (order.status !== 'RESERVED' && order.status !== 'PENDING_PAYMENT') {
      const err = new Error(`Cannot cancel order in ${order.status} state`);
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

  async getDigitalReceipt(orderIdentifier, { user = null, sessionSecret = null } = {}) {
    let order = null;
    let isAuthorized = false;
    const isNumeric = /^\d+$/.test(String(orderIdentifier).trim());

    if (isNumeric) {
      const numId = Number(orderIdentifier);
      if (!user && !sessionSecret) {
        const err = new Error('Unauthorized: Please log in to view receipt for this order');
        err.statusCode = 401;
        throw err;
      }
      order = memoryOrders.get(numId);
      if (!order) {
        try {
          const res = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [numId]);
          if (res.rowCount > 0) {
            order = await this.getOrderById(numId, user, sessionSecret).catch(() => null);
          }
        } catch {}
      }
      if (order) {
        const isOwner =
          (user && order.user_id && Number(order.user_id) === Number(user.id)) ||
          (user && order.buyer?.email && user.email && order.buyer.email.toLowerCase() === user.email.toLowerCase()) ||
          (sessionSecret && this._verifyGuestSecret(sessionSecret, order));
        if ((user && user.role === 'ADMIN') || isOwner) {
          isAuthorized = true;
        } else {
          const err = new Error('Forbidden: You do not have permission to view this receipt');
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
      if (order && sessionSecret && this._verifyGuestSecret(sessionSecret, order)) {
        isAuthorized = true;
      }
    }

    if (!order) {
      const err = new Error('Receipt not found for the given order identifier');
      err.statusCode = 404;
      throw err;
    }

    const event = await eventsService.getEventById(order.event_id);

    // PII masking for unauthorized public receipt viewing (TF-P1-02)
    const maskEmail = (em) => {
      if (!em || typeof em !== 'string') return '';
      const [local, domain] = em.split('@');
      if (!domain) return '***';
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };
    const maskName = (nm) => {
      if (!nm || typeof nm !== 'string') return '';
      const parts = nm.trim().split(/\s+/);
      return parts.map((p) => (p.length <= 1 ? p : `${p[0]}***`)).join(' ');
    };

    const buyerData = isAuthorized
      ? (order.buyer || {})
      : {
          name: maskName(order.buyer?.name || order.first_name || 'Ticket Buyer'),
          email: maskEmail(order.buyer?.email || order.email || ''),
        };

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
      buyer: buyerData,
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
        name: isAuthorized ? (a.name || a.first_name || 'Ticket Buyer') : maskName(a.name || a.first_name || 'Ticket Buyer'),
        email: isAuthorized ? a.email : maskEmail(a.email),
        ticket_tier_id: a.ticket_tier_id,
        tier_name: a.tier_name || 'General Admission',
        ticket_code: isAuthorized ? a.barcode || a.ticket_code : 'REDACTED_PUBLIC_VIEW',
        qr_hash: isAuthorized ? a.barcode || a.ticket_code : 'REDACTED_PUBLIC_VIEW',
        barcode: isAuthorized ? a.barcode : 'REDACTED_PUBLIC_VIEW',
        seat: null,
        status: a.status,
      })),
    };
  }

  // Delegations to cohesive domain services (Composition over Inheritance)
  async refundOrder(orderId, user = null, reason = 'Customer requested refund', options = {}) {
    return refundService.refundOrder(orderId, user, reason, options);
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

  async checkInAttendee(eventId, data, user) {
    return attendeeService.checkInAttendee(eventId, data, user);
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
      const err = new Error('Unauthorized: Please log in to view orders');
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
          event_title: row.event_title || 'Ticketflow Event',
          event_date: row.starts_at,
          event_location: row.event_location || 'Event Venue',
          subtotal: Number(row.subtotal),
          discount: Number(row.discount_amount),
          total: Number(row.total_gross),
          payment_method: row.payment_gateway || 'VNPAY',
          paymentMethod: row.payment_gateway || 'VNPAY',
          status: row.status,
          payment_status: row.payment_status,
          created_at: row.created_at,
          attendees: attRes.rows.map((a) => ({
            id: Number(a.id),
            short_id: a.short_id,
            name: a.first_name || '',
            email: a.email,
            tier_name: a.tier_name || 'Standard Ticket',
            ticket_code: a.barcode,
            qr_hash: a.barcode,
            barcode: a.barcode,
            status: a.status,
            checked_in_at: a.checked_in_at,
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
          event_title: o.event_title || 'Ticketflow Event',
          event_location: o.event_location || o.location || 'Event Venue',
          event_date: o.event_date || o.starts_at || null,
          subtotal: Number(o.subtotal || o.total || 0),
          discount: Number(o.discount || o.discount_amount || 0),
          total: Number(o.total || 0),
          payment_method: o.payment_method || o.paymentMethod || o.payment_gateway || 'VNPAY',
          paymentMethod: o.payment_method || o.paymentMethod || o.payment_gateway || 'VNPAY',
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
