import { Router } from 'express';
import eventsController from '../controllers/events.controller.js';
import ticketsController from '../controllers/tickets.controller.js';
import promosController from '../controllers/promos.controller.js';
import ordersController from '../controllers/orders.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

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
router.post('/upload-image', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.uploadImage);

// Public event routes
router.get('/', eventsController.list);
router.get('/:id', optionalAuthenticateToken, eventsController.getById);

// Virtual Waiting Room (Phân hệ 2.7)
router.get('/:id/queue', eventsController.getQueueStatus);
router.post('/:id/queue/configure', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.configureQueue);

// Protected event routes
router.post('/', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.create);
router.put('/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.update);
router.delete('/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.delete);

// Behavioral tracking & interactions
router.post('/:id/favorite', optionalAuthenticateToken, eventsController.toggleFavorite);
router.post('/:id/view', optionalAuthenticateToken, eventsController.trackView);

// CSV & Excel Reporting (Phân hệ 2.14 & SPEC.md Section 5.4)
router.get('/:id/export/attendees', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportAttendees);
router.get('/:id/attendees/export', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportAttendees);
router.get('/:id/export/sales', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.exportSales);

// Seating & Auto-allocation
router.get('/:id/seats', eventsController.getSeats);
router.post('/:id/seats', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.configureSeats);

// PDF Attachment Management
router.post('/:id/attachments', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.uploadAttachment);
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
