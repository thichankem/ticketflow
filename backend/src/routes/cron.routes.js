import { Router } from 'express';
import refundService from '../services/refund.service.js';

const router = Router();

/**
 * Authorization middleware for scheduled cron triggers (V9-12).
 * Verifies standard Vercel CRON_SECRET or custom x-cron-secret.
 */
function verifyCronAuth(req, res, next) {
  // Allow test environment bypass only when explicitly running in unit tests without CRON_SECRET configured
  if (process.env.NODE_ENV === 'test' && !process.env.CRON_SECRET) {
    return next();
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(401).json({
      success: false,
      message: 'CRON_SECRET must be configured to authorize financial cron reconciliation endpoints',
    });
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers['x-cron-secret'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (bearerToken === cronSecret || customHeader === cronSecret) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized cron invocation',
  });
}

/**
 * GET /api/cron/reconcile-refunds
 * POST /api/cron/reconcile-refunds
 * Scans for stale PROCESSING requests and reconciles PENDING_RECONCILIATION / REFUND_REQUIRED outbox records.
 */
async function handleReconcileRefunds(req, res) {
  try {
    const staleReclaimed = await refundService.handleStaleProcessingRequests();

    return res.status(200).json({
      success: true,
      message: 'Processing queue checked successfully',
      stale_reclaimed: staleReclaimed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CronRoutes] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Execution failed',
      error: err.message,
    });
  }
}

router.get('/reconcile-refunds', verifyCronAuth, handleReconcileRefunds);
router.post('/reconcile-refunds', verifyCronAuth, handleReconcileRefunds);

export default router;
