import { Router } from 'express';
import eventsController from '../controllers/events.controller.js';
import ticketsController from '../controllers/tickets.controller.js';
import promosController from '../controllers/promos.controller.js';
import ordersController from '../controllers/orders.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

// Public event routes
router.get('/', eventsController.list);
router.get('/:id', eventsController.getById);

// Protected event routes
router.post('/', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), eventsController.create);
router.put('/:id', authenticateToken, eventsController.update);
router.delete('/:id', authenticateToken, eventsController.delete);

// Ticket Tiers
router.get('/:id/tiers', ticketsController.list);
router.post('/:id/tiers', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ticketsController.create);

// Promos
router.post('/:id/promos', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), promosController.create);
router.post('/:id/promos/validate', promosController.validate);

// Attendee Check-In
router.post('/:id/attendees/check-in', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.checkIn);

export default router;
