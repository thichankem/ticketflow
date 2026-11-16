import eventsService from '../services/events.service.js';
import seatingService from '../services/seating.service.js';
import recommendationService from '../services/recommendation.service.js';
import storageService from '../services/storage.service.js';
import { sanitizeCsvCell } from '../utils/csv.js';

class EventsController {
  async list(req, res, next) {
    try {
      const events = await eventsService.listEvents();
      return res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const event = await eventsService.getEventById(id, req.user);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      return res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const event = await eventsService.createEvent(req.user, req.body);
      return res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const event = await eventsService.updateEvent(req.user, id, req.body);
      return res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const result = await eventsService.deleteEvent(req.user, id);
      return res.status(200).json({
        message: result?.message || 'Event deleted',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  async organizerDashboard(req, res, next) {
    try {
      const events = await eventsService.getOrganizerDashboard(req.user);
      return res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  }

  async recommendations(req, res, next) {
    try {
      const { current_id, category, tags, province, limit } = req.query;
      const userId = req.user ? req.user.id : (req.query.user_id || req.ip);
      const parsedTags = typeof tags === 'string' ? tags.split(',') : (Array.isArray(tags) ? tags : []);

      const recommendations = await recommendationService.getRecommendations({
        userId,
        currentEventId: current_id,
        category,
        tags: parsedTags,
        userProvince: province,
        limit: limit ? parseInt(limit, 10) : 6,
      });

      return res.status(200).json({ recommendations });
    } catch (err) {
      next(err);
    }
  }

  async toggleFavorite(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : (req.body.user_id || req.ip);
      const result = recommendationService.toggleFavorite(userId, id);
      return res.status(200).json({
        message: result.favorited ? 'Đã thêm vào sự kiện yêu thích' : 'Đã bỏ yêu thích sự kiện',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  async trackView(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user ? req.user.id : (req.body.user_id || req.ip);
      recommendationService.trackView(userId, id);
      return res.status(200).json({ tracked: true });
    } catch (err) {
      next(err);
    }
  }

  async getSeats(req, res, next) {
    try {
      const { id } = req.params;
      const seatLayout = await seatingService.getSeatLayout(id);
      return res.status(200).json(seatLayout);
    } catch (err) {
      next(err);
    }
  }

  async configureSeats(req, res, next) {
    try {
      const { id } = req.params;
      const event = await eventsService.getEventById(id);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (req.user && req.user.role !== 'ADMIN' && Number(event.account_id) !== Number(req.user.account_id)) {
        return res.status(403).json({ error: 'Forbidden: Event does not belong to user account' });
      }
      const { rows, seats_per_row, seat_map_url, reserved_vip_seats } = req.body;
      const result = seatingService.configureLayout(id, {
        rows,
        seatsPerRow: seats_per_row,
        seatMapImageUrl: seat_map_url,
        reservedVipSeats: reserved_vip_seats,
      });
      return res.status(200).json({
        message: 'Cấu hình sơ đồ chỗ ngồi thành công',
        layout: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async uploadImage(req, res, next) {
    try {
      const fileData = req.file ? req.file.buffer : req.body.fileData;
      const fileName = req.file?.originalname || req.body.fileName || 'image.webp';
      const mimeType = req.file?.mimetype || req.body.mimeType || 'image/webp';
      const eventId = req.params?.id || req.body?.eventId;
      const mediaType = req.body?.mediaType || req.params?.type || 'cover';

      if (!fileData) {
        return res.status(400).json({ error: 'Dữ liệu hình ảnh (tệp tải lên hoặc fileData) là bắt buộc.' });
      }

      const result = await storageService.uploadEventImage({
        fileData,
        fileName,
        mimeType,
        eventId,
        mediaType,
        user: req.user,
      });

      return res.status(200).json({
        success: true,
        message: 'Tải ảnh lên và tự động tối ưu hóa thành công',
        url: result.url,
        path: result.path,
        key: result.key,
        size: result.metadata.size,
        mimeType: result.metadata.mimeType,
        metadata: result.metadata,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteImage(req, res, next) {
    try {
      const eventId = req.params?.id || req.body?.eventId;
      const mediaType = req.params?.type || req.body?.mediaType || 'cover';
      const storagePath = req.body?.storagePath || req.body?.path || req.query?.path;

      const result = await storageService.deleteEventImage({
        eventId,
        mediaType,
        storagePath,
        user: req.user,
      });

      return res.status(200).json({
        success: true,
        message: 'Xóa hình ảnh thành công',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  async uploadAttachment(req, res, next) {
    try {
      const { id } = req.params;
      const { default: storageService } = await import('../services/storage.service.js');
      let attachmentData = null;

      if (req.file) {
        const uploadResult = await storageService.uploadFile(
          'event-docs',
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          req.user
        );
        attachmentData = {
          filename: req.file.originalname,
          url: uploadResult.url,
          size: req.file.size,
        };
      } else if (req.body.filename || req.body.url) {
        attachmentData = {
          filename: req.body.filename || 'document.pdf',
          url: req.body.url || `/api/events/${id}/attachments/${Date.now()}`,
          size: req.body.size || 0,
        };
      } else {
        return res.status(400).json({ error: 'Tệp tải lên hoặc thông tin đính kèm là bắt buộc' });
      }

      const attachment = await eventsService.addAttachment(id, attachmentData, req.user);
      return res.status(201).json({
        message: 'Tải lên tài liệu PDF sự kiện thành công',
        attachment,
      });
    } catch (err) {
      next(err);
    }
  }

  async checkinAttendee(req, res, next) {
    try {
      const { id } = req.params;
      const { barcode, ticket_code } = req.body || {};
      const result = await eventsService.checkinAttendee(id, barcode || ticket_code, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAttachment(req, res, next) {
    try {
      const { id, attachmentId } = req.params;
      const event = await eventsService.getEventById(id);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const att = (event.pdf_attachments || []).find(
        (a) => a.id === attachmentId || a.filename === attachmentId
      );

      // Return PDF attachment metadata and secure stream download headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${att?.filename || 'document.pdf'}"`);

      // Mock safe minimal valid PDF buffer for testing/downloading
      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n218\n%%EOF'
      );

      return res.status(200).send(minimalPdf);
    } catch (err) {
      next(err);
    }
  }

  async getQueueStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { session_id } = req.query;
      const { default: waitingRoomService } = await import('../services/waiting-room.service.js');
      const queueStatus = waitingRoomService.joinOrCheckQueue(id, session_id);
      return res.status(200).json(queueStatus);
    } catch (err) {
      next(err);
    }
  }

  async configureQueue(req, res, next) {
    try {
      const { id } = req.params;
      const event = await eventsService.getEventById(id);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (req.user && req.user.role !== 'ADMIN' && Number(event.account_id) !== Number(req.user.account_id)) {
        return res.status(403).json({ error: 'Forbidden: Event does not belong to user account' });
      }
      const { enabled, max_concurrent, admission_rate } = req.body;
      const { default: waitingRoomService } = await import('../services/waiting-room.service.js');
      const result = waitingRoomService.configureWaitingRoom(id, {
        enabled,
        maxConcurrent: max_concurrent,
        admissionRatePerMin: admission_rate,
      });
      return res.status(200).json({
        message: 'Cấu hình phòng chờ ảo thành công',
        config: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getNotifications(req, res, next) {
    try {
      const { default: notificationsService } = await import('../services/notifications.service.js');
      const notifications = await notificationsService.getUserNotifications(req.user.id);
      return res.status(200).json({ notifications });
    } catch (err) {
      next(err);
    }
  }

  async markNotificationRead(req, res, next) {
    try {
      const { id } = req.params;
      const { default: notificationsService } = await import('../services/notifications.service.js');
      await notificationsService.markAsRead(id, req.user.id);
      return res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async markAllNotificationsRead(req, res, next) {
    try {
      const { default: notificationsService } = await import('../services/notifications.service.js');
      await notificationsService.markAllAsRead(req.user.id);
      return res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async deleteNotification(req, res, next) {
    try {
      const { id } = req.params;
      const { default: notificationsService } = await import('../services/notifications.service.js');
      await notificationsService.deleteNotification(id, req.user.id);
      return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  async clearNotifications(req, res, next) {
    try {
      const { default: notificationsService } = await import('../services/notifications.service.js');
      await notificationsService.clearAllNotifications(req.user.id);
      return res.status(200).json({ success: true, message: 'All notifications cleared' });
    } catch (err) {
      next(err);
    }
  }

  async getAnnouncements(req, res, next) {
    try {
      const { default: announcementsService } = await import('../services/announcements.service.js');
      const announcements = await announcementsService.getAnnouncements();
      return res.status(200).json({ announcements });
    } catch (err) {
      next(err);
    }
  }

  async exportAttendees(req, res, next) {
    try {
      const { id } = req.params;
      const { default: ordersService } = await import('../services/orders.service.js');
      const attendees = await ordersService.getAttendeesByEvent(id, req.user);

      // Generate UTF-8 CSV with BOM for proper Excel compatibility (Phân hệ 2.14 & Open Seating)
      let csv = '\uFEFFSTT,Mã Định Danh Vé,Họ và Tên,Email,Hạng Vé,Trạng Thái,Thời Gian Soát Vé\n';
      (attendees || []).forEach((att, idx) => {
        const row = [
          idx + 1,
          sanitizeCsvCell(att.ticket_code || att.barcode || att.short_id || att.id || ''),
          sanitizeCsvCell(att.name || ''),
          sanitizeCsvCell(att.email || ''),
          sanitizeCsvCell(att.tier_name || att.ticket_tier_id || 'Vé Tiêu Chuẩn'),
          sanitizeCsvCell(att.status || 'ACTIVE'),
          sanitizeCsvCell(att.checked_in_at ? new Date(att.checked_in_at).toLocaleString('vi-VN') : 'Chưa vào cửa'),
        ];
        csv += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="attendees_event_${id}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  async exportSales(req, res, next) {
    try {
      const { id } = req.params;
      const { default: ordersService } = await import('../services/orders.service.js');
      const orders = await ordersService.getOrdersByEvent(id, req.user);

      // Generate UTF-8 CSV with BOM for sales report (Phân hệ 2.14)
      let csv = '\uFEFFMã Đơn Hàng,Mã Ngắn,Khách Hàng,Email,Tổng Tiền Trước Giảm,Giảm Giá,Tổng Thực Thu,Mã Khuyến Mãi,Cổng Thanh Toán,Trạng Thái,Thời Gian Đặt\n';
      (orders || []).forEach((ord) => {
        const row = [
          sanitizeCsvCell(ord.id || ''),
          sanitizeCsvCell(ord.short_id || ''),
          sanitizeCsvCell(ord.customer_name || ord.first_name || ''),
          sanitizeCsvCell(ord.customer_email || ord.email || ''),
          ord.subtotal || ord.total_before_additions || 0,
          ord.discount_amount || ord.discount || 0,
          ord.total_gross || ord.total || 0,
          sanitizeCsvCell(ord.promo_code || ''),
          sanitizeCsvCell(ord.payment_gateway || ord.payment_method || 'VNPAY'),
          sanitizeCsvCell(ord.status || 'COMPLETED'),
          sanitizeCsvCell(ord.created_at || ''),
        ];
        csv += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report_event_${id}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }
}

export default new EventsController();
