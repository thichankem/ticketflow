import { query } from '../config/db.js';
import { memoryOrders, memoryAttendees } from '../data/order-store.js';
import eventsService from './events.service.js';
import notificationsService from './notifications.service.js';

/**
 * RefundPolicy Domain Value Object
 * Evaluates whether an order meets the event's refund policy rules.
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
      const err = new Error('Sự kiện này không áp dụng chính sách hoàn hủy vé');
      err.statusCode = 400;
      throw err;
    }

    if (this.maxDaysAfterOrder && order.created_at) {
      const daysSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceOrder > this.maxDaysAfterOrder) {
        const err = new Error(`Không thể hoàn tiền: Đã quá thời hạn ${this.maxDaysAfterOrder} ngày kể từ khi đặt vé.`);
        err.statusCode = 400;
        throw err;
      }
    }

    const eventStart = event ? (event.start_date || event.starts_at) : null;
    if (this.minDaysBeforeEvent && eventStart) {
      const daysBeforeEvent = (new Date(eventStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysBeforeEvent < this.minDaysBeforeEvent) {
        const err = new Error(`Không thể hoàn tiền: Phải gửi yêu cầu trước khi sự kiện bắt đầu ít nhất ${this.minDaysBeforeEvent} ngày.`);
        err.statusCode = 400;
        throw err;
      }
    }

    const refundAmount = Math.round((Number(order.total) || 0) * (this.refundPercentage / 100));
    return {
      refundAmount,
      refundPercentage: this.refundPercentage,
    };
  }
}

/**
 * Cohesive Refund Domain Service
 * Manages individual order refunds, policy verification, escrow accounting, and mass refunds.
 */
export class RefundService {
  async refundOrder(orderId, user = null, ordersService = null) {
    const numId = Number(orderId);
    let order = memoryOrders.get(numId);
    if (!order && ordersService) {
      order = await ordersService.getOrderById(numId, { role: 'ADMIN' }).catch(() => null);
    }
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    // RBAC & IDOR Ownership Check
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

    const hasTransferred = (order.attendees || []).some((a) => a.is_transferred || a.transferred_at);
    if (hasTransferred) {
      const err = new Error('Không thể hoàn tiền đơn hàng có vé đã chuyển nhượng cho người khác. Vui lòng liên hệ trung tâm hỗ trợ.');
      err.statusCode = 400;
      throw err;
    }

    try {
      const dbTransCheck = await query(
        'SELECT id FROM attendees WHERE order_id = $1 AND (is_transferred = TRUE OR transferred_at IS NOT NULL) LIMIT 1',
        [numId]
      );
      if (dbTransCheck.rowCount > 0) {
        const err = new Error('Không thể hoàn tiền đơn hàng có vé đã chuyển nhượng cho người khác. Vui lòng liên hệ trung tâm hỗ trợ.');
        err.statusCode = 400;
        throw err;
      }
    } catch (dbErr) {
      if (dbErr.statusCode === 400) throw dbErr;
    }

    // Policy verification
    const event = await eventsService.getEventById(order.event_id);
    const policy = new RefundPolicy(event?.refund_policy || {});
    const { refundAmount, refundPercentage } = policy.evaluate(order, event);

    if (ordersService && typeof ordersService._restoreInventoryAndHolds === 'function') {
      await ordersService._restoreInventoryAndHolds(order);
    }

    order.status = 'REFUNDED';
    order.total_refunded = refundAmount;
    order.refunded_at = new Date().toISOString();

    if (order.attendees && Array.isArray(order.attendees)) {
      for (const att of order.attendees) {
        att.status = 'CANCELLED';
        const memAtt = memoryAttendees.get(att.id);
        if (memAtt) memAtt.status = 'CANCELLED';
      }
    }

    try {
      await query(
        `UPDATE orders SET status = 'REFUNDED', total_refunded = $1, updated_at = NOW() WHERE id = $2`,
        [refundAmount, numId]
      );
      await query(`UPDATE attendees SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1`, [numId]);
      if (refundAmount > 0) {
        await query(
          `
          UPDATE escrow_accounts
          SET refunded_amount = refunded_amount + $1,
              current_balance = GREATEST(0, current_balance - $1),
              updated_at = NOW()
          WHERE event_id = $2
        `,
          [refundAmount, order.event_id]
        );
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

    for (const att of memoryAttendees.values()) {
      if (Number(att.event_id) === numEventId) {
        att.status = 'CANCELLED';
      }
    }

    try {
      await query(
        `
        UPDATE orders
        SET status = 'REFUNDED', total_refunded = total_gross, updated_at = NOW()
        WHERE event_id = $1 AND status = 'COMPLETED'
      `,
        [numEventId]
      );
      await query(
        `
        UPDATE attendees
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE event_id = $1
      `,
        [numEventId]
      );
      await query(
        `
        UPDATE escrow_accounts
        SET refunded_amount = gross_revenue, current_balance = 0, payout_status = 'REFUNDED', updated_at = NOW()
        WHERE event_id = $1
      `,
        [numEventId]
      );
    } catch {}

    return {
      success: true,
      message: `Đã hoàn tiền 100% hàng loạt cho sự kiện #${numEventId}`,
      count: affectedOrders.length,
    };
  }
}

export default new RefundService();
