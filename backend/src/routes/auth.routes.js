import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rate-limiter.middleware.js';

const router = Router();

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', authenticateToken, authController.me);
router.post('/logout', authController.logout);

export default router;
