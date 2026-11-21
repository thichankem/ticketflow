/**
 * Reports Controller
 * File: backend/src/controllers/reports.controller.js
 */

import reportsService from '../services/reports.service.js';

class ReportsController {
  /**
   * POST /api/reports
   * Create a new report (User or Organizer)
   */
  async createReport(req, res, next) {
    try {
      const user = req.user || null;
      const {
        target_type = 'EVENT',
        target_id = null,
        target_title = null,
        reason,
        description,
        reporter_name = null,
        reporter_email = null,
      } = req.body;

      const report = await reportsService.createReport({
        reporterId: user ? user.id : null,
        reporterName: user ? (user.name || user.email) : reporter_name,
        reporterEmail: user ? user.email : reporter_email,
        reporterRole: user ? (user.role || 'ATTENDEE') : 'ATTENDEE',
        targetType: target_type,
        targetId: target_id,
        targetTitle: target_title,
        reason,
        description,
      });

      return res.status(201).json({
        success: true,
        message: 'Your report has been submitted successfully. Administrators will review it shortly.',
        report,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/reports/my
   * View reports submitted by current user
   */
  async getMyReports(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Please log in to view submitted reports' });
      }
      const reports = await reportsService.getUserReports(req.user.id);
      return res.status(200).json({
        success: true,
        reports,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/reports
   * List all reports with filtering (Admin only)
   */
  async getReports(req, res, next) {
    try {
      const { status = 'ALL', role = 'ALL', target_type = 'ALL', search = '', limit = 100, offset = 0 } = req.query;
      const reports = await reportsService.getReports({
        status,
        role,
        targetType: target_type,
        search,
        limit: Number(limit) || 100,
        offset: Number(offset) || 0,
      });

      return res.status(200).json({
        success: true,
        reports,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/reports/stats
   * Summary stats of reports (Admin only)
   */
  async getReportStats(req, res, next) {
    try {
      const stats = await reportsService.getReportStats();
      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/reports/:id
   * Get single report (Admin only)
   */
  async getReportById(req, res, next) {
    try {
      const report = await reportsService.getReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Not Found', message: 'Report not found' });
      }
      return res.status(200).json({
        success: true,
        report,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/admin/reports/:id
   * Update status & resolution notes (Admin only)
   */
  async updateReport(req, res, next) {
    try {
      const { status, admin_notes } = req.body;
      const updated = await reportsService.updateReport(req.params.id, {
        status,
        adminNotes: admin_notes,
        resolvedBy: req.user ? req.user.id : null,
      });

      return res.status(200).json({
        success: true,
        message: 'Report status updated successfully',
        report: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const reportsController = new ReportsController();
export default reportsController;
