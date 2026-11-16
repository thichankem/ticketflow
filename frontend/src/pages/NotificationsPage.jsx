import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import AttendeeLayout from '../components/AttendeeLayout';
import OrganizerLayout from '../components/OrganizerLayout';
import AdminLayout from '../components/AdminLayout';
import Modal from '../components/Modal';

// Timestamp formatter
const formatFullDateTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

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
  return formatFullDateTime(timestamp);
};

export const NotificationsPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'read'
  const [searchQuery, setSearchQuery] = useState('');
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/notifications');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Load all notifications
  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await api.notifications.list();
      const list = Array.isArray(res) ? res : res?.notifications || [];
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      setNotifications(sorted);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();

      let channel;
      if (user?.id && supabase) {
        channel = supabase
          .channel(`page-notifications-${user.id}`)
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
        if (channel && supabase) {
          supabase.removeChannel(channel);
        }
      };
    }
  }, [isAuthenticated, user?.id]);

  // Actions
  const handleToggleRead = async (notif) => {
    try {
      if (!notif.is_read) {
        await api.notifications.markRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      }
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setActionMessage('Đã đánh dấu tất cả thông báo là đã đọc.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch {}
  };

  const handleDeleteNotification = async (notifId) => {
    try {
      await api.notifications.delete(notifId);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch {}
  };

  const handleConfirmClearAll = async () => {
    try {
      await api.notifications.clearAll();
      setNotifications([]);
      setClearModalOpen(false);
      setActionMessage('Đã dọn sạch toàn bộ thông báo hộp thư.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch {}
  };

  // Metrics
  const totalCount = notifications.length;
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const readCount = totalCount - unreadCount;

  // Filtered List
  const filteredNotifications = useMemo(() => {
    let result = notifications;

    if (activeFilter === 'unread') {
      result = result.filter((n) => !n.is_read);
    } else if (activeFilter === 'read') {
      result = result.filter((n) => n.is_read);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.message && n.message.toLowerCase().includes(q))
      );
    }

    return result;
  }, [notifications, activeFilter, searchQuery]);

  // Layout choice based on role
  const Layout =
    user?.role === 'ADMIN'
      ? AdminLayout
      : user?.role === 'ORGANIZER'
      ? OrganizerLayout
      : AttendeeLayout;

  if (authLoading || (!user && isAuthenticated)) {
    return (
      <Layout>
        <div className="page-suspense-fallback" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="notifications-page-shell">
        {/* Breadcrumb & Navigation */}
        <div className="notif-page-breadcrumb">
          <Link to="/" className="breadcrumb-link">Trang chủ</Link>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Hộp Thư & Thông Báo</span>
        </div>

        {/* Hero Header */}
        <div className="notif-page-header">
          <div className="notif-header-content">
            <div className="notif-header-icon-wrap" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div>
              <h1 className="notif-page-title">Hộp Thư & Trung Tâm Thông Báo</h1>
              <p className="notif-page-subtitle">
                Xem lại toàn bộ thông báo hệ thống, cập nhật restock vé, vé của bạn và thông báo sàn từ ban quản trị.
              </p>
            </div>
          </div>

          <div className="notif-header-actions">
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleMarkAllRead}
              >
                ✓ Đọc tất cả ({unreadCount})
              </button>
            )}
            {totalCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm text-danger"
                onClick={() => setClearModalOpen(true)}
              >
                🗑️ Xóa tất cả
              </button>
            )}
          </div>
        </div>

        {/* Feedback alert */}
        {actionMessage && (
          <div className="alert alert-success notif-alert-banner" role="status">
            <span>✓ {actionMessage}</span>
            <button type="button" className="alert-close-btn" onClick={() => setActionMessage(null)}>✕</button>
          </div>
        )}

        {/* Stats Row */}
        <div className="notif-stats-grid">
          <div className="card notif-stat-card">
            <span className="notif-stat-label">Tổng số thông báo</span>
            <strong className="notif-stat-value">{totalCount}</strong>
            <span className="notif-stat-hint">Tất cả thông báo đã nhận</span>
          </div>

          <div className="card notif-stat-card">
            <span className="notif-stat-label">Tin chưa đọc</span>
            <strong className="notif-stat-value text-primary">{unreadCount}</strong>
            <span className="notif-stat-hint">Cần xem hoặc xử lý</span>
          </div>

          <div className="card notif-stat-card">
            <span className="notif-stat-label">Đã đọc</span>
            <strong className="notif-stat-value text-muted">{readCount}</strong>
            <span className="notif-stat-hint">Lịch sử thông báo cũ</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="notif-controls-panel">
          <div className="notif-filter-tabs">
            <button
              type="button"
              className={`notif-tab-btn ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              Tất Cả ({totalCount})
            </button>
            <button
              type="button"
              className={`notif-tab-btn ${activeFilter === 'unread' ? 'active' : ''}`}
              onClick={() => setActiveFilter('unread')}
            >
              Chưa Đọc ({unreadCount})
            </button>
            <button
              type="button"
              className={`notif-tab-btn ${activeFilter === 'read' ? 'active' : ''}`}
              onClick={() => setActiveFilter('read')}
            >
              Đã Đọc ({readCount})
            </button>
          </div>

          <div className="notif-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Tìm kiếm theo tiêu đề hoặc nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="notif-search-input"
              aria-label="Tìm kiếm thông báo"
            />
            {searchQuery && (
              <button
                type="button"
                className="notif-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="page-suspense-fallback" style={{ minHeight: '30vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card notif-empty-card">
            <div className="notif-empty-illustration">📭</div>
            <h3 className="notif-empty-title">
              {searchQuery.trim()
                ? 'Không tìm thấy thông báo phù hợp'
                : activeFilter === 'unread'
                ? 'Không có thông báo chưa đọc'
                : 'Hộp thư của bạn hiện đang trống'}
            </h3>
            <p className="notif-empty-desc">
              {searchQuery.trim()
                ? `Không có kết quả nào cho "${searchQuery}". Hãy thử tìm kiếm với từ khóa khác.`
                : 'Mọi thông báo về restock vé, xác nhận đơn hàng, thay đổi sự kiện và thông báo từ ban quản trị sẽ hiển thị tại đây.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-3"
                onClick={() => setSearchQuery('')}
              >
                Xóa bộ lọc tìm kiếm
              </button>
            )}
          </div>
        ) : (
          <div className="notif-cards-list">
            {filteredNotifications.map((n) => (
              <article
                key={n.id}
                className={`card notif-card ${!n.is_read ? 'is-unread' : 'is-read'}`}
                onClick={() => handleToggleRead(n)}
              >
                <div className="notif-card-accent-bar" aria-hidden="true" />

                <div className="notif-card-main">
                  <div className="notif-card-header">
                    <div className="notif-card-meta">
                      <span className={`badge ${!n.is_read ? 'badge-primary' : 'badge-neutral'}`}>
                        {!n.is_read ? 'Mới • Chưa đọc' : 'Đã đọc'}
                      </span>
                      {n.type && (
                        <span className="notif-card-type-tag">
                          {n.type === 'RESTOCK'
                            ? '🎫 Restock Vé'
                            : n.type === 'BROADCAST'
                            ? '📢 Thông Báo Chung'
                            : n.type === 'REFUND'
                            ? '💸 Hoàn Tiền'
                            : '🔔 Thông Báo'}
                        </span>
                      )}
                      <span className="notif-card-timestamp" title={formatFullDateTime(n.created_at)}>
                        🕒 {formatRelativeTime(n.created_at)}
                      </span>
                    </div>

                    <div className="notif-card-actions" onClick={(e) => e.stopPropagation()}>
                      {!n.is_read && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-primary"
                          onClick={() => handleToggleRead(n)}
                          title="Đánh dấu đã đọc"
                        >
                          ✓ Đã đọc
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-muted hover:text-danger"
                        onClick={() => handleDeleteNotification(n.id)}
                        title="Xóa thông báo"
                        aria-label="Xóa thông báo"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>

                  <h2 className="notif-card-title">{n.title || 'Thông báo hệ thống'}</h2>
                  <p className="notif-card-message">{n.message}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Modal Confirm Clear All */}
        <Modal
          isOpen={clearModalOpen}
          onClose={() => setClearModalOpen(false)}
          title="🗑️ Xác Nhận Xóa Toàn Bộ Thông Báo"
          subtitle="Hành động này sẽ xóa vĩnh viễn tất cả thông báo trong hộp thư của bạn."
          size="sm"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setClearModalOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmClearAll}
              >
                Xác nhận xóa hết
              </button>
            </div>
          }
        >
          <div className="modal-confirm-content">
            <p className="text-sm">
              Bạn có chắc chắn muốn xóa toàn bộ <strong>{totalCount}</strong> thông báo trong hộp thư không?
              Sau khi xóa, bạn sẽ không thể khôi phục lại các thông báo này.
            </p>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default NotificationsPage;
