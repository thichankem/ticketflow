/**
 * Reports Routes
 * File: backend/src/routes/reports.routes.js
 */

import { Router } from 'express';
import reportsController from '../controllers/reports.controller.js';
import { optionalAuthenticateToken, authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Submit report: Attendee or Organizer (authenticated user or anonymous contact)
router.post('/', optionalAuthenticateToken, reportsController.createReport);

// View user's own submitted reports
router.get('/my', authenticateToken, reportsController.getMyReports);

export default router;
