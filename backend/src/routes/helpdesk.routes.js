import { Router } from 'express';
import helpdeskController from '../controllers/helpdesk.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

// FAQ Knowledge Base (Public)
router.get('/faqs', helpdeskController.getFaqs);

// Support Tickets
router.post('/tickets', optionalAuthenticateToken, helpdeskController.createTicket);
router.get('/tickets', authenticateToken, helpdeskController.listTickets);
router.get('/tickets/:id', optionalAuthenticateToken, helpdeskController.getTicket);
router.post('/tickets/:id/messages', authenticateToken, helpdeskController.addMessage);
router.put('/tickets/:id/status', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), helpdeskController.updateStatus);

export default router;
