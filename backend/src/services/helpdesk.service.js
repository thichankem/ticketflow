/**
 * Helpdesk & Dispute Mediation Service
 * File: backend/src/services/helpdesk.service.js
 *
 * Implements Knowledge Base FAQ, Support Tickets with priority/attachments,
 * and 3-way Dispute Mediation as specified in SPEC.md (Phân hệ 2.16).
 */

import { query } from '../config/db.js';

const memoryTickets = new Map();
const memoryMessages = new Map(); // ticketId -> Array<message>
let nextTicketId = 1000;
let nextMessageId = 5000;

// Knowledge Base FAQ Articles
export const FAQ_ARTICLES = [
  {
    id: 'faq-1',
    category: 'ATTENDEE',
    question: 'Quy trình mua vé và giữ chỗ 15 phút hoạt động như thế nào?',
    answer: 'Khi bạn chọn số lượng vé và bấm "Đặt vé", hệ thống sẽ khóa số lượng vé và vị trí chỗ ngồi đó trong vòng 15 phút. Bạn có 15 phút để điền thông tin và thanh toán trực tuyến 100%. Nếu quá 15 phút không thanh toán, hệ thống sẽ tự động hủy đơn và nhả lại vé cho khách khác.',
  },
  {
    id: 'faq-2',
    category: 'ATTENDEE',
    question: 'Tôi có thể thanh toán tiền mặt tại cửa sự kiện không?',
    answer: 'Không. Nền tảng Ticketflow áp dụng chính sách Online-only 100% để đảm bảo minh bạch dòng tiền và chống đầu cơ vé. Bạn có thể thanh toán qua Thẻ tín dụng/ghi nợ, VNPAY, MOMO hoặc Napas QR.',
  },
  {
    id: 'faq-3',
    category: 'ATTENDEE',
    question: 'Chính sách hoàn hủy vé và nhận lại tiền như thế nào?',
    answer: 'Chính sách hoàn hủy do ban tổ chức từng sự kiện cấu hình (thông thường cho phép hủy trong 3-7 ngày kể từ khi đặt vé và trước ngày diễn ra sự kiện tối thiểu 3 ngày). Nếu đáp ứng điều kiện, bạn có thể bấm "Hủy & Hoàn vé" tại trang Vé của tôi để nhận lại tiền trực tuyến.',
  },
  {
    id: 'faq-4',
    category: 'ATTENDEE',
    question: 'Làm thế nào để chuyển nhượng vé cho bạn bè?',
    answer: 'Tại chi tiết vé của bạn, chọn tính năng "Chuyển nhượng vé" và nhập email người nhận mới. Vé cũ của bạn sẽ bị hủy mã QR và hệ thống sẽ cấp mã QR mới độc nhất cho người nhận để chống gian lận vé quay vòng.',
  },
  {
    id: 'faq-5',
    category: 'ORGANIZER',
    question: 'Cơ chế bảo chứng dòng tiền Escrow hoạt động như thế nào?',
    answer: 'Ticketflow tạm giữ 100% doanh thu bán vé trong tài khoản bảo chứng Escrow suốt thời gian mở bán. Sau khi sự kiện diễn ra thành công từ 3-5 ngày làm việc và không phát sinh tranh chấp lớn, ban tổ chức có thể gửi yêu cầu quyết toán doanh thu về tài khoản ngân hàng sau khi trừ 5% hoa hồng sàn.',
  },
  {
    id: 'faq-6',
    category: 'ORGANIZER',
    question: 'Làm sao để soát vé tại cổng sự kiện?',
    answer: 'Ban tổ chức không cần thuê nhân viên soát vé riêng biệt. Bạn có thể mở trực tiếp Studio Ban Tổ Chức trên điện thoại hoặc máy tính bảng, truy cập tab "Người tham dự & Soát vé" để quét mã QR hoặc tìm theo tên/mã vé để check-in tức thì.',
  },
];

class HelpdeskService {
  /**
   * Get FAQ Knowledge Base
   */
  getFaqs(category = null) {
    if (!category) return FAQ_ARTICLES;
    return FAQ_ARTICLES.filter((f) => f.category.toUpperCase() === category.toUpperCase());
  }

  /**
   * Create a new support ticket
   */
  async createTicket({
    user = null,
    orderId = null,
    eventId = null,
    contact_name,
    contact_email,
    subject,
    category = 'PAYMENT',
    priority = 'MEDIUM',
    description,
    evidence_url = null,
  }) {
    if (!subject || !description || (!contact_email && !user?.email)) {
      const err = new Error('Tiêu đề, mô tả và email liên hệ là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const email = (contact_email || user?.email).toLowerCase().trim();
    const name = contact_name || user?.name || email.split('@')[0];
    const ticketId = ++nextTicketId;
    const shortId = `TCK-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const assignedPriority = validPriorities.includes(priority?.toUpperCase()) ? priority.toUpperCase() : 'MEDIUM';

    const ticketRecord = {
      id: ticketId,
      short_id: shortId,
      user_id: user ? Number(user.id) : null,
      order_id: orderId ? Number(orderId) : null,
      event_id: eventId ? Number(eventId) : null,
      contact_name: name,
      contact_email: email,
      subject,
      category: category.toUpperCase(),
      priority: assignedPriority,
      status: 'OPEN',
      description,
      evidence_url: evidence_url || null,
      resolution_notes: null,
      assigned_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const sql = `
        INSERT INTO support_tickets (
          short_id, user_id, order_id, event_id, contact_name, contact_email,
          subject, category, priority, status, description, evidence_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', $10, $11, NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [
        shortId,
        ticketRecord.user_id,
        ticketRecord.order_id,
        ticketRecord.event_id,
        name,
        email,
        subject,
        ticketRecord.category,
        ticketRecord.priority,
        description,
        evidence_url,
      ]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch {
      // Fallback in-memory
    }

    memoryTickets.set(ticketId, ticketRecord);
    return ticketRecord;
  }

  /**
   * Get ticket by ID or short_id with messages
   */
  async getTicket(idOrShortId, user = null) {
    let ticket = null;
    const isNum = !isNaN(Number(idOrShortId));

    try {
      let sql = 'SELECT * FROM support_tickets WHERE ';
      sql += isNum ? 'id = $1 OR short_id = $2' : 'short_id = $1';
      const params = isNum ? [Number(idOrShortId), String(idOrShortId)] : [String(idOrShortId)];
      const res = await query(sql, params);
      if (res.rowCount > 0) {
        ticket = res.rows[0];
      }
    } catch {
      // Fallback
    }

    if (!ticket) {
      for (const t of memoryTickets.values()) {
        if (String(t.id) === String(idOrShortId) || t.short_id === String(idOrShortId)) {
          ticket = t;
          break;
        }
      }
    }

    if (!ticket) {
      const err = new Error('Support ticket not found');
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check: Ensure user is owner, organizer, or admin
    if (user && user.role !== 'ADMIN') {
      const isOwner = (ticket.user_id && Number(ticket.user_id) === Number(user.id)) ||
                      (ticket.contact_email && ticket.contact_email.toLowerCase() === user.email.toLowerCase());
      if (!isOwner && user.role !== 'ORGANIZER') {
        const err = new Error('Forbidden: You do not have access to this support ticket');
        err.statusCode = 403;
        throw err;
      }
    }

    // Fetch messages
    const messages = await this.getMessages(ticket.id);
    return {
      ...ticket,
      messages,
    };
  }

  /**
   * Add a message / reply to a ticket
   */
  async addMessage(ticketId, user, messageText) {
    if (!messageText || !messageText.trim()) {
      const err = new Error('Nội dung phản hồi không được để trống');
      err.statusCode = 400;
      throw err;
    }

    const ticket = await this.getTicket(ticketId, user);
    const msgId = ++nextMessageId;
    const senderName = user?.name || user?.email || 'Hỗ trợ Ticketflow';
    const senderRole = user?.role || 'ATTENDEE';

    let msgRecord = {
      id: msgId,
      ticket_id: Number(ticket.id),
      sender_id: user ? Number(user.id) : null,
      sender_name: senderName,
      sender_role: senderRole,
      message: messageText.trim(),
      created_at: new Date().toISOString(),
    };

    try {
      const sql = `
        INSERT INTO support_messages (ticket_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `;
      const res = await query(sql, [ticket.id, user ? user.id : null, senderName, senderRole, messageText.trim()]);
      if (res.rowCount > 0) {
        msgRecord = res.rows[0];
      }
    } catch {
      // Fallback
    }

    if (!memoryMessages.has(Number(ticket.id))) {
      memoryMessages.set(Number(ticket.id), []);
    }
    memoryMessages.get(Number(ticket.id)).push(msgRecord);

    // Update ticket status
    if (senderRole === 'ADMIN' || senderRole === 'ORGANIZER') {
      await this.updateTicketStatus(ticket.id, 'WAITING', user, 'Chờ phản hồi từ người mua');
    } else {
      await this.updateTicketStatus(ticket.id, 'IN_PROGRESS', user, 'Khách hàng vừa gửi phản hồi mới');
    }

    return msgRecord;
  }

  /**
   * Get all messages for a ticket
   */
  async getMessages(ticketId) {
    const numId = Number(ticketId);
    try {
      const sql = 'SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY id ASC';
      const res = await query(sql, [numId]);
      if (res.rows) {
        if (res.rows.length > 0 || !memoryMessages.has(numId)) {
          return res.rows;
        }
      }
    } catch {
      // Fallback
    }
    return memoryMessages.get(numId) || [];
  }

  /**
   * List tickets with filters
   */
  async listTickets({ user = null, status = null, category = null } = {}) {
    try {
      let sql = 'SELECT * FROM support_tickets WHERE 1=1';
      const params = [];
      let idx = 1;

      if (user && user.role === 'ATTENDEE') {
        sql += ` AND (user_id = $${idx} OR LOWER(contact_email) = $${idx + 1})`;
        params.push(user.id, user.email.toLowerCase());
        idx += 2;
      }

      if (status) {
        sql += ` AND status = $${idx}`;
        params.push(status.toUpperCase());
        idx++;
      }

      if (category) {
        sql += ` AND category = $${idx}`;
        params.push(category.toUpperCase());
        idx++;
      }

      sql += ' ORDER BY id DESC';
      const res = await query(sql, params);
      if (res.rows) {
        if (res.rows.length > 0 || memoryTickets.size === 0) {
          return res.rows;
        }
      }
    } catch {
      // Fallback
    }

    let list = Array.from(memoryTickets.values());
    if (user && user.role === 'ATTENDEE') {
      list = list.filter(
        (t) =>
          Number(t.user_id) === Number(user.id) ||
          t.contact_email?.toLowerCase() === user.email?.toLowerCase()
      );
    }
    if (status) {
      list = list.filter((t) => t.status === status.toUpperCase());
    }
    if (category) {
      list = list.filter((t) => t.category === category.toUpperCase());
    }
    list.sort((a, b) => b.id - a.id);
    return list;
  }

  /**
   * Update status of a ticket
   */
  async updateTicketStatus(ticketId, newStatus, user = null, resolutionNotes = null) {
    const valid = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];
    if (!valid.includes(newStatus)) {
      const err = new Error('Trạng thái không hợp lệ');
      err.statusCode = 400;
      throw err;
    }

    const numId = Number(ticketId);

    // Multi-tenant check: if caller is ORGANIZER, verify they own the ticket's event
    if (user && user.role === 'ORGANIZER') {
      try {
        const ownership = await query(
          `SELECT t.id FROM support_tickets t
           JOIN events e ON t.event_id = e.id
           WHERE t.id = $1 AND e.organizer_id = $2`,
          [numId, user.id]
        );
        if (ownership.rowCount === 0) {
          const err = new Error('Forbidden: Bạn không có quyền quản lý khiếu nại của sự kiện này');
          err.statusCode = 403;
          throw err;
        }
      } catch (dbErr) {
        if (dbErr.statusCode === 403) throw dbErr;
      }
    } else if (user && user.role === 'ATTENDEE') {
      const err = new Error('Forbidden: Khách mua vé không có quyền thay đổi trạng thái khiếu nại');
      err.statusCode = 403;
      throw err;
    }

    try {
      const sql = `
        UPDATE support_tickets
        SET status = $1, resolution_notes = COALESCE($2, resolution_notes),
            resolved_at = CASE WHEN $1 IN ('RESOLVED', 'CLOSED') THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      const res = await query(sql, [newStatus, resolutionNotes || null, numId]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch {
      // Fallback
    }

    const t = memoryTickets.get(numId);
    if (t) {
      if (user && user.role === 'ORGANIZER' && t.event_id) {
        try {
          const { default: eventsService } = await import('./events.service.js');
          const ev = await eventsService.getEventById(t.event_id);
          if (ev && Number(ev.organizer_id) !== Number(user.id)) {
            const err = new Error('Forbidden: Bạn không có quyền quản lý khiếu nại của sự kiện này');
            err.statusCode = 403;
            throw err;
          }
        } catch (evErr) {
          if (evErr.statusCode === 403) throw evErr;
        }
      }
      t.status = newStatus;
      if (resolutionNotes) t.resolution_notes = resolutionNotes;
      if (newStatus === 'RESOLVED' || newStatus === 'CLOSED') {
        t.resolved_at = new Date().toISOString();
      }
      t.updated_at = new Date().toISOString();
      return t;
    }

    return null;
  }
}

export default new HelpdeskService();
