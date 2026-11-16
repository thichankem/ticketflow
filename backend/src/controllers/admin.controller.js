import authService from '../services/auth.service.js';
import eventsService from '../services/events.service.js';
import ordersService from '../services/orders.service.js';
import { query } from '../config/db.js';
import { sanitizeCsvCell } from '../utils/csv.js';

class AdminController {
  async getStats(req, res, next) {
    try {
      const stats = await authService.getStats();
      return res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  }

  async suspendUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await authService.suspendUser(id);
      return res.status(200).json({
        message: 'User suspended successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }

  async getUsers(req, res, next) {
    try {
      const users = await authService.getAllUsers();
      return res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const user = await authService.updateUserRole(id, role);
      return res.status(200).json({
        message: 'User role updated successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }

  async toggleUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const user = await authService.toggleUserStatus(id);
      return res.status(200).json({
        message: 'User status toggled successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      await authService.deleteUser(id);
      return res.status(200).json({
        message: 'User deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async createUser(req, res, next) {
    try {
      const user = await authService.adminCreateUser(req.body);
      return res.status(201).json({
        message: 'User created successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await authService.adminUpdateUser(id, req.body);
      return res.status(200).json({
        message: 'User updated successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }

  async getEvents(req, res, next) {
    try {
      const events = await eventsService.getAllEventsWithMetrics();
      return res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  }

  async updateEventStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const event = await eventsService.updateEventStatus(id, status);
      return res.status(200).json({
        message: 'Event status updated successfully',
        event,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteEvent(req, res, next) {
    try {
      const { id } = req.params;
      const result = await eventsService.adminDeleteEvent(id);
      return res.status(200).json({
        message: result?.message || 'Event deleted successfully',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getOrders(req, res, next) {
    try {
      const orders = await ordersService.getAllOrders();
      return res.status(200).json({ orders });
    } catch (err) {
      next(err);
    }
  }

  async massRefund(req, res, next) {
    try {
      const { id } = req.params;
      const result = await ordersService.massRefundEvent(id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async exportAuditReport(req, res, next) {
    try {
      const orders = await ordersService.getAllOrders();
      let csv = '\uFEFFMã Đơn,Mã Ngắn,Sự Kiện ID,Khách Hàng,Email,Tổng Tiền,Thực Thu,Mã KM,Cổng Thanh Toán,Trạng Thái,Thời Gian\n';
      (orders || []).forEach((ord) => {
        const row = [
          sanitizeCsvCell(ord.id || ''),
          sanitizeCsvCell(ord.short_id || ''),
          sanitizeCsvCell(ord.event_id || ''),
          sanitizeCsvCell(ord.customer_name || ord.first_name || ''),
          sanitizeCsvCell(ord.customer_email || ord.email || ''),
          ord.subtotal || ord.total_before_additions || 0,
          ord.total_gross || ord.total || 0,
          sanitizeCsvCell(ord.promo_code || ''),
          sanitizeCsvCell(ord.payment_gateway || ord.payment_method || 'ONLINE'),
          sanitizeCsvCell(ord.status || 'COMPLETED'),
          sanitizeCsvCell(ord.created_at || ''),
        ];
        csv += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="platform_financial_audit.csv"');
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  async disputeRefund(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};
      const { default: helpdeskService } = await import('../services/helpdesk.service.js');
      const ticket = await helpdeskService.getTicket(id, req.user);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      let refundResult = null;
      if (ticket.order_id) {
        refundResult = await ordersService.refundOrder(ticket.order_id, req.user);
      }
      await helpdeskService.updateTicketStatus(id, 'RESOLVED', req.user, reason || 'Admin dispute refund override approved');
      return res.status(200).json({
        success: true,
        message: 'Admin dispute refund processed successfully',
        ticket_id: id,
        refund: refundResult,
      });
    } catch (err) {
      next(err);
    }
  }

  // ----------------------------------------------------
  // Broadcast Announcements (REQ-ADM-09: Thông Báo Chung)
  // ----------------------------------------------------
  async getAnnouncements(req, res, next) {
    try {
      const { default: announcementsService } = await import('../services/announcements.service.js');
      const announcements = await announcementsService.getAnnouncements();
      return res.status(200).json({ announcements });
    } catch (err) {
      next(err);
    }
  }

  async createAnnouncement(req, res, next) {
    try {
      const { title, message, type, target_role } = req.body;
      const { default: announcementsService } = await import('../services/announcements.service.js');
      const result = await announcementsService.createAnnouncement({
        title,
        message,
        type,
        targetRole: target_role,
        createdBy: req.user?.id,
      });
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async deleteAnnouncement(req, res, next) {
    try {
      const { id } = req.params;
      const { default: announcementsService } = await import('../services/announcements.service.js');
      const result = await announcementsService.deleteAnnouncement(id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export default new AdminController();
