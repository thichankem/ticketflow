import { Router } from 'express';
import helpdeskController from '../controllers/helpdesk.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

// FAQ Knowledge Base (Public read, Admin CRUD)
router.get('/faqs', helpdeskController.getFaqs);
router.post('/faqs', authenticateToken, requireRole('ADMIN'), helpdeskController.createFaq);
router.put('/faqs/:id', authenticateToken, requireRole('ADMIN'), helpdeskController.updateFaq);
router.delete('/faqs/:id', authenticateToken, requireRole('ADMIN'), helpdeskController.deleteFaq);

// Support Tickets
router.post('/tickets', optionalAuthenticateToken, helpdeskController.createTicket);
router.get('/tickets', authenticateToken, helpdeskController.listTickets);
router.get('/tickets/:id', authenticateToken, helpdeskController.getTicket);
router.post('/tickets/:id/messages', authenticateToken, helpdeskController.addMessage);
router.put('/tickets/:id/status', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), helpdeskController.updateStatus);
router.delete('/tickets/:id', authenticateToken, helpdeskController.deleteTicket);

export default router;
