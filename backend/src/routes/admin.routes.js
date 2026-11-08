import { Router } from 'express';
import adminController from '../controllers/admin.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

router.use(authenticateToken, requireRole('ADMIN'));

router.get('/stats', adminController.getStats);
router.post('/users/:id/suspend', adminController.suspendUser);

export default router;
