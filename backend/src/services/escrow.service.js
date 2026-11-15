/**
 * Escrow System & Payout Management Service
 * File: backend/src/services/escrow.service.js
 *
 * Implements Escrow Plan A (100% funds held until 3-5 days after event completion)
 * and Platform Commission deduction as specified in SPEC.md (Phân hệ 2.14).
 */

import { query } from '../config/db.js';
import ordersService from './orders.service.js';
import eventsService from './events.service.js';

const memoryPayouts = new Map(); // id -> payout
let nextPayoutId = 500;

class EscrowService {
  /**
   * Get escrow financial statement for a specific event
   */
  async getEventEscrowSummary(eventId, user = null) {
    const numEventId = Number(eventId);
    const event = await eventsService.getEventById(numEventId);
    if (!event) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role !== 'ADMIN' && Number(event.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    // Get all orders for this event
    const eventOrders = await ordersService.getOrdersByEvent(numEventId, { role: 'ADMIN' });

    let grossSales = 0;
    let completedOrdersCount = 0;
    let totalRefunded = 0;
    let refundedOrdersCount = 0;

    // Find any existing payouts for this event
    const existingPayouts = await this.getPayoutsByEvent(numEventId);

    let totalDisbursed = 0;
    for (const p of existingPayouts) {
      if (p.status === 'DISBURSED' || p.status === 'APPROVED' || p.status === 'REQUESTED') {
        totalDisbursed += Number(p.requested_amount || p.net_amount || 0);
      }
    }

    for (const ord of eventOrders) {
      const total = Number(ord.total_gross || ord.total || 0);
      if (ord.status === 'COMPLETED' || ord.status === 'PAID') {
        grossSales += total;
        completedOrdersCount++;
      } else if (ord.status === 'REFUNDED') {
        const refundedPart = ord.total_refunded !== undefined && ord.total_refunded !== null
          ? Number(ord.total_refunded)
          : total;
        totalRefunded += refundedPart;
        refundedOrdersCount++;
      }
    }

    const netEscrowBalance = Math.max(0, grossSales - totalRefunded - totalDisbursed);
    const commissionRate = Number(event.commission_rate || 5); // standard platform commission (default 5%)
    const commissionAmount = Math.round(netEscrowBalance * (commissionRate / 100));
    const netPayoutAmount = Math.max(0, netEscrowBalance - commissionAmount);

    // Event timing & disbursement eligibility
    const eventEndDate = event.ends_at || event.end_date || event.starts_at || event.start_date;
    const now = Date.now();
    let eligibilityStatus = 'HOLDING';
    let daysUntilEligible = 5;
    let canRequestPayout = false;

    if (eventEndDate) {
      const endTimestamp = new Date(eventEndDate).getTime();
      const daysSinceEnd = (now - endTimestamp) / (1000 * 60 * 60 * 24);

      if (daysSinceEnd < 0) {
        eligibilityStatus = 'HOLDING_EVENT_ACTIVE';
        daysUntilEligible = Math.ceil(Math.abs(daysSinceEnd) + 3);
      } else if (daysSinceEnd < 3) {
        eligibilityStatus = 'DISPUTE_COOLING_OFF'; // 3-5 days cooling off period
        daysUntilEligible = Math.ceil(3 - daysSinceEnd);
      } else {
        eligibilityStatus = 'ELIGIBLE_FOR_PAYOUT';
        daysUntilEligible = 0;
        canRequestPayout = netPayoutAmount > 0;
      }
    }

    return {
      event_id: numEventId,
      event_title: event.title,
      currency: event.currency || 'VND',
      gross_sales: grossSales,
      completed_orders_count: completedOrdersCount,
      total_refunded: totalRefunded,
      total_disbursed: totalDisbursed,
      refunded_orders_count: refundedOrdersCount,
      net_escrow_balance: netEscrowBalance,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      net_payout_amount: netPayoutAmount,
      eligibility_status: eligibilityStatus,
      days_until_eligible: daysUntilEligible,
      can_request_payout: canRequestPayout,
      existing_payouts: existingPayouts,
    };
  }

  /**
   * Submit a payout withdrawal request for an event
   */
  async requestPayout(eventId, user, { bank_name, bank_account_number, bank_account_name, bank_account_holder, notes = '' }) {
    const numEventId = Number(eventId);
    const resolvedAccountName = bank_account_name || bank_account_holder;
    if (!bank_name || !bank_account_number || !resolvedAccountName) {
      const err = new Error('Thông tin tài khoản ngân hàng thụ hưởng là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const summary = await this.getEventEscrowSummary(numEventId, user);
    if (!summary.can_request_payout && user.role !== 'ADMIN') {
      const err = new Error(
        `Chưa đủ điều kiện quyết toán. Doanh thu đang được bảo chứng Escrow và sẽ sẵn sàng giải ngân sau khi sự kiện kết thúc 3-5 ngày (còn khoảng ${summary.days_until_eligible} ngày).`
      );
      err.statusCode = 400;
      err.code = 'ESCROW_TIMELOCK_ACTIVE';
      throw err;
    }

    if (summary.net_payout_amount <= 0 && user.role !== 'ADMIN') {
      const err = new Error('Không còn số dư khả dụng để quyết toán (toàn bộ doanh thu đã được giải ngân hoặc hoàn tiền)');
      err.statusCode = 400;
      throw err;
    }

    // SPEC.md REQ-ORG-13 & Section 5.4: Ensure no unresolved disputes or support tickets exist
    try {
      const disputeCheck = await query(
        `SELECT COUNT(*) AS count FROM support_tickets WHERE event_id = $1 AND status IN ('OPEN', 'IN_PROGRESS', 'WAITING')`,
        [numEventId]
      );
      if (disputeCheck.rowCount > 0 && Number(disputeCheck.rows[0].count) > 0) {
        const err = new Error('Không thể yêu cầu quyết toán khi sự kiện còn khiếu nại chưa giải quyết');
        err.statusCode = 400;
        err.code = 'UNRESOLVED_DISPUTES_EXIST';
        throw err;
      }
    } catch (checkErr) {
      if (checkErr.statusCode === 400) throw checkErr;
    }

    // Check if there is already a pending payout
    const existing = summary.existing_payouts.find((p) => p.status === 'REQUESTED' || p.status === 'APPROVED');
    if (existing) {
      const err = new Error('Sự kiện này đã có yêu cầu quyết toán đang được xử lý');
      err.statusCode = 409;
      throw err;
    }

    const accountId = user.account_id || 1;
    const payoutRecord = {
      id: ++nextPayoutId,
      account_id: accountId,
      event_id: numEventId,
      event_title: summary.event_title,
      requested_amount: summary.net_escrow_balance,
      commission_rate: summary.commission_rate,
      commission_amount: summary.commission_amount,
      net_amount: summary.net_payout_amount,
      bank_name,
      bank_account_number,
      bank_account_name: resolvedAccountName,
      status: 'REQUESTED',
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const sql = `
        INSERT INTO payouts (
          account_id, event_id, requested_amount, commission_rate, commission_amount,
          net_amount, bank_name, bank_account_number, bank_account_name, status, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'REQUESTED', $10, NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [
        accountId,
        numEventId,
        summary.net_escrow_balance,
        summary.commission_rate,
        summary.commission_amount,
        summary.net_payout_amount,
        bank_name,
        bank_account_number,
        resolvedAccountName,
        notes,
      ]);
      if (res.rowCount > 0) {
        try {
          await query("UPDATE escrow_accounts SET payout_status = 'REQUESTED', updated_at = NOW() WHERE event_id = $1", [numEventId]);
        } catch {}
        return res.rows[0];
      }
    } catch {
      // Fallback in-memory
    }

    memoryPayouts.set(payoutRecord.id, payoutRecord);
    return payoutRecord;
  }

  /**
   * Get payouts for an event
   */
  async getPayoutsByEvent(eventId) {
    const numEventId = Number(eventId);
    try {
      const sql = 'SELECT * FROM payouts WHERE event_id = $1 ORDER BY id DESC';
      const res = await query(sql, [numEventId]);
      if (res.rows) {
        if (res.rows.length > 0 || memoryPayouts.size === 0) {
          return res.rows;
        }
      }
    } catch {
      // Fallback
    }

    const list = [];
    for (const p of memoryPayouts.values()) {
      if (Number(p.event_id) === numEventId) {
        list.push(p);
      }
    }
    return list;
  }

  /**
   * Admin: List all platform payouts
   */
  async getAllPayouts() {
    try {
      const sql = `
        SELECT p.*, e.title AS event_title, a.name AS account_name
        FROM payouts p
        LEFT JOIN events e ON p.event_id = e.id
        LEFT JOIN accounts a ON p.account_id = a.id
        ORDER BY p.id DESC
      `;
      const res = await query(sql);
      if (res.rows) {
        if (res.rows.length > 0 || memoryPayouts.size === 0) {
          return res.rows;
        }
      }
    } catch {
      // Fallback
    }

    const list = Array.from(memoryPayouts.values());
    list.sort((a, b) => b.id - a.id);
    return list;
  }

  /**
   * Admin: Update payout status (APPROVE / DISBURSE / REJECT)
   */
  async updatePayoutStatus(payoutId, adminUser, status, notes = '') {
    const numId = Number(payoutId);
    const validStatuses = ['APPROVED', 'DISBURSED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      const err = new Error('Trạng thái quyết toán không hợp lệ');
      err.statusCode = 400;
      throw err;
    }

    try {
      const disbursedAt = status === 'DISBURSED' ? new Date().toISOString() : null;
      const sql = `
        UPDATE payouts
        SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3,
            reviewed_at = NOW(), disbursed_at = COALESCE($4, disbursed_at), updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;
      const res = await query(sql, [status, notes || null, adminUser.id, disbursedAt, numId]);
      if (res.rowCount > 0) {
        const updated = res.rows[0];
        try {
          const escrowStatus = status === 'DISBURSED' || status === 'APPROVED' ? 'RELEASED' : (status === 'REJECTED' ? 'HOLDING' : 'REQUESTED');
          const balanceUpdate = status === 'DISBURSED' ? ', current_balance = 0' : '';
          await query(`UPDATE escrow_accounts SET payout_status = $1 ${balanceUpdate}, updated_at = NOW() WHERE event_id = $2`, [escrowStatus, updated.event_id]);
        } catch {}
        return updated;
      }
    } catch {
      // Fallback
    }

    const payout = memoryPayouts.get(numId);
    if (!payout) {
      const err = new Error('Không tìm thấy yêu cầu quyết toán');
      err.statusCode = 404;
      throw err;
    }

    payout.status = status;
    if (notes) payout.notes = notes;
    payout.reviewed_by = adminUser.id;
    payout.reviewed_at = new Date().toISOString();
    if (status === 'DISBURSED') payout.disbursed_at = new Date().toISOString();

    return payout;
  }
}

export default new EscrowService();
