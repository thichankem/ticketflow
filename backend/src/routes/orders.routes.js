import { Router } from 'express';
import ordersController from '../controllers/orders.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { orderReservationRateLimiter } from '../middleware/rate-limiter.middleware.js';

const router = Router();

// My Orders (Must be before /:id)
router.get('/my', authenticateToken, ordersController.getMyOrders);

// Door Check-in Scan (SPEC.md Section 5.4 - Must be before /:id)
router.post('/check-in', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), ordersController.checkIn);

// Payment Webhook Callback (Must be before /:id)
router.post('/webhook/payment-callback', ordersController.paymentWebhook);

// Reservation
router.post('/reserve', orderReservationRateLimiter, optionalAuthenticateToken, ordersController.reserve);

// Order details (IDOR check inside controller/service)
router.get('/:id', optionalAuthenticateToken, ordersController.getById);

// Checkout / Finalization
router.post('/:id/checkout', optionalAuthenticateToken, ordersController.checkout);
router.post('/:id/finalize', optionalAuthenticateToken, ordersController.checkout);

// Cancellation & Refund
router.post('/:id/cancel', optionalAuthenticateToken, ordersController.cancel);
router.post('/:id/refund', optionalAuthenticateToken, ordersController.refund);

// Online-only Payment Simulation
router.post('/:id/payment', optionalAuthenticateToken, ordersController.processPayment);

// Digital Receipt
router.get('/:id/receipt', optionalAuthenticateToken, ordersController.getReceipt);

// Ticket Transfer
router.post('/attendees/:attendeeId/transfer', authenticateToken, ordersController.transferTicket);

export default router;
