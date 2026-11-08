import { Router } from 'express';
import ordersController from '../controllers/orders.controller.js';
import { optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { orderReservationRateLimiter } from '../middleware/rate-limiter.middleware.js';

const router = Router();

// Reservation
router.post('/reserve', orderReservationRateLimiter, optionalAuthenticateToken, ordersController.reserve);

// Order details (IDOR check inside controller/service)
router.get('/:id', optionalAuthenticateToken, ordersController.getById);

// Checkout / Finalization
router.post('/:id/checkout', optionalAuthenticateToken, ordersController.checkout);
router.post('/:id/finalize', optionalAuthenticateToken, ordersController.checkout);

// Cancellation
router.post('/:id/cancel', optionalAuthenticateToken, ordersController.cancel);

export default router;
