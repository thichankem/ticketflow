/**
 * TicketFlow - Refund Domain Service
 * File: backend/src/services/refund.service.js
 *
 * Implements refund policy rules, 3-stage outbox/staged transactional refund execution,
 * verified payment gateway settlement, and per-order mass refund orchestration.
 */

import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import gatewayAdapter from './gateway-adapter.js';
import eventsService from './events.service.js';
import { memoryOrders, memoryAttendees } from '../data/order-store.js';

/**
 * Value Object: RefundPolicy
 */
export class RefundPolicy {
  constructor(policyData = {}) {
    this.allowRefund = policyData.allow_refund ?? policyData.allow_refunds ?? true;
    this.maxDaysAfterOrder = policyData.max_days_after_order ?? policyData.refund_max_days ?? 7;
    this.minDaysBeforeEvent = policyData.min_days_before_event ?? policyData.refund_min_days_before_event ?? 3;
    this.refundPercentage = policyData.refund_percentage ?? 100;
  }

  evaluate(order, event) {
    if (!this.allowRefund) {
      const err = new Error('This event does not allow ticket refunds');
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();

    if (this.maxDaysAfterOrder && order.created_at) {
      const orderDate = new Date(order.created_at);
      const daysSinceOrder = (now - orderDate) / (1000 * 60 * 60 * 24);
      if (daysSinceOrder > this.maxDaysAfterOrder) {
        const err = new Error(`Refund request window expired (${this.maxDaysAfterOrder} days after order)`);
        err.statusCode = 400;
        throw err;
      }
    }

    if (this.minDaysBeforeEvent && event?.start_date) {
      const eventDate = new Date(event.start_date);
      const daysUntilEvent = (eventDate - now) / (1000 * 60 * 60 * 24);
      if (daysUntilEvent < this.minDaysBeforeEvent) {
        const err = new Error(`Cannot refund tickets within ${this.minDaysBeforeEvent} days of the event`);
        err.statusCode = 400;
        throw err;
      }
    }

    const totalGross = Number(order.total_gross || order.total || 0);
    const refundAmount = Math.round((totalGross * this.refundPercentage) / 100);

    return {
      eligible: true,
      refundPercentage: this.refundPercentage,
      refundAmount,
    };
  }
}

/**
 * RefundService
 */
class RefundService {
  constructor() {
    this._bgInterval = null;
    // Background reconciliation runner removed per architectural specification
  }

  /**
   * Starts background reconciliation runner with unreferenced timer.
   * Periodically scans for stale PROCESSING requests and reconciles PENDING_RECONCILIATION / REFUND_REQUIRED.
   */
  startBackgroundReconciliation(intervalMs = 60000) {
    if (this._bgInterval) return;
    this._bgInterval = setInterval(async () => {
      try {
        await this.handleStaleProcessingRequests();
        await this.reconcilePendingRefunds();
      } catch (err) {
        // V9-12: Background tick errors caught and logged
        console.error('[RefundReconciler] Background tick error:', err?.message || err);
      }
    }, intervalMs);
    if (this._bgInterval && typeof this._bgInterval.unref === 'function') {
      this._bgInterval.unref();
    }
  }

  /**
   * Stops background reconciliation runner.
   */
  stopBackgroundReconciliation() {
    if (this._bgInterval) {
      clearInterval(this._bgInterval);
      this._bgInterval = null;
    }
  }

  /**
   * Stale PROCESSING requests cleaner (V7-06, V8-09):
   * If a refund request remained in PROCESSING for > 5 minutes or past lease expiry,
   * transition to PENDING_RECONCILIATION so querydr can safely verify or complete it.
   */
  async handleStaleProcessingRequests() {
    try {
      const staleRes = await query(
        `UPDATE refund_requests
         SET status = 'PENDING_RECONCILIATION', worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW()
         WHERE status = 'PROCESSING' AND (lease_expires_at < NOW() OR updated_at < NOW() - INTERVAL '5 minutes')
         RETURNING id, order_id`
      );
      if (staleRes.rowCount > 0) {
        for (const row of staleRes.rows) {
          await query(
            "UPDATE orders SET refund_status = 'PENDING_RECONCILIATION', updated_at = NOW() WHERE id = $1 AND refund_status = 'PROCESSING'",
            [row.order_id]
          ).catch(() => {});
        }
      }
      return staleRes.rowCount;
    } catch {
      return 0;
    }
  }

  /**
   * Shared settlement routine that atomically finalizes a refund inside an existing DB transaction client.
   * Cancels attendees, invalidates barcodes, restores inventory with LEAST(), debits escrow account,
   * and transitions order and refund_request records to SUCCEEDED. (TF-V4-P0-03, V7-04, V7-07, V8-03, V8-06, V8-07)
   */
  async finalizeRefundSettlement(client, {
    orderId,
    refundAmount,
    gatewayRefundId,
    responseCode = '00',
    providerRequestId = null,
    eventId = null,
    restoreInventory = true,
    debitEscrow = true,
    priorStatus = 'PROCESSING',
    verifiedByQuerydr = false,
    transactionType = null,
  }) {
    const numId = Number(orderId);

    // 0. Deterministic Lock Ordering: lock orders first, then refund_requests (V8-07)
    const orderLock = await client.query(
      'SELECT id, status, refund_status, inventory_released_at FROM orders WHERE id = $1 FOR UPDATE',
      [numId]
    );
    if (orderLock.rowCount === 0) {
      throw new Error(`Order #${numId} not found during settlement finalization`);
    }

    let reqLock;
    if (providerRequestId) {
      reqLock = await client.query(
        'SELECT id, status FROM refund_requests WHERE provider_request_id = $1 FOR UPDATE',
        [providerRequestId]
      );
    } else {
      reqLock = await client.query(
        'SELECT id, status FROM refund_requests WHERE order_id = $1 FOR UPDATE',
        [numId]
      );
    }

    // V9-13: Finalize refund strictly requires a matching durable refund request row
    if (!reqLock || reqLock.rowCount === 0) {
      throw new Error(`Failed to finalize order #${numId}: no matching refund_requests record found (providerRequestId: ${providerRequestId || 'N/A'})`);
    }

    // 1. Mark order REFUNDED with CAS on prior status
    const orderUpd = await client.query(
      `UPDATE orders 
       SET status = 'REFUNDED', payment_status = 'REFUNDED', refund_status = 'SUCCEEDED',
           total_refunded = $1, refund_gateway_ref = $2, updated_at = NOW() 
       WHERE id = $3 AND (refund_status = $4 OR refund_status = 'PROCESSING' OR refund_status = 'PENDING_RECONCILIATION' OR refund_status = 'REFUND_REQUIRED' OR status = 'EXPIRED_PAYMENT_PENDING_REFUND')`,
      [refundAmount, gatewayRefundId || 'RECONCILED', numId, priorStatus]
    );

    if (orderUpd.rowCount !== 1) {
      throw new Error(`Failed to finalize order ${numId}: order status transition failed (expected priorStatus: ${priorStatus}, rowCount: ${orderUpd.rowCount})`);
    }

    // 2. Mark durable refund request SUCCEEDED (V10-P2-01)
    let reqUpd;
    if (providerRequestId) {
      reqUpd = await client.query(
        `UPDATE refund_requests
         SET status = 'SUCCEEDED', provider_response_id = $1,
             provider_response_code = $2,
             verified_by_querydr = COALESCE($3, verified_by_querydr),
             transaction_type = COALESCE($4, transaction_type),
             worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW()
         WHERE provider_request_id = $5 AND status != 'SUCCEEDED'`,
        [gatewayRefundId || 'RECONCILED', responseCode, verifiedByQuerydr, transactionType, providerRequestId]
      );
    } else {
      reqUpd = await client.query(
        `UPDATE refund_requests
         SET status = 'SUCCEEDED', provider_response_id = $1,
             provider_response_code = $2,
             verified_by_querydr = COALESCE($3, verified_by_querydr),
             transaction_type = COALESCE($4, transaction_type),
             worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW()
         WHERE order_id = $5 AND status != 'SUCCEEDED'`,
        [gatewayRefundId || 'RECONCILED', responseCode, verifiedByQuerydr, transactionType, numId]
      );
    }

    if (!reqUpd || reqUpd.rowCount !== 1) {
      throw new Error(`Failed to finalize refund_requests for order ${numId}: rowCount was ${reqUpd?.rowCount}`);
    }

    // 3. Cancel attendees & invalidate barcodes
    await client.query(
      "UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1",
      [numId]
    );

    // 4. Restore inventory atomically if applicable and not already released (V8-03)
    const alreadyReleased = Boolean(orderLock.rows[0].inventory_released_at);
    if (restoreInventory && !alreadyReleased) {
      await client.query(
        `UPDATE ticket_tiers tt
         SET remaining_quantity = LEAST(tt.initial_quantity, tt.remaining_quantity + oi.quantity),
             updated_at = NOW()
         FROM order_items oi
         WHERE oi.order_id = $1 AND oi.ticket_tier_id = tt.id`,
        [numId]
      );
      await client.query(
        'UPDATE orders SET inventory_released_at = NOW() WHERE id = $1',
        [numId]
      );
    }

    // 5. Debit escrow account atomically only if debitEscrow is true (V8-06, V9-13, V10-P0-03)
    if (debitEscrow && refundAmount > 0 && eventId) {
      const escrowUpd = await client.query(
        `UPDATE escrow_accounts
         SET refunded_amount = refunded_amount + $1,
             current_balance = current_balance - $1,
             updated_at = NOW()
         WHERE event_id = $2 AND current_balance >= $1`,
        [refundAmount, eventId]
      );
      if (escrowUpd.rowCount !== 1) {
        const escrowCheck = await client.query(
          'SELECT current_balance, deficit_amount FROM escrow_accounts WHERE event_id = $1 FOR UPDATE',
          [eventId]
        );
        if (escrowCheck.rowCount === 0) {
          throw new Error(`Escrow account for event ${eventId} does not exist`);
        } else {
          // V10-P0-03: Gateway has already settled the refund! Money has physically left.
          // Model the liability/deficit: deduct remaining balance to 0, record shortage in deficit_amount
          // and log immutable entry in escrow_deficit_ledger. NEVER rollback or abort order finalization!
          const balanceBefore = Number(escrowCheck.rows[0].current_balance || 0);
          const shortage = refundAmount - balanceBefore;

          await client.query(
            `UPDATE escrow_accounts
             SET refunded_amount = refunded_amount + $1,
                 current_balance = GREATEST(0, current_balance - $1),
                 deficit_amount = COALESCE(deficit_amount, 0) + $2,
                 payout_status = 'DEFICIT_RECOVERY',
                 deficit_occurred_at = COALESCE(deficit_occurred_at, NOW()),
                 updated_at = NOW()
             WHERE event_id = $3`,
            [refundAmount, shortage, eventId]
          );

          await client.query(
            `INSERT INTO escrow_deficit_ledger (
               event_id, order_id, refund_request_id, refund_amount, balance_before, balance_after, shortage_amount, reason, created_at
             ) VALUES ($1, $2, (SELECT id FROM refund_requests WHERE order_id = $2 OR provider_request_id = $3 LIMIT 1), $4, $5, 0, $6, $7, NOW())`,
            [
              eventId,
              numId,
              providerRequestId || '',
              refundAmount,
              balanceBefore,
              shortage,
              'Gateway settled refund exceeded available escrow balance. Shortage recorded as organizer liability under DEFICIT_RECOVERY.',
            ]
          );
        }
      }
    }

    return { orderUpdated: orderUpd.rowCount, requestUpdated: reqUpd?.rowCount };
  }

  /**
   * Evaluates refund eligibility and policy terms for an order.
   */
  async evaluateEligibility(orderId) {
    const numId = Number(orderId);
    const { default: ordersService } = await import('./orders.service.js');
    const order = await ordersService.getOrderById(numId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }
    const event = await eventsService.getEventById(order.event_id);
    const policy = new RefundPolicy(event?.refund_policy || {});
    return policy.evaluate(order, event);
  }

  /**
   * Executes atomic order refund using 3-stage outbox pattern:
   *  Stage 1 (DB Intent under row lock): Validates state, locks order row FOR UPDATE, sets refund_status = 'PROCESSING', commits.
   *  Stage 2 (Network outside DB lock): Calls external gateway refund endpoint without holding DB locks.
   *  Stage 3 (DB Finalization under row lock): Locks order row, sets status = 'REFUNDED', restores inventory & debits escrow, commits.
   * (TF-V4-P0-03, TF-V4-P0-04, TF-V4-P1-05)
   */
  async refundOrder(orderId, user = null, reason = 'Customer requested refund', options = {}) {
    const numId = Number(orderId);
    const { default: ordersService } = await import('./orders.service.js');
    const sessionToken = options.sessionToken || options.orderToken || null;

    // 1. Initial lookup & authorization check
    const order = await ordersService.getOrderById(numId, user, sessionToken);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // Enforce authorization for both authenticated users and guest orders (TF-V4-P0-04)
    await ordersService.authorizeOrderAccess(order, user, sessionToken);

    // Idempotency check: if already refunded with matching idempotency key, return idempotent success
    const idempotencyKey = options.idempotencyKey || `REF-IDEM-${numId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    if (order.status === 'REFUNDED') {
      if (options.idempotencyKey && order.refund_idempotency_key === options.idempotencyKey) {
        return {
          success: true,
          status: 'SUCCEEDED',
          refund_id: order.refund_idempotency_key,
          gateway_refund_id: order.refund_gateway_ref,
          settlement_confirmed: true,
          message: 'Refund transaction has already been completed (idempotent)',
          refund_amount: Number(order.total_refunded || order.total_gross || 0),
          refund_percentage: 100,
          order,
        };
      }
      const err = new Error('Order is already refunded');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Order is cancelled and cannot be refunded');
      err.statusCode = 400;
      throw err;
    }
    if (order.status !== 'COMPLETED' && order.status !== 'PAID') {
      const err = new Error('Refunds are only permitted for completed orders');
      err.statusCode = 400;
      throw err;
    }

    // Policy verification
    let refundAmount = Number(order.total_gross || order.total || 0);
    let refundPercentage = 100;
    if (!options.bypassPolicy) {
      const event = await eventsService.getEventById(order.event_id);
      const policy = new RefundPolicy(event?.refund_policy || {});
      const evalRes = policy.evaluate(order, event);
      refundAmount = evalRes.refundAmount;
      refundPercentage = evalRes.refundPercentage;
    }

    const refundId = `REF-${order.id}-${Date.now()}`;
    let txnIdToRefund = order.payment_transaction_id;
    let eventId = order.event_id;
    let isInDb = false;
    let providerRequestId = `REF-${numId}-${Date.now()}`;
    let alreadyCompleted = false;

    // =========================================================================
    // STAGE 1: Transactional Intent Creation under DB Row Lock FOR UPDATE
    // =========================================================================
    await withTransaction(async (client) => {
      const lockRes = await client.query(
        'SELECT id, status, total_gross, payment_transaction_id, payment_gateway, event_id, refund_status, refund_idempotency_key, refund_gateway_ref, total_refunded FROM orders WHERE id = $1 FOR UPDATE',
        [numId]
      );

      if (lockRes.rowCount > 0) {
        isInDb = true;
        const dbOrder = lockRes.rows[0];

        // Check durable refund_requests table first under lock (V6-03, V6-04, V6-05, V7-12)
        const reqRes = await client.query(
          'SELECT id, idempotency_key, provider_request_id, provider_response_id, status, updated_at FROM refund_requests WHERE order_id = $1 FOR UPDATE',
          [numId]
        );

        if (reqRes.rowCount > 0) {
          const existingReq = reqRes.rows[0];
          if (existingReq.status === 'PENDING_RECONCILIATION' || dbOrder.refund_status === 'PENDING_RECONCILIATION') {
            const err = new Error('Refund is awaiting payment gateway processing. Cannot re-process at this time.');
            err.statusCode = 409;
            throw err;
          }
          if (existingReq.status === 'SUCCEEDED' || dbOrder.status === 'REFUNDED') {
            if (options.idempotencyKey && (existingReq.idempotency_key === options.idempotencyKey || dbOrder.refund_idempotency_key === options.idempotencyKey)) {
              alreadyCompleted = true;
              return;
            }
            const err = new Error('Order is already refunded');
            err.statusCode = 400;
            throw err;
          }
          if (existingReq.status === 'PROCESSING') {
            const now = Date.now();
            const updatedAtMs = existingReq.updated_at ? new Date(existingReq.updated_at).getTime() : 0;
            const leaseWindowMs = 45 * 1000; // 45 seconds in-flight lease window (V7-12)
            const isLeaseActive = (now - updatedAtMs) < leaseWindowMs;

            if (isLeaseActive) {
              const err = new Error('Refund is currently being processed by another worker, please try again shortly.');
              err.statusCode = 409;
              throw err;
            }

            // Lease expired (stale PROCESSING): acquire lease by updating updated_at
            await client.query('UPDATE refund_requests SET updated_at = NOW() WHERE id = $1', [existingReq.id]);
            providerRequestId = existingReq.provider_request_id || providerRequestId;
          } else if (existingReq.status === 'REFUND_REQUIRED') {
            providerRequestId = existingReq.provider_request_id || providerRequestId;
            await client.query(
              "UPDATE refund_requests SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1",
              [existingReq.id]
            );
          } else if (existingReq.status === 'FAILED') {
            // Safe retry after definitive gateway rejection: reset outbox row to PROCESSING
            await client.query(
              `UPDATE refund_requests 
               SET status = 'PROCESSING', idempotency_key = $1, provider_request_id = $2,
                   provider_response_code = NULL, updated_at = NOW()
               WHERE id = $3`,
              [idempotencyKey, providerRequestId, existingReq.id]
            );
          }
        } else {
          if (dbOrder.status === 'REFUNDED') {
            if (options.idempotencyKey && dbOrder.refund_idempotency_key === options.idempotencyKey) {
              alreadyCompleted = true;
              return;
            }
            const err = new Error('Order is already refunded');
            err.statusCode = 400;
            throw err;
          }
          if (dbOrder.refund_status === 'PROCESSING') {
            const err = new Error('Refund request is currently processing, duplicate requests rejected.');
            err.statusCode = 400;
            throw err;
          }
          if (dbOrder.refund_status === 'PENDING_RECONCILIATION') {
            const err = new Error('Refund transaction is awaiting gateway resolution.');
            err.statusCode = 409;
            throw err;
          }

          // Record durable refund intent in outbox table
          await client.query(
            `INSERT INTO refund_requests (
               order_id, idempotency_key, provider, amount, status,
               provider_request_id, reason, created_at, updated_at
             ) VALUES ($1, $2, 'VNPAY', $3, 'PROCESSING', $4, $5, NOW(), NOW())`,
            [numId, idempotencyKey, refundAmount, providerRequestId, reason]
          );
        }

        if (dbOrder.status !== 'COMPLETED' && dbOrder.status !== 'PAID') {
          const err = new Error(`Refunds are only permitted for completed orders (current: ${dbOrder.status})`);
          err.statusCode = 400;
          throw err;
        }

        txnIdToRefund = dbOrder.payment_transaction_id || txnIdToRefund;
        eventId = dbOrder.event_id || eventId;

        // Transition order to PROCESSING intent state
        await client.query(
          "UPDATE orders SET refund_status = 'PROCESSING', refund_idempotency_key = $1, updated_at = NOW() WHERE id = $2",
          [idempotencyKey, numId]
        );
      } else {
        // Memory-only fallback check
        const memOrder = memoryOrders.get(numId);
        if (!memOrder) {
          const err = new Error('Order not found');
          err.statusCode = 404;
          throw err;
        }
        if (memOrder.status === 'REFUNDED') {
          if (options.idempotencyKey && memOrder.refund_idempotency_key === options.idempotencyKey) {
            alreadyCompleted = true;
            return;
          }
          const err = new Error('Order is already refunded');
          err.statusCode = 400;
          throw err;
        }
        if (memOrder.refund_status === 'PROCESSING') {
          const err = new Error('Refund request is already in progress');
          err.statusCode = 400;
          throw err;
        }
        memOrder.refund_status = 'PROCESSING';
        memOrder.refund_idempotency_key = idempotencyKey;
      }
    });

    if (alreadyCompleted) {
      return {
        success: true,
        status: 'SUCCEEDED',
        refund_id: idempotencyKey,
        gateway_refund_id: order.refund_gateway_ref,
        settlement_confirmed: true,
        message: 'Refund transaction has already been completed (idempotent)',
        refund_amount: Number(order.total_refunded || order.total_gross || 0),
        refund_percentage: 100,
        order,
      };
    }

    // =========================================================================
    // STAGE 2: External Gateway Settlement OUTSIDE Database Connection Lock
    // =========================================================================
    let gwResult = null;
    const originalTotal = Number(order.total_gross || order.total || refundAmount);
    const isPartial = refundAmount < originalTotal;
    const transactionType = isPartial ? '03' : '02';

    try {
      gwResult = await gatewayAdapter.executeGatewayRefund({
        orderId: numId,
        providerTxnRef: order.provider_txn_ref || order.orderShortId || order.short_id || String(order.id),
        transactionId: txnIdToRefund,
        amount: refundAmount,
        originalAmount: originalTotal,
        transactionType,
        refundId: providerRequestId,
        providerRequestId: providerRequestId,
        createDate: order.vnp_pay_date || null,
        reason,
        allowMock: process.env.NODE_ENV !== 'production' && Boolean(options.allowMock),
      });

      if (!gwResult || (!gwResult.settled && !gwResult.accepted)) {
        throw new Error('Payment gateway declined refund request. Funds were not deducted.');
      }
    } catch (gatewayErr) {
      // Revert processing state on gateway failure (V6-03)
      const isIndeterminate = Boolean(
        gatewayErr.isNetworkTimeout ||
        gatewayErr.statusCode === 502 ||
        !gatewayErr.gatewayResponse
      );
      const targetStatus = isIndeterminate ? 'PENDING_RECONCILIATION' : 'FAILED';
      const responseCode = gatewayErr.gatewayResponse?.vnp_ResponseCode || (isIndeterminate ? 'TIMEOUT' : 'ERROR');

      if (isInDb) {
        await query(
          "UPDATE refund_requests SET status = $1, provider_response_code = $2, updated_at = NOW() WHERE provider_request_id = $3",
          [targetStatus, responseCode, providerRequestId]
        ).catch(() => {});
        await query(
          "UPDATE orders SET refund_status = $1, updated_at = NOW() WHERE id = $2",
          [targetStatus, numId]
        ).catch(() => {});
      } else {
        const memOrder = memoryOrders.get(numId);
        if (memOrder) memOrder.refund_status = targetStatus;
      }
      throw gatewayErr;
    }

    // =========================================================================
    // STAGE 3: Database Finalization under Row Lock FOR UPDATE (V6-05)
    // =========================================================================
    if (isInDb) {
      await withTransaction(async (client) => {
        const finLock = await client.query(
          'SELECT id, status, event_id, refund_status FROM orders WHERE id = $1 FOR UPDATE',
          [numId]
        );
        if (finLock.rowCount === 0) return;
        const currentOrder = finLock.rows[0];
        if (currentOrder.refund_status !== 'PROCESSING') {
          const err = new Error(`Refund status for order #${numId} is no longer PROCESSING (current: ${currentOrder.refund_status})`);
          err.statusCode = 409;
          throw err;
        }

        // Use shared atomic settlement routine (V7-04, V7-07)
        const settlement = await this.finalizeRefundSettlement(client, {
          orderId: numId,
          refundAmount,
          gatewayRefundId: gwResult.gateway_refund_id,
          responseCode: gwResult.response_code || '00',
          providerRequestId,
          eventId,
          restoreInventory: true,
          priorStatus: 'PROCESSING',
          transactionType,
        });
        if (settlement.orderUpdated !== 1) {
          throw new Error(`Failed to finalize order ${numId}: order rowCount was ${settlement.orderUpdated}`);
        }
      });
    }

    // 8. Update in-memory state only after successful database commit
    order.status = 'REFUNDED';
    order.payment_status = 'REFUNDED';
    order.refund_status = 'SUCCEEDED';
    order.refund_idempotency_key = idempotencyKey;
    order.refund_gateway_ref = gwResult?.gateway_refund_id;
    order.total_refunded = refundAmount;
    order.refunded_at = new Date().toISOString();

    if (order.attendees && Array.isArray(order.attendees)) {
      for (const att of order.attendees) {
        att.status = 'CANCELLED';
        const memAtt = memoryAttendees.get(att.id);
        if (memAtt) memAtt.status = 'CANCELLED';
      }
    }

    if (order.items && Array.isArray(order.items)) {
      const { default: ticketsService } = await import('./tickets.service.js');
      for (const it of order.items) {
        const memTier = ticketsService.getMemoryTier(it.ticket_tier_id);
        if (memTier) {
          memTier.remaining_quantity += it.quantity;
        }
      }
    }

    return {
      success: true,
      status: 'SUCCEEDED',
      refund_id: refundId,
      gateway_refund_id: gwResult?.gateway_refund_id,
      settlement_confirmed: true,
      message: 'Ticket cancellation and refund processed successfully',
      refund_amount: refundAmount,
      refund_percentage: refundPercentage,
      order,
    };
  }

  /**
   * Orchestrates mass refunds for an event by processing per-order transactions (TF-V4-P0-02, TF-V4-F10).
   * Authorizes platform admins OR event organizers owning the event.
   * Ensures partial failure tracking, reconciliation audit logs, and provider settlement per order.
   * Prohibits mocks unconditionally in production runtime.
   */
  async massRefundEvent(eventId, user = null) {
    const numEventId = Number(eventId);
    const event = await eventsService.getEventById(numEventId);
    if (!event) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    // Authorize: admin or event organizer owning event (F10, V6-11)
    if (!user) {
      const err = new Error('Unauthorized: Authentication required to execute event mass refunds');
      err.statusCode = 401;
      throw err;
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'admin';
    const isOwnerOrganizer = (user.role === 'ORGANIZER' || user.role === 'organizer') && (
      (event.account_id != null && user.account_id != null && Number(event.account_id) === Number(user.account_id)) ||
      (event.organizer_id != null && Number(event.organizer_id) === Number(user.id)) ||
      (event.user_id != null && Number(event.user_id) === Number(user.id))
    );

    if (!isAdmin && !isOwnerOrganizer) {
      const err = new Error('Forbidden: Only platform admins or event organizers owning this event can orchestrate event mass refunds');
      err.statusCode = 403;
      throw err;
    }

    const dbOrdersRes = await query(
      "SELECT id FROM orders WHERE event_id = $1 AND (status = 'COMPLETED' OR status = 'PAID') ORDER BY id ASC",
      [numEventId]
    );

    const targetOrderIds = new Set(dbOrdersRes.rows.map((r) => Number(r.id)));

    // Include any memory-only orders
    for (const order of memoryOrders.values()) {
      if (order.event_id === numEventId && (order.status === 'COMPLETED' || order.status === 'PAID')) {
        targetOrderIds.add(order.id);
      }
    }

    const succeeded = [];
    const failed = [];
    let totalRefunded = 0;

    for (const orderId of targetOrderIds) {
      try {
        const res = await this.refundOrder(
          orderId,
          user,
          `Mass refund for cancelled event #${numEventId}`,
          { allowMock: process.env.NODE_ENV !== 'production', bypassPolicy: true }
        );
        succeeded.push({
          order_id: orderId,
          refund_amount: res.refund_amount,
          gateway_refund_id: res.gateway_refund_id,
        });
        totalRefunded += (res.refund_amount || 0);
      } catch (err) {
        failed.push({
          order_id: orderId,
          error: err.message,
        });
      }
    }

    return {
      success: failed.length === 0,
      status: failed.length === 0 ? 'SUCCEEDED' : 'PARTIALLY_SUCCEEDED',
      settlement_confirmed: failed.length === 0,
      event_id: numEventId,
      total_orders: targetOrderIds.size,
      succeeded_count: succeeded.length,
      failed_count: failed.length,
      succeeded_orders: succeeded,
      failed_orders: failed,
      total_refunded: totalRefunded,
      message: `Processed mass refund for event #${numEventId}: ${succeeded.length} succeeded, ${failed.length} failed.`,
    };
  }

  /**
   * Reconciles refund requests in PENDING_RECONCILIATION or REFUND_REQUIRED status (V6-04, V7-02, V7-04, V7-07, V7-10, V8-01, V8-02, V8-04, V8-05, V8-06, V8-12, V10-P1-04).
   * Implements strict claim-before-network with distributed worker leases and time slicing for serverless safety.
   */
  async reconcilePendingRefunds(options = {}) {
    const { limit = 10, maxDurationMs = 8000 } = options || {};
    const startTime = Date.now();

    const pendingRes = await query(
      `SELECT rr.id, rr.order_id, rr.provider_request_id, rr.amount, rr.status, rr.reason,
              o.event_id, o.status as order_status, o.payment_status, o.created_at, o.updated_at, o.total_gross,
              o.payment_transaction_id, o.provider_txn_ref, o.short_id, o.vnp_pay_date, o.inventory_released_at
       FROM refund_requests rr
       JOIN orders o ON o.id = rr.order_id
       WHERE rr.status IN ('PENDING_RECONCILIATION', 'REFUND_REQUIRED')
       ORDER BY rr.id ASC
       LIMIT $1`,
      [limit]
    );
    if (!pendingRes.rows || pendingRes.rows.length === 0) {
      return { reconciled_count: 0, results: [] };
    }

    const { formatVnpDate } = await import('./gateway-adapter.js');
    const results = [];
    const workerLeaseId = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

    for (const req of pendingRes.rows) {
      if (Date.now() - startTime >= maxDurationMs) {
        break;
      }
      try {
        if (req.status === 'REFUND_REQUIRED') {
          // V8-01: Claim work item BEFORE making network call!
          let claimed = false;
          await withTransaction(async (client) => {
            const claimRes = await client.query(
              `UPDATE refund_requests
               SET status = 'PROCESSING',
                   worker_lease_id = $1,
                   lease_expires_at = NOW() + INTERVAL '45 seconds',
                   updated_at = NOW()
               WHERE id = $2 AND status = 'REFUND_REQUIRED'
               RETURNING id`,
              [workerLeaseId, req.id]
            );
            if (claimRes.rowCount === 1) {
              await client.query(
                "UPDATE orders SET refund_status = 'PROCESSING', updated_at = NOW() WHERE id = $1 AND (refund_status = 'REFUND_REQUIRED' OR status = 'EXPIRED_PAYMENT_PENDING_REFUND')",
                [req.order_id]
              );
              claimed = true;
            }
          });

          if (!claimed) {
            // Another worker already claimed this work item; skip
            continue;
          }

          // V8-12: Disallow fake fallback transaction IDs
          if (!req.payment_transaction_id) {
            await withTransaction(async (client) => {
              await client.query(
                "UPDATE refund_requests SET status = 'PENDING_MANUAL_REVIEW', reason = 'Missing authoritative payment_transaction_id from provider', worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $1",
                [req.id]
              );
              await client.query(
                "UPDATE orders SET refund_status = 'PENDING_MANUAL_REVIEW', updated_at = NOW() WHERE id = $1",
                [req.order_id]
              );
            });
            results.push({ order_id: req.order_id, status: 'PENDING_MANUAL_REVIEW', error: 'Missing authoritative payment_transaction_id' });
            continue;
          }

          // Perform external gateway call with claim lock held outside DB transaction
          const providerTxnRef = req.provider_txn_ref || req.short_id || `TF-ORD-${req.order_id}`;
          const originalTotal = Number(req.total_gross || req.amount);
          const refundAmt = Number(req.amount);
          const isPartial = refundAmt < originalTotal;
          const transactionType = isPartial ? '03' : '02';

          let gwResult = null;
          try {
            gwResult = await gatewayAdapter.executeGatewayRefund({
              orderId: req.order_id,
              providerTxnRef,
              transactionId: req.payment_transaction_id,
              amount: refundAmt,
              originalAmount: originalTotal,
              transactionType,
              refundId: req.provider_request_id,
              providerRequestId: req.provider_request_id,
              createDate: req.vnp_pay_date || null,
              reason: req.reason || 'Late payment automatic refund',
              allowMock: process.env.NODE_ENV !== 'production',
            });
          } catch (refundErr) {
            const isIndeterminate = Boolean(
              refundErr.isNetworkTimeout ||
              refundErr.statusCode === 502 ||
              !refundErr.gatewayResponse
            );
            const targetStatus = isIndeterminate ? 'PENDING_RECONCILIATION' : 'FAILED';
            const respCode = refundErr.gatewayResponse?.vnp_ResponseCode || (isIndeterminate ? 'TIMEOUT' : 'ERROR');

            await withTransaction(async (client) => {
              await client.query(
                "UPDATE refund_requests SET status = $1, provider_response_code = $2, worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $3",
                [targetStatus, respCode, req.id]
              );
              await client.query(
                "UPDATE orders SET refund_status = $1, updated_at = NOW() WHERE id = $2",
                [targetStatus, req.order_id]
              );
            });
            results.push({ order_id: req.order_id, status: targetStatus, error: refundErr.message });
            continue;
          }

          if (gwResult && (gwResult.settled || gwResult.accepted)) {
            await withTransaction(async (client) => {
              // V8-03: Do not double restore inventory if already released
              const alreadyReleased = Boolean(req.inventory_released_at);
              const restoreInv = !alreadyReleased && (req.order_status === 'COMPLETED' || req.order_status === 'PAID');

              // V8-06: Escrow accounting - do not debit escrow if money was never credited (late payments)
              const isLatePayment = req.order_status === 'EXPIRED_PAYMENT_PENDING_REFUND' || req.payment_status === 'LATE_PAYMENT_CAPTURED';
              const debitEscrow = !isLatePayment;

              await this.finalizeRefundSettlement(client, {
                orderId: req.order_id,
                refundAmount: Number(req.amount),
                gatewayRefundId: gwResult.gateway_refund_id || 'REFUND-AUTO',
                responseCode: gwResult.response_code || '00',
                providerRequestId: req.provider_request_id,
                eventId: req.event_id,
                restoreInventory: restoreInv,
                debitEscrow,
                priorStatus: 'PROCESSING',
                transactionType,
              });
            });
            results.push({ order_id: req.order_id, status: 'SUCCEEDED' });
          }
          continue;
        }

        // Status is PENDING_RECONCILIATION: Claim before querying querydr (V8-01, V8-09)
        let claimed = false;
        await withTransaction(async (client) => {
          const claimRes = await client.query(
            `UPDATE refund_requests
             SET status = 'PROCESSING',
                 worker_lease_id = $1,
                 lease_expires_at = NOW() + INTERVAL '45 seconds',
                 updated_at = NOW()
             WHERE id = $2 AND status = 'PENDING_RECONCILIATION'
             RETURNING id`,
            [workerLeaseId, req.id]
          );
          if (claimRes.rowCount === 1) {
            claimed = true;
          }
        });
        if (!claimed) continue;

        // V8-05: Real payment date in GMT+7
        const txnDate = req.vnp_pay_date || formatVnpDate(req.updated_at || req.created_at || new Date());
        const providerTxnRef = req.provider_txn_ref || req.short_id || String(req.order_id);
        const originalTotal = Number(req.total_gross || req.amount);
        const refundAmt = Number(req.amount);
        const isPartial = refundAmt < originalTotal;
        const expectedType = isPartial ? '03' : '02';

        let queryRes = null;
        try {
          queryRes = await gatewayAdapter.queryTransactionStatus({
            orderId: req.order_id,
            txnRef: providerTxnRef,
            requestId: req.provider_request_id,
            txnDate,
            amount: refundAmt,
            originalAmount: originalTotal,
            expectedTransactionType: expectedType,
            allowMock: process.env.NODE_ENV !== 'production',
          });
        } catch (queryErr) {
          // Revert claim back to PENDING_RECONCILIATION
          await query(
            "UPDATE refund_requests SET status = 'PENDING_RECONCILIATION', worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $1",
            [req.id]
          ).catch(() => {});
          results.push({ order_id: req.order_id, status: 'ERROR', error: queryErr.message });
          continue;
        }

        const respCode = queryRes?.response_code || queryRes?.vnp_ResponseCode;
        const txnStatus = queryRes?.transaction_status || queryRes?.vnp_TransactionStatus;
        const txnType = queryRes?.transaction_type || queryRes?.raw?.vnp_TransactionType;
        const hasAmountInResponse = queryRes?.raw_amount != null || queryRes?.amount != null;
        const rawAmt = Number(queryRes?.raw_amount != null ? queryRes.raw_amount : Number(queryRes?.amount || 0) * 100);

        // V7-10, V10-P1-06: Operational and transient error codes remain PENDING_RECONCILIATION
        // Codes: 02 (partner processing), 03 (temporary invalid data/busy), 91 (not found / sync pending), 99 (system error)
        const isTransientCode = ['02', '03', '91', '99'].includes(respCode);
        if (isTransientCode) {
          await query(
            "UPDATE refund_requests SET status = 'PENDING_RECONCILIATION', worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $1",
            [req.id]
          ).catch(() => {});
          results.push({ order_id: req.order_id, status: 'STILL_PENDING', reason: `Querydr operational response: ${respCode}` });
          continue;
        }

        // V8-04, V9-02, V9-05, V10-P0-02, V10-P2-01: Authoritative refund correlation evidence
        // Must correlate strictly to this specific refund request:
        // 1. respCode === '00'
        // 2. txnType === expectedType ('03' for partial, '02' for full; NEVER '01')
        // 3. rawAmt === Math.round(refundAmt * 100)
        // 4. txnStatus === '00' (success)
        const expectedAmtCents = Math.round(refundAmt * 100);
        const isTypeMatched = txnType === expectedType;
        const isAmountMatched = hasAmountInResponse ? (rawAmt === expectedAmtCents) : true;
        const isAuthoritativeRefundSettled = respCode === '00' && isTypeMatched && isAmountMatched && txnStatus === '00';

        if (isAuthoritativeRefundSettled) {
          await withTransaction(async (client) => {
            const alreadyReleased = Boolean(req.inventory_released_at);
            const restoreInv = !alreadyReleased && (req.order_status === 'COMPLETED' || req.order_status === 'PAID');
            const isLatePayment = req.order_status === 'EXPIRED_PAYMENT_PENDING_REFUND' || req.payment_status === 'LATE_PAYMENT_CAPTURED';
            const debitEscrow = !isLatePayment;

            await this.finalizeRefundSettlement(client, {
              orderId: req.order_id,
              refundAmount: Number(req.amount),
              gatewayRefundId: queryRes.response_id || queryRes.transaction_no || 'RECONCILED',
              responseCode: respCode || '00',
              providerRequestId: req.provider_request_id,
              eventId: req.event_id,
              restoreInventory: restoreInv,
              debitEscrow,
              priorStatus: 'PROCESSING',
              verifiedByQuerydr: true,
              transactionType: txnType,
            });
          });
          results.push({ order_id: req.order_id, status: 'SUCCEEDED' });
        } else if (['09', '94', '95', '98'].includes(respCode) || txnStatus === '02' || txnStatus === '09') {
          // Definitive provider rejection / transaction error / fraud rejection (V10-P1-06)
          await withTransaction(async (client) => {
            await client.query(
              "UPDATE orders SET refund_status = 'FAILED', updated_at = NOW() WHERE id = $1",
              [req.order_id]
            );
            await client.query(
              "UPDATE refund_requests SET status = 'FAILED', provider_response_code = $1, worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $2",
              [respCode || txnStatus || 'REJECTED', req.id]
            );
          });
          results.push({ order_id: req.order_id, status: 'FAILED' });
        } else {
          // Uncorrelated transaction (e.g. txnType === '01' original payment), or in-flight bank status:
          // Keep in PENDING_RECONCILIATION without failing or modifying money state (V10-P0-02)
          await query(
            "UPDATE refund_requests SET status = 'PENDING_RECONCILIATION', worker_lease_id = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $1",
            [req.id]
          ).catch(() => {});
          results.push({
            order_id: req.order_id,
            status: 'STILL_PENDING',
            reason: (txnType === '01')
              ? 'Querydr returned original payment record (01) instead of refund attempt. Awaiting refund settlement.'
              : `Awaiting specific refund settlement (received type: ${txnType || 'unknown'}, status: ${txnStatus || 'unknown'})`,
          });
        }
      } catch (err) {
        results.push({ order_id: req.order_id, status: 'ERROR', error: err.message });
      }
    }
    return { reconciled_count: results.length, results };
  }
}

export { RefundService };
export default new RefundService();
