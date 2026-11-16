import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';

// Helper to format timestamps gracefully
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const NotificationBell = ({ className = '' }) => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch notifications
  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.notifications.list();
      const list = Array.isArray(res) ? res : res?.notifications || [];
      // Sort newest first
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      setNotifications(sorted);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000);

      let channel;
      if (user?.id && supabase) {
        channel = supabase
          .channel(`bell-notifications-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (payload.new) {
                setNotifications((prev) => [payload.new, ...prev]);
              }
            }
          )
          .subscribe();
      }

      return () => {
        clearInterval(interval);
        if (channel && supabase) {
          supabase.removeChannel(channel);
        }
      };
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, user?.id]);

  // Click outside to close dropdown & Escape key handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDropdown]);

  const handleMarkRead = async (notifId) => {
    try {
      await api.notifications.markRead(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleDeleteNotification = async (e, notifId) => {
    e.stopPropagation();
    try {
      await api.notifications.delete(notifId);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch {}
  };

  const handleClearAll = async () => {
    try {
      await api.notifications.clearAll();
      setNotifications([]);
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // STRICT REQUIREMENT: Only show the 3 most recent notifications in the popup
  const previewNotifications = notifications.slice(0, 3);

  if (!isAuthenticated) return null;

  return (
    <div className={`notif-bell-wrapper ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setShowDropdown((prev) => !prev)}
        title={t('nav.notifications', 'Thông báo hộp thư')}
        aria-label={t('nav.notifications', 'Thông báo hộp thư')}
        aria-expanded={showDropdown}
        aria-haspopup="dialog"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="notif-dropdown-menu" role="dialog" aria-label="Hộp thư thông báo">
          {/* Header */}
          <div className="notif-dropdown-header">
            <div className="notif-dropdown-title-group">
              <strong className="notif-dropdown-title">🔔 {t('nav.notifications', 'Thông Báo Hộp Thư')}</strong>
              <span className="notif-dropdown-count-badge">
                {notifications.length > 3 ? `3 / ${notifications.length} tin` : `${notifications.length} tin`}
              </span>
            </div>

            {notifications.length > 0 && (
              <div className="notif-dropdown-quick-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notif-action-btn read-all-btn"
                    onClick={handleMarkAllRead}
                    title="Đánh dấu tất cả đã đọc"
                  >
                    ✓ Đọc hết
                  </button>
                )}
                <button
                  type="button"
                  className="notif-action-btn clear-all-btn"
                  onClick={handleClearAll}
                  title="Xóa tất cả thông báo"
                >
                  🗑️ Xóa hết
                </button>
              </div>
            )}
          </div>

          {/* Body: Strictly 3 Most Recent Items */}
          {notifications.length === 0 ? (
            <div className="notif-dropdown-empty">
              <div className="notif-empty-icon" aria-hidden="true">📭</div>
              <p className="notif-empty-title">{t('nav.no_notifications', 'Chưa có thông báo mới nào')}</p>
              <p className="notif-empty-desc">Bạn sẽ nhận thông báo khi có vé mới, restock hoặc tin từ sàn.</p>
            </div>
          ) : (
            <div className="notif-preview-list">
              {previewNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-dropdown-item ${!n.is_read ? 'is-unread' : 'is-read'}`}
                  onClick={() => handleMarkRead(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleMarkRead(n.id);
                    }
                  }}
                >
                  <div className="notif-item-dot-wrap">
                    <span className={`notif-status-dot ${!n.is_read ? 'unread' : 'read'}`} aria-hidden="true" />
                  </div>

                  <div className="notif-item-body">
                    <div className="notif-item-top">
                      <span className="notif-item-title">{n.title || 'Thông báo mới'}</span>
                      <span className="notif-item-time">{formatRelativeTime(n.created_at)}</span>
                    </div>
                    <p className="notif-item-message">{n.message}</p>
                  </div>

                  <button
                    type="button"
                    className="notif-item-del-btn"
                    title="Xóa thông báo này"
                    aria-label="Xóa thông báo này"
                    onClick={(e) => handleDeleteNotification(e, n.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer: View Full Notifications Page */}
          <div className="notif-dropdown-footer">
            <Link
              to="/notifications"
              className="notif-view-all-link"
              onClick={() => setShowDropdown(false)}
            >
              <span>Xem toàn bộ thông báo ({notifications.length})</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
