import eventsService from '../services/events.service.js';
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
      if (result?.status === 'PARTIALLY_REFUNDED' || result?.success === false) {
        return res.status(409).json({
          message: result?.message || 'Event could not be completely deleted due to partial refund failures',
          ...result,
        });
      }
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

  async uploadImage(req, res, next) {
    try {
      const fileData = req.file ? req.file.buffer : req.body.fileData;
      const fileName = req.file?.originalname || req.body.fileName || 'image.webp';
      const mimeType = req.file?.mimetype || req.body.mimeType || 'image/webp';
      const eventId = req.params?.id || req.body?.eventId;
      const mediaType = req.body?.mediaType || req.params?.type || 'cover';

      if (!fileData) {
        return res.status(400).json({ error: 'Image data (uploaded file or fileData) is required.' });
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
        message: 'Image uploaded and automatically optimized successfully',
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
        message: 'Image deleted successfully',
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
        return res.status(400).json({ error: 'Uploaded file or attachment details required' });
      }

      const attachment = await eventsService.addAttachment(id, attachmentData, req.user);
      return res.status(201).json({
        message: 'Event PDF document uploaded successfully',
        attachment,
      });
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

      if (!att) {
        const err = new Error('Attachment not found');
        err.statusCode = 404;
        throw err;
      }

      // Stream / redirect to real cloud storage file if available (TF-P1-12)
      if (att?.url && att.url.startsWith('http')) {
        return res.redirect(302, att.url);
      }
      if (att?.storage_path) {
        try {
          const signed = await storageService.createSignedUrl('event-attachments', att.storage_path, 3600);
          if (signed?.signedUrl) {
            return res.redirect(302, signed.signedUrl);
          }
        } catch {}
      }

      // Strictly reject fake mock PDF generation; fail closed with 404 (TF-P1-E)
      const err = new Error('Attachment file not found in storage');
      err.statusCode = 404;
      throw err;
    } catch (err) {
      next(err);
    }
  }

  async listAttachments(req, res, next) {
    try {
      const { id } = req.params;
      const attachments = await eventsService.getAttachments(id, req.user);
      return res.json({ attachments });
    } catch (err) {
      next(err);
    }
  }

  async updateAttachment(req, res, next) {
    try {
      const { id, attachmentId } = req.params;
      const updated = await eventsService.updateAttachment(id, attachmentId, req.body, req.user);
      return res.json({ message: 'Attachment updated successfully', attachment: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteAttachment(req, res, next) {
    try {
      const { id, attachmentId } = req.params;
      await eventsService.deleteAttachment(id, attachmentId, req.user);
      return res.json({ message: 'Attachment deleted successfully' });
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

      // Generate UTF-8 CSV with BOM for proper Excel compatibility (Module 2.14 & Open Seating)
      let csv = '\uFEFFNo,Ticket ID,Full Name,Email,Tier,Status\n';
      (attendees || []).forEach((att, idx) => {
        const row = [
          idx + 1,
          sanitizeCsvCell(att.ticket_code || att.barcode || att.short_id || att.id || ''),
          sanitizeCsvCell(att.name || ''),
          sanitizeCsvCell(att.email || ''),
          sanitizeCsvCell(att.tier_name || att.ticket_tier_id || 'Standard Ticket'),
          sanitizeCsvCell(att.status || 'ACTIVE'),
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

      // Generate UTF-8 CSV with BOM for sales report (Module 2.14)
      let csv = '\uFEFFOrder ID,Short Code,Customer Name,Email,Subtotal,Discount,Gross Total,Promo Code,Gateway,Status,Order Date\n';
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
