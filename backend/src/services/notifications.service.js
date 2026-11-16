/**
 * Notifications & Restock Trigger Service
 * File: backend/src/services/notifications.service.js
 *
 * Implements in-app notifications and automatic restock notifications (Phân hệ 2.6).
 */

import { query } from '../config/db.js';

const memoryNotifications = new Map(); // id -> notification
let nextNotificationId = 100;

class NotificationsService {
  /**
   * Create an in-app notification
   */
  async createNotification({ userId, eventId = null, type = 'RESTOCK', title, message }) {
    const numUserId = Number(userId);
    const numEventId = eventId ? Number(eventId) : null;

    try {
      const sql = `
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
        RETURNING *
      `;
      const res = await query(sql, [numUserId, numEventId, type, title, message]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch {
      // Fallback in-memory
    }

    const id = ++nextNotificationId;
    const notification = {
      id,
      user_id: numUserId,
      event_id: numEventId,
      type,
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    memoryNotifications.set(id, notification);
    return notification;
  }

  /**
   * Notify users who favorited an event that tickets have been restocked
   */
  async triggerRestockNotification(eventId, eventTitle = 'Sự kiện') {
    const numEventId = Number(eventId);
    if (!eventTitle || eventTitle === 'Sự kiện') {
      try {
        const { default: eventsService } = await import('./events.service.js');
        const ev = await eventsService.getEventById(numEventId);
        if (ev && ev.title) {
          eventTitle = ev.title;
        }
      } catch {}
    }
    const resolvedTitle = eventTitle || 'Sự kiện';
    const { default: recommendationService } = await import('./recommendation.service.js');

    // Get all users who favorited this event
    const userIds = await recommendationService.getUsersWhoFavorited(numEventId);
    if (!userIds || userIds.length === 0) return [];

    const notifications = [];
    const title = `🔔 Vé có sẵn trở lại: ${resolvedTitle}`;
    const message = `Có vé vừa được nhả lại vào kho cho sự kiện "${resolvedTitle}". Hãy nhanh tay đặt ngay trước khi hết!`;

    for (const uid of userIds) {
      const notif = await this.createNotification({
        userId: uid,
        eventId: numEventId,
        type: 'RESTOCK',
        title,
        message,
      });
      notifications.push(notif);
    }

    return notifications;
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId) {
    const numUserId = Number(userId);
    try {
      const sql = `
        SELECT * FROM notifications
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 50
      `;
      const res = await query(sql, [numUserId]);
      if (res.rows) {
        if (res.rows.length > 0 || memoryNotifications.size === 0) {
          return res.rows;
        }
      }
    } catch {
      // Fallback
    }

    const list = [];
    for (const notif of memoryNotifications.values()) {
      if (Number(notif.user_id) === numUserId) {
        list.push(notif);
      }
    }
    list.sort((a, b) => b.id - a.id);
    return list;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const numId = Number(notificationId);
    const numUserId = Number(userId);

    try {
      await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [numId, numUserId]);
    } catch {
      // Fallback
    }

    const notif = memoryNotifications.get(numId);
    if (notif && Number(notif.user_id) === numUserId) {
      notif.is_read = true;
    }
    return { success: true };
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    const numUserId = Number(userId);

    try {
      await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [numUserId]);
    } catch {
      // Fallback
    }

    for (const notif of memoryNotifications.values()) {
      if (Number(notif.user_id) === numUserId) {
        notif.is_read = true;
      }
    }
    return { success: true };
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId, userId) {
    const numId = Number(notificationId);
    const numUserId = Number(userId);

    try {
      await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [numId, numUserId]);
    } catch {
      // Fallback
    }

    const notif = memoryNotifications.get(numId);
    if (notif && Number(notif.user_id) === numUserId) {
      memoryNotifications.delete(numId);
    }
    return { success: true };
  }

  /**
   * Clear all notifications for a user
   */
  async clearAllNotifications(userId) {
    const numUserId = Number(userId);

    try {
      await query('DELETE FROM notifications WHERE user_id = $1', [numUserId]);
    } catch {
      // Fallback
    }

    for (const [id, notif] of memoryNotifications.entries()) {
      if (Number(notif.user_id) === numUserId) {
        memoryNotifications.delete(id);
      }
    }
    return { success: true };
  }
}

export default new NotificationsService();
