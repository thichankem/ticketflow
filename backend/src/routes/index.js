import { Router } from 'express';
import authRoutes from './auth.routes.js';
import eventsRoutes from './events.routes.js';
import ordersRoutes from './orders.routes.js';
import adminRoutes from './admin.routes.js';
import ordersController from '../controllers/orders.controller.js';
import { optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { orderReservationRateLimiter } from '../middleware/rate-limiter.middleware.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/events', eventsRoutes);
apiRouter.use('/orders', ordersRoutes);
apiRouter.use('/admin', adminRoutes);

// Compatibility route: /api/public/events/:id/order
apiRouter.post('/public/events/:id/order', orderReservationRateLimiter, optionalAuthenticateToken, ordersController.reserve);

export default apiRouter;
