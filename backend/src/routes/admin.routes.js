import { Router } from 'express';
import adminController from '../controllers/admin.controller.js';
import eventsController from '../controllers/events.controller.js';
import reportsController from '../controllers/reports.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticateToken, requireRole('ADMIN'));

router.get('/stats', adminController.getStats);
router.post('/users/:id/suspend', adminController.suspendUser);

// User Management Endpoints
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.put('/users/:id/role', adminController.updateUserRole);
router.post('/users/:id/toggle-status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);

// Event Management Endpoints
router.get('/events', adminController.getEvents);
router.post('/events', eventsController.create);
router.put('/events/:id/status', adminController.updateEventStatus);
router.delete('/events/:id', adminController.deleteEvent);
router.post('/events/:id/mass-refund', adminController.massRefund);

// Platform Orders Endpoint
router.get('/orders', adminController.getOrders);

// Broadcast Announcements (REQ-ADM-09: Platform Announcements)
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', adminController.createAnnouncement);
router.put('/announcements/:id', adminController.updateAnnouncement);
router.delete('/announcements/:id', adminController.deleteAnnouncement);

// User & Organizer Reports Console (REQ-ADM-11: Incident & Report Management)
router.get('/reports', reportsController.getReports);
router.get('/reports/stats', reportsController.getReportStats);
router.get('/reports/:id', reportsController.getReportById);
router.put('/reports/:id', reportsController.updateReport);

// Export Financial Audit Report (Module 2.14 & SPEC.md Section 5.5)
router.get('/export/audit', adminController.exportAuditReport);
router.get('/reports/audit-financial/export', adminController.exportAuditReport);

export default router;
