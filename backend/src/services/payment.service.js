import crypto from 'node:crypto';
import { query, withTransaction, releaseTickets } from '../config/db.js';
import { memoryOrders } from '../data/order-store.js';
import seatingService from './seating.service.js';
import promosService from './promos.service.js';

/**
 * Cohesive Payment Domain Service
 * Encapsulates 100% online payment processing, webhook signature verification,
 * idempotency, and escrow ledger crediting.
 */
export class PaymentService {
  async processPayment(orderId, { gateway = 'VNPAY', payment_method = null, user = null } = {}, ordersService = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order && ordersService) {
      order = await ordersService.getOrderById(numId, user);
    }
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

    if (order.seats && order.seats.length > 0) {
      await seatingService.confirmSeats(order.event_id, order.id, order.seats);
    }

    // Activate attendees and assign barcodes
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
      await query(
        `
        UPDATE orders 
        SET status = 'COMPLETED', payment_status = $1, payment_gateway = $2, payment_transaction_id = $3, updated_at = NOW()
        WHERE id = $4
      `,
        [order.payment_status, order.payment_gateway, transactionId, numId]
      );

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
    } catch {}

    return {
      success: true,
      message: 'Thanh toán trực tuyến hoàn tất thành công',
      transaction_id: transactionId,
      receipt_url: `/api/orders/${order.id}/receipt`,
      order,
    };
  }

  async handlePaymentWebhook(
    { order_id, order_public_id, payment_intent_id, payment_method = 'VNPAY', amount_paid, signature, status = 'SUCCESS' },
    ordersService = null
  ) {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'ticketflow-payment-webhook-secret-2026';
    if (!signature) {
      const err = new Error('Missing payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    const payloadToSign = `${order_id || order_public_id || ''}|${status}|${amount_paid || ''}|${payment_intent_id || ''}`;
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(payloadToSign).digest('hex');

    const signatureBuffer = Buffer.from(String(signature), 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      const err = new Error('Invalid payment webhook signature');
      err.statusCode = 401;
      throw err;
    }

    let order = null;
    if (order_id) {
      order = memoryOrders.get(Number(order_id));
      if (!order && ordersService) {
        order = await ordersService.getOrderById(Number(order_id), { role: 'ADMIN' }).catch(() => null);
      }
    }
    if (!order && order_public_id) {
      for (const o of memoryOrders.values()) {
        if (o.public_id === order_public_id || o.orderShortId === order_public_id) {
          order = o;
          break;
        }
      }
      if (!order && ordersService) {
        try {
          const res = await query('SELECT id FROM orders WHERE public_id = $1 OR short_id = $1 LIMIT 1', [order_public_id]);
          if (res.rowCount > 0) {
            order = await ordersService.getOrderById(res.rows[0].id, { role: 'ADMIN' }).catch(() => null);
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

    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      const err = new Error(`Cannot process payment callback: Order is already ${order.status}`);
      err.statusCode = 400;
      throw err;
    }

    if (status === 'FAILED') {
      order.status = 'CANCELLED';
      order.payment_status = 'PAYMENT_FAILED';
      try {
        await query(
          "UPDATE orders SET status = 'CANCELLED', payment_status = 'PAYMENT_FAILED', updated_at = NOW() WHERE id = $1",
          [order.id]
        );
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

    const expectedTotal = Number(order.total_gross || order.total || 0);
    if (amount_paid !== null && amount_paid !== undefined && String(amount_paid).trim() !== '') {
      const paid = Number(amount_paid);
      if (!isNaN(paid) && paid < expectedTotal) {
        const err = new Error(`Payment amount mismatch: Expected ${expectedTotal}, received ${paid}`);
        err.statusCode = 400;
        throw err;
      }
    }

    order.status = 'COMPLETED';
    order.payment_status = 'PAYMENT_RECEIVED';
    order.payment_gateway = payment_method;
    order.payment_transaction_id = payment_intent_id || `TXN-${payment_method}-${Date.now()}`;
    order.paid_at = new Date().toISOString();

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
      await query(
        `
        UPDATE orders
        SET status = 'COMPLETED', payment_status = $1, payment_gateway = $2, payment_transaction_id = $3, updated_at = NOW()
        WHERE id = $4
      `,
        [order.payment_status, order.payment_gateway, order.payment_transaction_id, order.id]
      );
    } catch {}

    try {
      const totalAmount = Number(order.total_gross || order.total || 0);
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
    } catch (e) {
      console.warn('[handlePaymentWebhook] Escrow credit error:', e.message);
    }

    return {
      success: true,
      message: 'Payment verified and order completed via webhook',
      order,
    };
  }
}

export default new PaymentService();
