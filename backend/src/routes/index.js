import { Router } from 'express';
import authRoutes from './auth.routes.js';
import eventsRoutes from './events.routes.js';
import ordersRoutes from './orders.routes.js';
import adminRoutes from './admin.routes.js';
import locationRoutes from './location.routes.js';
import cronRoutes from './cron.routes.js';
import reportsRoutes from './reports.routes.js';
import ordersController from '../controllers/orders.controller.js';
import { optionalAuthenticateToken } from '../middleware/auth.middleware.js';
import { orderReservationRateLimiter } from '../middleware/rate-limiter.middleware.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/events', eventsRoutes);
apiRouter.use('/orders', ordersRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/reports', reportsRoutes);
apiRouter.use('/location', locationRoutes);
apiRouter.use('/cron', cronRoutes);

// Compatibility route: /api/public/events/:id/order
apiRouter.post('/public/events/:id/order', orderReservationRateLimiter, optionalAuthenticateToken, ordersController.reserve);

export default apiRouter;
