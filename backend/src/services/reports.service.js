/**
 * Reports Management Service
 * File: backend/src/services/reports.service.js
 *
 * Implements reporting capabilities for Attendees and Organizers,
 * and centralized resolution console for Platform Administrators.
 */

import { query } from '../config/db.js';

const memoryReports = new Map();
let nextReportId = 100;

// Seed initial memory reports for mock and offline testing
memoryReports.set(1, {
  id: 1,
  reporter_id: 3,
  reporter_name: 'John Doe',
  reporter_email: 'attendee@ticketflow.local',
  reporter_role: 'ATTENDEE',
  target_type: 'EVENT',
  target_id: '1',
  target_title: 'EDM Supernatural Concert 2026',
  reason: 'MISLEADING',
  description: 'Event line-up changed without official notification to ticket buyers.',
  status: 'PENDING',
  admin_notes: null,
  resolved_by: null,
  resolved_at: null,
  created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
});

memoryReports.set(2, {
  id: 2,
  reporter_id: 2,
  reporter_name: 'TechFest Organizer',
  reporter_email: 'organizer@ticketflow.local',
  reporter_role: 'ORGANIZER',
  target_type: 'ATTENDEE',
  target_id: '10',
  target_title: 'Bot User (fake@spam.local)',
  reason: 'FRAUD',
  description: 'Suspicious bot account claimed bulk tickets for unauthorized resale.',
  status: 'INVESTIGATING',
  admin_notes: 'Temporarily locked tickets to verify attendee identity.',
  resolved_by: 1,
  resolved_at: null,
  created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
});

memoryReports.set(3, {
  id: 3,
  reporter_id: 4,
  reporter_name: 'Thu Le',
  reporter_email: 'thu.le@example.com',
  reporter_role: 'ATTENDEE',
  target_type: 'EVENT',
  target_id: '2',
  target_title: 'AI Startup Summit 2026',
  reason: 'COPYRIGHT',
  description: 'Event poster copied third-party trademarks without permission.',
  status: 'RESOLVED',
  admin_notes: 'Contacted organizer to remove infringing assets and update license.',
  resolved_by: 1,
  resolved_at: new Date(Date.now() - 86400000).toISOString(),
  created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  updated_at: new Date(Date.now() - 86400000).toISOString(),
});

class ReportsService {
  /**
   * Submit a new report (Attendee or Organizer)
   */
  async createReport({
    reporterId = null,
    reporterName = null,
    reporterEmail = null,
    reporterRole = 'ATTENDEE',
    targetType = 'EVENT',
    targetId = null,
    targetTitle = null,
    reason = 'OTHER',
    description = '',
  }) {
    if (!description || description.trim().length < 5) {
      const err = new Error('Report description must be at least 5 characters.');
      err.status = 400;
      throw err;
    }

    if (!reason || !reason.trim()) {
      const err = new Error('Report reason is required.');
      err.status = 400;
      throw err;
    }

    const cleanReporterRole = (reporterRole || 'ATTENDEE').toUpperCase();
    const cleanTargetType = (targetType || 'EVENT').toUpperCase();
    const cleanTargetId = targetId ? String(targetId).trim() : null;
    const cleanTargetTitle = targetTitle ? String(targetTitle).trim() : 'Unknown';
    const cleanReason = reason.trim().slice(0, 100);
    const cleanDescription = description.trim();
    const cleanName = reporterName ? String(reporterName).trim() : 'Anonymous User';
    const cleanEmail = reporterEmail ? String(reporterEmail).trim() : null;
    const numReporterId = reporterId ? Number(reporterId) : null;

    try {
      const sql = `
        INSERT INTO reports (
          reporter_id, reporter_name, reporter_email, reporter_role,
          target_type, target_id, target_title, reason, description,
          status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', NOW(), NOW())
        RETURNING *
      `;
      const res = await query(sql, [
        numReporterId,
        cleanName,
        cleanEmail,
        cleanReporterRole,
        cleanTargetType,
        cleanTargetId,
        cleanTargetTitle,
        cleanReason,
        cleanDescription,
      ]);
      return res.rows[0];
    } catch (dbErr) {
      console.warn('[ReportsService] DB insert fallback to memory store:', dbErr.message);
      const newId = nextReportId++;
      const record = {
        id: newId,
        reporter_id: numReporterId,
        reporter_name: cleanName,
        reporter_email: cleanEmail,
        reporter_role: cleanReporterRole,
        target_type: cleanTargetType,
        target_id: cleanTargetId,
        target_title: cleanTargetTitle,
        reason: cleanReason,
        description: cleanDescription,
        status: 'PENDING',
        admin_notes: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryReports.set(newId, record);
      return record;
    }
  }

  /**
   * Get list of reports with filters (Admin only)
   */
  async getReports({ status = 'ALL', role = 'ALL', targetType = 'ALL', search = '', limit = 100, offset = 0 } = {}) {
    try {
      let sql = `SELECT * FROM reports WHERE 1=1`;
      const params = [];
      let idx = 1;

      if (status && status !== 'ALL') {
        sql += ` AND status = $${idx++}`;
        params.push(status.toUpperCase());
      }
      if (role && role !== 'ALL') {
        sql += ` AND reporter_role = $${idx++}`;
        params.push(role.toUpperCase());
      }
      if (targetType && targetType !== 'ALL') {
        sql += ` AND target_type = $${idx++}`;
        params.push(targetType.toUpperCase());
      }
      if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(target_title) LIKE $${idx} OR LOWER(reporter_name) LIKE $${idx} OR LOWER(reporter_email) LIKE $${idx} OR LOWER(description) LIKE $${idx})`;
        params.push(q);
        idx++;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limit, offset);

      const res = await query(sql, params);
      return res.rows;
    } catch (dbErr) {
      console.warn('[ReportsService] DB query fallback to memory store:', dbErr.message);
      let list = Array.from(memoryReports.values());

      if (status && status !== 'ALL') {
        list = list.filter((r) => r.status === status.toUpperCase());
      }
      if (role && role !== 'ALL') {
        list = list.filter((r) => r.reporter_role === role.toUpperCase());
      }
      if (targetType && targetType !== 'ALL') {
        list = list.filter((r) => r.target_type === targetType.toUpperCase());
      }
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (r) =>
            (r.target_title || '').toLowerCase().includes(q) ||
            (r.reporter_name || '').toLowerCase().includes(q) ||
            (r.reporter_email || '').toLowerCase().includes(q) ||
            (r.description || '').toLowerCase().includes(q)
        );
      }

      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return list.slice(offset, offset + limit);
    }
  }

  /**
   * Get single report by ID
   */
  async getReportById(id) {
    const numId = Number(id);
    try {
      const res = await query('SELECT * FROM reports WHERE id = $1', [numId]);
      if (res.rowCount > 0) return res.rows[0];
    } catch (dbErr) {
      console.warn('[ReportsService] DB getById fallback to memory:', dbErr.message);
    }
    return memoryReports.get(numId) || null;
  }

  /**
   * Get reports submitted by a specific user
   */
  async getUserReports(userId) {
    const numId = Number(userId);
    try {
      const res = await query('SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC', [numId]);
      return res.rows;
    } catch (dbErr) {
      console.warn('[ReportsService] DB getUserReports fallback:', dbErr.message);
      return Array.from(memoryReports.values())
        .filter((r) => r.reporter_id === numId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  }

  /**
   * Update report status and resolution notes (Admin only)
   */
  async updateReport(id, { status, adminNotes = null, resolvedBy = null }) {
    const validStatuses = ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
    const cleanStatus = (status || '').toUpperCase();
    if (!validStatuses.includes(cleanStatus)) {
      const err = new Error(`Invalid report status. Allowed: ${validStatuses.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const numId = Number(id);
    const numResolvedBy = resolvedBy ? Number(resolvedBy) : null;
    const cleanNotes = adminNotes ? String(adminNotes).trim() : null;
    const isCompleted = cleanStatus === 'RESOLVED' || cleanStatus === 'DISMISSED';

    try {
      const sql = `
        UPDATE reports
        SET status = $1,
            admin_notes = COALESCE($2, admin_notes),
            resolved_by = COALESCE($3, resolved_by),
            resolved_at = CASE WHEN $4 = true THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;
      const res = await query(sql, [cleanStatus, cleanNotes, numResolvedBy, isCompleted, numId]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch (dbErr) {
      console.warn('[ReportsService] DB update fallback to memory:', dbErr.message);
    }

    const report = memoryReports.get(numId);
    if (!report) {
      const err = new Error('Report not found.');
      err.status = 404;
      throw err;
    }

    report.status = cleanStatus;
    if (cleanNotes !== null) report.admin_notes = cleanNotes;
    if (numResolvedBy !== null) report.resolved_by = numResolvedBy;
    if (isCompleted) report.resolved_at = new Date().toISOString();
    report.updated_at = new Date().toISOString();

    memoryReports.set(numId, report);
    return report;
  }

  /**
   * Summary stats of reports for Admin dashboard
   */
  async getReportStats() {
    try {
      const sql = `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'INVESTIGATING')::int AS investigating,
          COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
          COUNT(*) FILTER (WHERE status = 'DISMISSED')::int AS dismissed
        FROM reports
      `;
      const res = await query(sql);
      if (res.rowCount > 0) return res.rows[0];
    } catch (dbErr) {
      console.warn('[ReportsService] DB stats fallback:', dbErr.message);
    }

    const list = Array.from(memoryReports.values());
    return {
      total: list.length,
      pending: list.filter((r) => r.status === 'PENDING').length,
      investigating: list.filter((r) => r.status === 'INVESTIGATING').length,
      resolved: list.filter((r) => r.status === 'RESOLVED').length,
      dismissed: list.filter((r) => r.status === 'DISMISSED').length,
    };
  }
}

export const reportsService = new ReportsService();
export default reportsService;
