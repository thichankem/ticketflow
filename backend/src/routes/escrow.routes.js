import { Router } from 'express';
import escrowController from '../controllers/escrow.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = Router();

// Event Escrow Summary & Payout Request (Organizer & Admin)
router.get('/events/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), escrowController.getEventSummary);
router.post('/events/:id/payout-request', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), escrowController.requestPayout);
router.post('/payouts', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), (req, res, next) => {
  req.params.id = req.body.event_id || req.params.id;
  return escrowController.requestPayout(req, res, next);
});
router.post('/payouts/request', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), (req, res, next) => {
  req.params.id = req.body.event_id;
  return escrowController.requestPayout(req, res, next);
});

// Platform Admin Payout Management (Platform Admin only)
router.get('/payouts', authenticateToken, requireRole('ADMIN'), escrowController.getAllPayouts);
router.put('/payouts/:payoutId/status', authenticateToken, requireRole('ADMIN'), escrowController.updatePayoutStatus);

export default router;
