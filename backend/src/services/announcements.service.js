/**
 * Announcements & Platform Broadcast Service
 * File: backend/src/services/announcements.service.js
 *
 * Implements Platform-wide Broadcast Announcements (REQ-ADM-09).
 */

import { query } from '../config/db.js';
import notificationsService from './notifications.service.js';

const memoryAnnouncements = new Map();
let nextAnnouncementId = 1;

class AnnouncementsService {
  /**
   * Broadcast an announcement to all users or target role
   */
  async createAnnouncement({ title, message, type = 'GENERAL', targetRole = 'ALL', createdBy = null }) {
    if (!title || !title.trim()) {
      const err = new Error('Announcement title cannot be empty');
      err.status = 400;
      throw err;
    }
    if (!message || !message.trim()) {
      const err = new Error('Announcement message cannot be empty');
      err.status = 400;
      throw err;
    }

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const cleanType = (type || 'GENERAL').toUpperCase();
    const cleanRole = (targetRole || 'ALL').toUpperCase();
    const numCreatedBy = createdBy ? Number(createdBy) : null;

    let recipientsCount = 0;
    let createdAnnouncement = null;

    try {
      // 1. Insert announcement row
      const insertSql = `
        INSERT INTO announcements (title, message, type, target_role, recipients_count, created_by, created_at)
        VALUES ($1, $2, $3, $4, 0, $5, NOW())
        RETURNING *
      `;
      const res = await query(insertSql, [cleanTitle, cleanMessage, cleanType, cleanRole, numCreatedBy]);
      createdAnnouncement = res.rows[0];

      // 2. Select target users
      let userQuery = 'SELECT id FROM users WHERE deleted_at IS NULL';
      const userParams = [];
      if (cleanRole === 'ORGANIZER') {
        userQuery += ' AND role = $1';
        userParams.push('ORGANIZER');
      } else if (cleanRole === 'ATTENDEE') {
        userQuery += ' AND role = $1';
        userParams.push('ATTENDEE');
      }

      const usersRes = await query(userQuery, userParams);
      const userIds = (usersRes.rows || []).map((r) => r.id);
      recipientsCount = userIds.length;

      // 3. Batch distribute in-app notifications
      if (userIds.length > 0) {
        for (const uid of userIds) {
          try {
            await notificationsService.createNotification({
              userId: uid,
              eventId: null,
              type: 'ANNOUNCEMENT',
              title: `📢 ${cleanTitle}`,
              message: cleanMessage,
            });
          } catch {
            // Keep going for all users
          }
        }
      }

      // 4. Update recipients_count
      await query('UPDATE announcements SET recipients_count = $1 WHERE id = $2', [recipientsCount, createdAnnouncement.id]);
      createdAnnouncement.id = Number(createdAnnouncement.id);
      createdAnnouncement.recipients_count = Number(recipientsCount);

      return {
        success: true,
        announcement: createdAnnouncement,
        recipients_count: recipientsCount,
      };
    } catch (dbErr) {
      // In-memory fallback
      console.warn('[AnnouncementsService] DB fallback:', dbErr.message);
    }

    const newId = ++nextAnnouncementId;
    recipientsCount = 0;
    createdAnnouncement = {
      id: Number(newId),
      title: cleanTitle,
      message: cleanMessage,
      type: cleanType,
      target_role: cleanRole,
      recipients_count: Number(recipientsCount),
      created_by: numCreatedBy,
      created_at: new Date().toISOString(),
    };
    memoryAnnouncements.set(newId, createdAnnouncement);

    return {
      success: true,
      announcement: createdAnnouncement,
      recipients_count: recipientsCount,
    };
  }

  /**
   * Get all broadcast announcements
   */
  async getAnnouncements() {
    try {
      const sql = `
        SELECT a.*, u.email AS creator_email, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS creator_name
        FROM announcements a
        LEFT JOIN users u ON a.created_by = u.id
        ORDER BY a.id DESC
      `;
      const res = await query(sql);
      if (res && res.rows) {
        return res.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          recipients_count: Number(r.recipients_count || 0),
        }));
      }
    } catch {
      // Fallback
    }

    return Array.from(memoryAnnouncements.values())
      .map((r) => ({ ...r, id: Number(r.id), recipients_count: Number(r.recipients_count || 0) }))
      .sort((a, b) => b.id - a.id);
  }

  /**
   * Update an existing announcement
   */
  async updateAnnouncement(id, { title, message, type, target_role, targetRole }) {
    const numId = Number(id);
    const cleanType = type ? type.toUpperCase() : undefined;
    const cleanRole = (target_role || targetRole) ? (target_role || targetRole).toUpperCase() : undefined;

    let existing = null;
    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (title !== undefined && title.trim()) {
        updates.push(`title = $${idx++}`);
        values.push(title.trim());
      }
      if (message !== undefined && message.trim()) {
        updates.push(`message = $${idx++}`);
        values.push(message.trim());
      }
      if (cleanType !== undefined) {
        updates.push(`type = $${idx++}`);
        values.push(cleanType);
      }
      if (cleanRole !== undefined) {
        updates.push(`target_role = $${idx++}`);
        values.push(cleanRole);
      }

      if (updates.length > 0) {
        values.push(numId);
        const sql = `
          UPDATE announcements
          SET ${updates.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `;
        const res = await query(sql, values);
        if (res.rows && res.rows[0]) {
          existing = {
            ...res.rows[0],
            id: Number(res.rows[0].id),
            recipients_count: Number(res.rows[0].recipients_count || 0),
          };
        }
      }
    } catch {
      // In-memory fallback
    }

    if (memoryAnnouncements.has(numId)) {
      const current = memoryAnnouncements.get(numId);
      const updated = {
        ...current,
        ...(title !== undefined && title.trim() ? { title: title.trim() } : {}),
        ...(message !== undefined && message.trim() ? { message: message.trim() } : {}),
        ...(cleanType !== undefined ? { type: cleanType } : {}),
        ...(cleanRole !== undefined ? { target_role: cleanRole } : {}),
        updated_at: new Date().toISOString(),
      };
      memoryAnnouncements.set(numId, updated);
      return { success: true, announcement: updated };
    }

    if (existing) {
      return { success: true, announcement: existing };
    }

    const err = new Error('Announcement not found');
    err.status = 404;
    throw err;
  }

  /**
   * Delete an announcement
   */
  async deleteAnnouncement(id) {
    const numId = Number(id);
    try {
      await query('DELETE FROM announcements WHERE id = $1', [numId]);
    } catch {
      // Fallback
    }
    memoryAnnouncements.delete(numId);
    return { success: true, message: 'Announcement deleted successfully' };
  }
}

export default new AnnouncementsService();
