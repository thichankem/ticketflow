import { Router } from 'express';
import multer from 'multer';
import eventsController from '../controllers/events.controller.js';
import ticketsController from '../controllers/tickets.controller.js';
import promosController from '../controllers/promos.controller.js';
import ordersController from '../controllers/orders.controller.js';
import reportsController from '../controllers/reports.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const handleUploadMiddleware = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    memoryUpload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds the maximum allowed limit (10MB).' });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  } else {
    next();
  }
};

// Organizer Dashboard (Must be before /:id)
router.get('/organizer/dashboard', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.organizerDashboard);

// User In-App Notifications (Must be before /:id)
router.get('/notifications', authenticateToken, eventsController.getNotifications);
router.put('/notifications/read-all', authenticateToken, eventsController.markAllNotificationsRead);
router.delete('/notifications/clear-all', authenticateToken, eventsController.clearNotifications);
router.delete('/notifications', authenticateToken, eventsController.clearNotifications);
router.put('/notifications/:id/read', authenticateToken, eventsController.markNotificationRead);
router.delete('/notifications/:id', authenticateToken, eventsController.deleteNotification);

// Platform Broadcast Announcements
router.get('/announcements', eventsController.getAnnouncements);

// Recommendations (Must be before /:id)
router.get('/recommendations', eventsController.recommendations);

// Image Upload with Auto-Formatting & Size Compression
router.post('/upload-image', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), handleUploadMiddleware, eventsController.uploadImage);
router.delete('/images', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.deleteImage);

// Public event routes
router.get('/', eventsController.list);
router.get('/:id', optionalAuthenticateToken, eventsController.getById);

// Protected event routes
router.post('/', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.create);
router.put('/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.update);
router.delete('/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.delete);

// Image management for existing events
router.post('/:id/images', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), handleUploadMiddleware, eventsController.uploadImage);
router.delete('/:id/images/:type', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.deleteImage);
router.delete('/:id/images', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.deleteImage);

// Behavioral tracking & interactions
router.post('/:id/view', optionalAuthenticateToken, eventsController.trackView);
router.post('/:id/report', optionalAuthenticateToken, (req, res, next) => {
  req.body = {
    ...req.body,
    target_type: 'EVENT',
    target_id: req.params.id,
  };
  return reportsController.createReport(req, res, next);
});

// CSV & Excel Reporting (Module 2.14 & SPEC.md Section 5.4)
router.get('/:id/export/attendees', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportAttendees);
router.get('/:id/attendees/export', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportAttendees);
router.get('/:id/export/sales', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportSales);

// PDF Attachment Management (Full CRUD: List, Create, Update, Delete, Download)
router.get('/:id/attachments', eventsController.listAttachments);
router.post('/:id/attachments', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), handleUploadMiddleware, eventsController.uploadAttachment);
router.put('/:id/attachments/:attachmentId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.updateAttachment);
router.delete('/:id/attachments/:attachmentId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.deleteAttachment);
router.get('/:id/attachments/:attachmentId', eventsController.getAttachment);

// Ticket Tiers
router.get('/:id/tiers', optionalAuthenticateToken, ticketsController.list);
router.post('/:id/tiers', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ticketsController.create);
router.put('/:id/tiers/:tierId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ticketsController.update);
router.delete('/:id/tiers/:tierId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ticketsController.delete);

// Promos
router.get('/:id/promos', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), promosController.list);
router.post('/:id/promos', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), promosController.create);
router.put('/:id/promos/:promoId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), promosController.update);
router.delete('/:id/promos/:promoId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), promosController.delete);
router.post('/:id/promos/validate', promosController.validate);

// Event Orders
router.get('/:id/orders', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.getOrdersByEvent);

// Attendee Roster & Management (Accessible by Organizer & Admin)
router.get('/:id/attendees', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.getAttendees);
router.post('/:id/attendees', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.createAttendee);
router.put('/:id/attendees/:attendeeId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.updateAttendee);
router.delete('/:id/attendees/:attendeeId', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.deleteAttendee);

export default router;
