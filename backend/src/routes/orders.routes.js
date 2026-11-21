import { Router } from 'express';
import ordersController from '../controllers/orders.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { orderReservationRateLimiter } from '../middleware/rate-limiter.middleware.js';

const router = Router();

// My Orders (Must be before /:id)
router.get('/my', authenticateToken, ordersController.getMyOrders);

// Payment Webhook Callback (Must be before /:id)
router.post('/webhook/payment-callback', ordersController.paymentWebhook);
router.get('/vnpay/callback', ordersController.vnpayCallback);
router.get('/vnpay-callback', ordersController.vnpayCallback);

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

// Online Payment Gateway & Intent Endpoints (POST initiates mutation, GET reads status)
router.post('/:id/payment', optionalAuthenticateToken, ordersController.processPayment);
router.get('/:id/payment', optionalAuthenticateToken, ordersController.getPaymentStatus);
router.post('/:id/pay', optionalAuthenticateToken, ordersController.processPayment);
router.get('/:id/pay', optionalAuthenticateToken, ordersController.getPaymentStatus);

// Digital Receipt
router.get('/:id/receipt', optionalAuthenticateToken, ordersController.getReceipt);

export default router;
