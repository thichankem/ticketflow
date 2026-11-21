import crypto from 'node:crypto';
import { query, withTransaction, releaseTickets } from '../config/db.js';
import { memoryOrders, memoryAttendees } from '../data/order-store.js';
import promosService from './promos.service.js';
import gatewayAdapter, { PaymentGatewayService } from './gateway-adapter.js';

export { gatewayAdapter, PaymentGatewayService };

/**
 * Cohesive Payment Domain Service
 * Encapsulates 100% online payment processing, standard VNPay gateway adapter,
 * webhook signature verification, atomic idempotency, and escrow ledger accounting.
 */
export class PaymentService {
  /**
   * Initiates payment flow for an order.
   * Free orders (total === 0) complete immediately.
   * Paid orders (total > 0) transition to PENDING_PAYMENT and receive a signed gateway payment URL.
   * Direct mark-paid without gateway confirmation is strictly prohibited in all modes.
   */
  async processPayment(
    orderId,
    { gateway = 'VNPAY', payment_method = null, user = null, sessionToken = null, ipAddr = '127.0.0.1' } = {},
    ordersService = null
  ) {
    const numId = Number(orderId);
    if (!ordersService) {
      const mod = await import('./orders.service.js');
      ordersService = mod.default;
    }
    let order = memoryOrders.get(numId);
    if (!order && ordersService) {
      order = await ordersService.getOrderById(numId, user, sessionToken).catch(() => null);
    }
    if (!order) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1', [numId]);
        if (res.rowCount > 0) {
          order = res.rows[0];
        }
      } catch {}
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Ownership & Cryptographic Guest Session Verification (TF-P0-03, TF-V4-P1-01)
    await ordersService.authorizeOrderAccess(order, user, sessionToken);

    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      const err = new Error(`Cannot process payment for an order that is ${order.status === 'CANCELLED' ? 'cancelled' : 'expired'}`);
      err.statusCode = 400;
      throw err;
    }

    // Reservation TTL check (TF-V4-F06)
    const reservedUntil = order.reserved_until || order.expires_at;
    if (reservedUntil && new Date(reservedUntil).getTime() < Date.now()) {
      const err = new Error('Ticket hold time has expired. Please place a new reservation.');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'COMPLETED' && (order.payment_status === 'PAYMENT_RECEIVED' || order.payment_status === 'NO_PAYMENT_REQUIRED')) {
      return {
        success: true,
        status: 'COMPLETED',
        message: 'Online payment completed successfully',
        transaction_id: order.payment_transaction_id || `TXN-ALREADY-PAID-${order.id}`,
        receipt_url: `/api/orders/${order.id}/receipt`,
        order,
      };
    }

    const selectedGateway = (gateway || payment_method || 'VNPAY').toUpperCase();
    if (selectedGateway === 'OFFLINE' || selectedGateway === 'CASH') {
      const err = new Error(
        'Only online payments are accepted (VNPay, Card). Post-paid or cash methods are not supported.'
      );
      err.statusCode = 400;
      throw err;
    }

    if (selectedGateway !== 'VNPAY' && selectedGateway !== 'FREE') {
      const err = new Error(`Payment method '${selectedGateway}' is not supported. Please select VNPay.`);
      err.statusCode = 400;
      throw err;
    }

    const orderTotal = Number(order.total_gross || order.total || 0);

    // Free order branch: 0 VND completes atomically within DB transaction (TF-V4-P1-02)
    if (orderTotal === 0) {
      const txnId = `FREE-${order.id}-${Date.now()}`;

      await withTransaction(async (client) => {
        await client.query(
          "UPDATE orders SET status = 'COMPLETED', payment_status = 'NO_PAYMENT_REQUIRED', payment_gateway = 'FREE', payment_transaction_id = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2",
          [txnId, numId]
        );
        const attRes = await client.query('SELECT id, barcode FROM attendees WHERE order_id = $1', [numId]);
        for (const a of attRes.rows) {
          let bcode = a.barcode;
          if (!bcode || bcode.startsWith('PENDING') || bcode.startsWith('REDACTED')) {
            bcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          }
          await client.query("UPDATE attendees SET status = 'ACTIVE', barcode = $1, updated_at = NOW() WHERE id = $2", [bcode, a.id]);
        }
      });

      // Update in-memory state only after database transaction commits
      order.status = 'COMPLETED';
      order.payment_status = 'NO_PAYMENT_REQUIRED';
      order.payment_gateway = 'FREE';
      order.payment_transaction_id = txnId;
      order.paid_at = new Date().toISOString();

      if (order.attendees && Array.isArray(order.attendees)) {
        for (const a of order.attendees) {
          a.status = 'ACTIVE';
          if (!a.barcode || a.barcode.startsWith('PENDING')) {
            a.barcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          }
          a.ticket_code = a.barcode;
          a.qr_hash = a.barcode;
        }
      }

      return {
        success: true,
        status: 'COMPLETED',
        message: 'Free tickets confirmed successfully.',
        transaction_id: txnId,
        receipt_url: `/api/orders/${order.id}/receipt`,
        order,
      };
    }

    // Paid order branch: Generate signed payment intent and URL
    const intentId = `PI-${order.id}-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const providerTxnRef = order.provider_txn_ref || order.orderShortId || order.short_id || `TF-ORD-${order.id}`;
    const vnpayUrl = gatewayAdapter.createVNPayUrl({
      orderId: order.id,
      orderCode: providerTxnRef,
      amount: orderTotal,
      ipAddr,
    });

    try {
      await query(
        "UPDATE orders SET status = 'PENDING_PAYMENT', payment_status = 'PENDING', payment_gateway = $1, payment_transaction_id = $2, provider_txn_ref = $3, updated_at = NOW() WHERE id = $4",
        [selectedGateway, intentId, providerTxnRef, numId]
      );
    } catch (dbErr) {
      console.error('[processPayment] DB update failed:', dbErr.message);
      throw dbErr;
    }

    // Mutate in-memory order state strictly AFTER database update succeeds (V8-13)
    order.status = 'PENDING_PAYMENT';
    order.payment_status = 'PENDING';
    order.payment_gateway = selectedGateway;
    order.payment_transaction_id = intentId;
    order.provider_txn_ref = providerTxnRef;

    return {
      success: true,
      status: 'PENDING_PAYMENT',
      message: 'Payment request initialized. Please redirect to payment gateway.',
      payment_url: vnpayUrl,
      payment_intent_id: intentId,
      order,
    };
  }

  /**
   * Processes verified payment webhook callback.
   * Atomically locks order row, updates status, mints barcodes, and credits escrow ledger.
   */
  async handlePaymentWebhook(
    {
      order_id,
      order_public_id,
      payment_intent_id,
      payment_method = 'VNPAY',
      amount_paid,
      signature,
      status = 'SUCCESS',
      vnp_pay_date = null,
      vnp_bank_code = null,
      vnp_txn_ref = null,
      vnp_transaction_status = null,
      transaction_status = null,
      vnp_response_code = null,
      response_code = null,
    },
    ordersService = null
  ) {
    if (process.env.NODE_ENV === 'production' && !process.env.PAYMENT_WEBHOOK_SECRET) {
      const err = new Error('[FATAL] PAYMENT_WEBHOOK_SECRET must be configured in production');
      err.statusCode = 500;
      throw err;
    }

    if (!signature) {
      const err = new Error('Missing payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    const payloadToSign = `${order_id || order_public_id || ''}|${status}|${amount_paid || ''}|${payment_intent_id || ''}`;
    const isValidSignature = gatewayAdapter.verifyWebhookSignature(payloadToSign, signature);

    if (!isValidSignature) {
      const err = new Error('Invalid payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    // V9-03 & V10-P0-01: Validate provider transaction status and response code
    const resolvedTxnStatus = vnp_transaction_status !== undefined ? vnp_transaction_status : transaction_status;
    const resolvedRespCode = vnp_response_code !== undefined ? vnp_response_code : response_code;

    if (status === 'SUCCESS') {
      if (resolvedTxnStatus !== undefined && resolvedTxnStatus !== null && resolvedTxnStatus !== '00') {
        const err = new Error(`Payment webhook rejected: transaction status '${resolvedTxnStatus}' indicates unconfirmed or failed transaction (must be '00')`);
        err.statusCode = 400;
        throw err;
      }
      if (resolvedRespCode !== undefined && resolvedRespCode !== null && resolvedRespCode !== '00') {
        const err = new Error(`Payment webhook rejected: response code '${resolvedRespCode}' indicates failure (must be '00')`);
        err.statusCode = 400;
        throw err;
      }
      if ((vnp_txn_ref || resolvedRespCode) && (!resolvedTxnStatus || resolvedTxnStatus !== '00')) {
        const err = new Error(`Payment webhook rejected: missing or invalid vnp_transaction_status '${resolvedTxnStatus || 'MISSING'}' (must be '00')`);
        err.statusCode = 400;
        throw err;
      }
    }

    // 1. Mandatory amount_paid validation for SUCCESS webhooks BEFORE order lookup or DB writes (V7-05)
    if (status === 'SUCCESS') {
      if (amount_paid == null || amount_paid === '' || isNaN(Number(amount_paid)) || Number(amount_paid) <= 0) {
        const err = new Error('amount_paid is required and must be a positive numeric value for SUCCESS webhook');
        err.statusCode = 400;
        throw err;
      }
    }

    let order = null;
    const numId = Number(order_id);
    if (numId) {
      order = memoryOrders.get(numId);
    }
    if (!order && numId) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1', [numId]);
        if (res.rowCount > 0) order = res.rows[0];
      } catch {}
    }

    if (!order && order_public_id) {
      for (const o of memoryOrders.values()) {
        if (o.public_id === order_public_id || o.orderShortId === order_public_id || o.short_id === order_public_id || o.provider_txn_ref === order_public_id) {
          order = o;
          break;
        }
      }
      if (!order) {
        try {
          const res = await query('SELECT * FROM orders WHERE public_id = $1 OR short_id = $1 OR provider_txn_ref = $1 LIMIT 1', [order_public_id]);
          if (res.rowCount > 0) order = res.rows[0];
        } catch {}
      }
    }

    if (!order) {
      const err = new Error('Order not found for webhook callback');
      err.statusCode = 404;
      throw err;
    }

    const expectedTotal = Number(order.total_gross || order.total || 0);

    // 1. Mandatory amount_paid validation for SUCCESS webhooks BEFORE any branching or DB writes (V7-05)
    if (status === 'SUCCESS') {
      if (amount_paid === null || amount_paid === undefined || String(amount_paid).trim() === '' || isNaN(Number(amount_paid))) {
        const err = new Error('Invalid or missing amount_paid in payment webhook payload');
        err.statusCode = 400;
        throw err;
      }
      const paid = Number(amount_paid);
      if (paid !== expectedTotal) {
        const err = new Error(`Payment amount mismatch: Expected ${expectedTotal}, received ${paid}`);
        err.statusCode = 400;
        throw err;
      }

      // Mandatory genuine provider transaction number for paid orders (V9-08)
      if (expectedTotal > 0 && (!payment_intent_id || String(payment_intent_id).trim() === '')) {
        const err = new Error('Missing or invalid provider transaction number (payment_intent_id / vnp_TransactionNo) for paid order');
        err.statusCode = 400;
        throw err;
      }
    }

    // 2. Strict Idempotency & Terminal State Guards (V7-03)
    if (order.status === 'COMPLETED' || order.status === 'PAID') {
      return { success: true, duplicate: true, already_processed: true, message: 'Order already completed', order };
    }

    if (order.status === 'EXPIRED_PAYMENT_PENDING_REFUND' || order.payment_status === 'LATE_PAYMENT_CAPTURED') {
      return {
        success: true,
        duplicate: true,
        already_processed: true,
        late_payment: true,
        status: 'EXPIRED_PAYMENT_PENDING_REFUND',
        message: 'Late payment callback already recorded and queued for refund',
        order,
      };
    }

    if (order.status === 'REFUNDED') {
      return { success: true, already_processed: true, status: 'REFUNDED', message: 'Order already refunded', order };
    }

    const { formatVnpDate } = await import('./gateway-adapter.js');
    const payDate = vnp_pay_date ? formatVnpDate(vnp_pay_date) : formatVnpDate(new Date());
    const bankCode = vnp_bank_code || 'VNPAY';
    const providerTxnRef = vnp_txn_ref || order.provider_txn_ref || order.orderShortId || order.short_id || `TF-ORD-${order.id}`;

    // 3. Late payment captured after order was EXPIRED or CANCELLED (V6-06, V7-02, V7-03, V7-05, V8-03)
    if (status === 'SUCCESS' && (order.status === 'CANCELLED' || order.status === 'EXPIRED')) {
      const finalTxnId = expectedTotal > 0 ? String(payment_intent_id) : `FREE-${order.id}-${Date.now()}`;
      const providerReqId = `REF-LATE-${order.id}-${Date.now()}`;

      await withTransaction(async (client) => {
        // Atomic inventory release check: ensure tickets are released if not already done (V8-03)
        const orderLock = await client.query('SELECT inventory_released_at FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
        const alreadyReleased = orderLock.rowCount > 0 && Boolean(orderLock.rows[0].inventory_released_at);

        if (!alreadyReleased) {
          await client.query(
            `UPDATE ticket_tiers tt
             SET remaining_quantity = LEAST(tt.initial_quantity, tt.remaining_quantity + oi.quantity),
                 updated_at = NOW()
             FROM order_items oi
             WHERE oi.order_id = $1 AND oi.ticket_tier_id = tt.id`,
            [order.id]
          );
        }

        await client.query(
          `UPDATE orders 
           SET status = 'EXPIRED_PAYMENT_PENDING_REFUND', payment_status = 'LATE_PAYMENT_CAPTURED',
               payment_gateway = $1, payment_transaction_id = $2, provider_txn_ref = COALESCE(provider_txn_ref, $3),
               vnp_pay_date = $4, vnp_bank_code = $5,
               inventory_released_at = COALESCE(inventory_released_at, NOW()), updated_at = NOW()
           WHERE id = $6`,
          [payment_method, finalTxnId, providerTxnRef, payDate, bankCode, order.id]
        );

        await client.query(
          `INSERT INTO refund_requests (
             order_id, idempotency_key, provider, amount, status,
             provider_request_id, reason, created_at, updated_at
           ) VALUES ($1, $2, 'VNPAY', $3, 'REFUND_REQUIRED', $4, $5, NOW(), NOW())
           ON CONFLICT (idempotency_key) DO UPDATE SET
             status = 'REFUND_REQUIRED',
             updated_at = NOW()`,
          [order.id, `LATE-REF-${order.id}`, expectedTotal, providerReqId, 'Automatic refund for late payment captured after reservation TTL expiry']
        );
      });

      // Update in-memory state after commit
      order.status = 'EXPIRED_PAYMENT_PENDING_REFUND';
      order.payment_status = 'LATE_PAYMENT_CAPTURED';
      order.payment_gateway = payment_method;
      order.payment_transaction_id = finalTxnId;
      order.provider_txn_ref = providerTxnRef;
      order.vnp_pay_date = payDate;
      order.vnp_bank_code = bankCode;
      order.inventory_released_at = new Date().toISOString();

      if (order.items && Array.isArray(order.items)) {
        const { default: ticketsService } = await import('./tickets.service.js');
        for (const item of order.items) {
          const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
          if (memTier) memTier.remaining_quantity += item.quantity;
        }
      }

      return {
        success: false,
        late_payment: true,
        status: 'EXPIRED_PAYMENT_PENDING_REFUND',
        payment_status: 'LATE_PAYMENT_CAPTURED',
        message: 'Payment received after ticket hold expired. Inventory was released and automated refund is initiated (REFUND_REQUIRED).',
        order,
      };
    }

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

      if (order.items && Array.isArray(order.items)) {
        try {
          await withTransaction(async (client) => {
            await releaseTickets(client, order.items);
          });
        } catch {}
      }

      if (order.promo_code && order.event_id) {
        await promosService.decrementUsage(order.event_id, order.promo_code).catch(() => {});
      }

      return { success: false, message: 'Payment failed callback processed and inventory released', order };
    }

    let alreadyCompletedInDb = false;
    let isLatePayment = false;
    const finalTxnId = expectedTotal > 0 ? String(payment_intent_id) : `FREE-${order.id}-${Date.now()}`;

    await withTransaction(async (client) => {
      const lockRes = await client.query(
        "SELECT id, status, payment_status, total_gross, event_id, reserved_until FROM orders WHERE id = $1 FOR UPDATE",
        [order.id]
      );
      if (lockRes.rowCount === 0) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      const dbOrder = lockRes.rows[0];

      // Terminal and idempotency states under DB lock (V7-03)
      if (dbOrder.status === 'COMPLETED' || dbOrder.status === 'PAID') {
        alreadyCompletedInDb = true;
        return;
      }

      if (dbOrder.status === 'EXPIRED_PAYMENT_PENDING_REFUND' || dbOrder.payment_status === 'LATE_PAYMENT_CAPTURED') {
        isLatePayment = true;
        return;
      }

      if (dbOrder.status === 'REFUNDED') {
        const err = new Error('Cannot complete payment: Order is already REFUNDED');
        err.statusCode = 409;
        throw err;
      }

      // Re-verify terminal states under lock (TF-V3-P1-03, V6-06, V7-02, V7-03, V8-03)
      if (dbOrder.status === 'CANCELLED' || dbOrder.status === 'EXPIRED') {
        if (status === 'SUCCESS') {
          const providerReqId = `REF-LATE-${order.id}-${Date.now()}`;
          const alreadyReleased = Boolean(dbOrder.inventory_released_at);
          if (!alreadyReleased) {
            await client.query(
              `UPDATE ticket_tiers tt
               SET remaining_quantity = LEAST(tt.initial_quantity, tt.remaining_quantity + oi.quantity),
                   updated_at = NOW()
               FROM order_items oi
               WHERE oi.order_id = $1 AND oi.ticket_tier_id = tt.id`,
              [order.id]
            );
          }

          await client.query(
            `UPDATE orders 
             SET status = 'EXPIRED_PAYMENT_PENDING_REFUND', payment_status = 'LATE_PAYMENT_CAPTURED',
                 payment_gateway = $1, payment_transaction_id = $2, provider_txn_ref = COALESCE(provider_txn_ref, $3),
                 vnp_pay_date = $4, vnp_bank_code = $5,
                 inventory_released_at = COALESCE(inventory_released_at, NOW()), updated_at = NOW()
             WHERE id = $6`,
            [payment_method, finalTxnId, providerTxnRef, payDate, bankCode, order.id]
          );

          await client.query(
            `INSERT INTO refund_requests (
               order_id, idempotency_key, provider, amount, status,
               provider_request_id, reason, created_at, updated_at
             ) VALUES ($1, $2, 'VNPAY', $3, 'REFUND_REQUIRED', $4, $5, NOW(), NOW())
             ON CONFLICT (idempotency_key) DO UPDATE SET
               status = 'REFUND_REQUIRED',
               updated_at = NOW()`,
            [order.id, `LATE-REF-${order.id}`, expectedTotal, providerReqId, 'Automatic refund for late payment captured after reservation TTL expiry']
          );

          isLatePayment = true;
          return;
        }

        const err = new Error(`Cannot complete payment: Order is already ${dbOrder.status}`);
        err.statusCode = 409;
        throw err;
      }

      // Check reservation TTL under DB lock (V7-03, V8-03)
      if (dbOrder.reserved_until && new Date(dbOrder.reserved_until).getTime() < Date.now()) {
        if (status === 'SUCCESS') {
          const providerReqId = `REF-LATE-${order.id}-${Date.now()}`;
          const alreadyReleased = Boolean(dbOrder.inventory_released_at);
          if (!alreadyReleased) {
            await client.query(
              `UPDATE ticket_tiers tt
               SET remaining_quantity = LEAST(tt.initial_quantity, tt.remaining_quantity + oi.quantity),
                   updated_at = NOW()
               FROM order_items oi
               WHERE oi.order_id = $1 AND oi.ticket_tier_id = tt.id`,
              [order.id]
            );
          }

          await client.query(
            `UPDATE orders 
             SET status = 'EXPIRED_PAYMENT_PENDING_REFUND', payment_status = 'LATE_PAYMENT_CAPTURED',
                 payment_gateway = $1, payment_transaction_id = $2, provider_txn_ref = COALESCE(provider_txn_ref, $3),
                 vnp_pay_date = $4, vnp_bank_code = $5,
                 inventory_released_at = COALESCE(inventory_released_at, NOW()), updated_at = NOW()
             WHERE id = $6`,
            [payment_method, finalTxnId, providerTxnRef, payDate, bankCode, order.id]
          );

          await client.query(
            `INSERT INTO refund_requests (
               order_id, idempotency_key, provider, amount, status,
               provider_request_id, reason, created_at, updated_at
             ) VALUES ($1, $2, 'VNPAY', $3, 'REFUND_REQUIRED', $4, $5, NOW(), NOW())
             ON CONFLICT (idempotency_key) DO UPDATE SET
               status = 'REFUND_REQUIRED',
               updated_at = NOW()`,
            [order.id, `LATE-REF-${order.id}`, expectedTotal, providerReqId, 'Automatic refund for late payment captured after reservation TTL expiry']
          );

          isLatePayment = true;
          return;
        }
      }

      // STRICT STATE WHITELIST: Only RESERVED and PENDING_PAYMENT are allowed to complete payment! (V7-03)
      if (dbOrder.status !== 'RESERVED' && dbOrder.status !== 'PENDING_PAYMENT') {
        const err = new Error(`Cannot complete payment: Order status ${dbOrder.status} is not eligible for payment completion`);
        err.statusCode = 409;
        throw err;
      }

      await client.query(
        `UPDATE orders 
         SET status = 'COMPLETED', payment_status = 'PAYMENT_RECEIVED', payment_gateway = $1, payment_transaction_id = $2,
             provider_txn_ref = COALESCE(provider_txn_ref, $3), vnp_pay_date = $4, vnp_bank_code = $5,
             provider_ref_verified = TRUE, verification_source = 'AUTHENTICATED_GATEWAY_WEBHOOK',
             updated_at = NOW()
         WHERE id = $6`,
        [payment_method, finalTxnId, providerTxnRef, payDate, bankCode, order.id]
      );

      // Activate attendees and mint valid barcodes
      const attRes = await client.query('SELECT id, barcode FROM attendees WHERE order_id = $1', [order.id]);
      for (const a of attRes.rows) {
        let bcode = a.barcode;
        if (!bcode || bcode.startsWith('REDACTED') || bcode.startsWith('PENDING')) {
          bcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        await client.query(
          "UPDATE attendees SET status = 'ACTIVE', barcode = $1, updated_at = NOW() WHERE id = $2",
          [bcode, a.id]
        );
      }

      // Credit Escrow Account exactly once using event-configured commission rate (TF-V4-P1-06)
      if (expectedTotal > 0) {
        let commissionRate = 5.0;
        try {
          const evRes = await client.query('SELECT commission_rate FROM events WHERE id = $1', [order.event_id]);
          if (evRes.rowCount > 0 && evRes.rows[0].commission_rate != null) {
            commissionRate = Number(evRes.rows[0].commission_rate);
          }
        } catch {}
        const commission = Math.round(expectedTotal * (commissionRate / 100));
        const balance = expectedTotal - commission;
        await client.query(
          `INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
           VALUES ($1, $2, 0, $3, $4, 'HOLDING', NOW())
           ON CONFLICT (event_id) DO UPDATE SET
             gross_revenue = escrow_accounts.gross_revenue + $2,
             current_balance = escrow_accounts.current_balance + $3,
             commission_held = escrow_accounts.commission_held + $4,
             updated_at = NOW()`,
          [order.event_id, expectedTotal, balance, commission]
        );
      }
    });

    if (isLatePayment) {
      order.status = 'EXPIRED_PAYMENT_PENDING_REFUND';
      order.payment_status = 'LATE_PAYMENT_CAPTURED';
      order.payment_gateway = payment_method;
      order.payment_transaction_id = finalTxnId;
      order.provider_txn_ref = providerTxnRef;
      order.vnp_pay_date = payDate;
      order.vnp_bank_code = bankCode;
      order.inventory_released_at = new Date().toISOString();

      if (order.items && Array.isArray(order.items)) {
        const { default: ticketsService } = await import('./tickets.service.js');
        for (const item of order.items) {
          const memTier = ticketsService.getMemoryTier(item.ticket_tier_id);
          if (memTier) memTier.remaining_quantity += item.quantity;
        }
      }

      return {
        success: false,
        late_payment: true,
        status: 'EXPIRED_PAYMENT_PENDING_REFUND',
        payment_status: 'LATE_PAYMENT_CAPTURED',
        message: 'Payment received after ticket hold expired. Inventory was released and automated refund is initiated (REFUND_REQUIRED).',
        order,
      };
    }

    if (alreadyCompletedInDb) {
      order.status = 'COMPLETED';
      order.payment_status = 'PAYMENT_RECEIVED';
      return { success: true, already_processed: true, message: 'Order already completed in database', order };
    }

    // Update memory order state
    order.status = 'COMPLETED';
    order.payment_status = 'PAYMENT_RECEIVED';
    order.payment_gateway = payment_method;
    order.payment_transaction_id = finalTxnId;
    order.provider_txn_ref = providerTxnRef;
    order.vnp_pay_date = payDate;
    order.vnp_bank_code = bankCode;
    order.paid_at = new Date().toISOString();
    order.provider_ref_verified = true;
    order.verification_source = 'AUTHENTICATED_GATEWAY_WEBHOOK';

    if (order.attendees && Array.isArray(order.attendees)) {
      for (const a of order.attendees) {
        a.status = 'ACTIVE';
        if (!a.barcode || a.barcode.startsWith('PENDING') || a.barcode.startsWith('REDACTED')) {
          a.barcode = `TKT-${order.id}-${a.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        a.ticket_code = a.barcode;
        a.qr_hash = a.barcode;
        const memAtt = memoryAttendees.get(a.id);
        if (memAtt) {
          memAtt.status = 'ACTIVE';
          memAtt.barcode = a.barcode;
          memAtt.ticket_code = a.barcode;
        }
      }
    }

    return {
      success: true,
      message: 'Payment verified and order completed via webhook',
      order,
    };
  }

  /**
   * Helper for automated test suites or development simulation to sign and process
   * a webhook completion with valid HMAC-SHA256 signature.
   */
  async simulateGatewayPayment(orderId, { status = 'SUCCESS', amount = null } = {}, ordersService = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order) {
      try {
        const res = await query('SELECT * FROM orders WHERE id = $1', [numId]);
        if (res.rowCount > 0) order = res.rows[0];
      } catch {}
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    const finalAmount = amount !== null ? amount : Number(order.total_gross || order.total || 0);
    const txnId = order.payment_transaction_id || `PI-${order.id}-${Date.now()}`;
    const payload = `${order.id}|${status}|${finalAmount}|${txnId}`;
    const signature = gatewayAdapter.signWebhookPayload(payload);

    return this.handlePaymentWebhook(
      {
        order_id: order.id,
        payment_intent_id: txnId,
        payment_method: 'VNPAY',
        amount_paid: finalAmount,
        signature,
        status,
      },
      ordersService
    );
  }
}

export default new PaymentService();
