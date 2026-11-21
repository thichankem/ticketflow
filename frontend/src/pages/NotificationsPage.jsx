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
import { Icon } from '../components/ui/Icon';
import { VectorSpinner } from '../components/ui/VectorAnimation';
import { EmptyStateIllustration } from '../components/ui/EmptyStateIllustration';

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
  const [error, setError] = useState(null);
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

  // Load all notifications (UI-14: Explicit error state and feedback)
  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.notifications.list();
      const list = Array.isArray(res) ? res : res?.notifications || [];
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      setNotifications(sorted);
    } catch (err) {
      console.warn('[NotificationsPage] Load error:', err.message);
      setError(err.message || 'Không thể kết nối đến máy chủ để tải thông báo.');
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

  // Actions with error handling and user feedback
  const handleToggleRead = async (notif) => {
    try {
      if (!notif.is_read) {
        await api.notifications.markRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      }
    } catch (err) {
      setActionMessage(`Lỗi đánh dấu đã đọc: ${err.message}`);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setActionMessage('Đã đánh dấu tất cả thông báo là đã đọc.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setActionMessage(`Lỗi cập nhật thông báo: ${err.message}`);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handleDeleteNotification = async (notifId) => {
    try {
      await api.notifications.delete(notifId);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      setActionMessage('Đã xóa thông báo.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setActionMessage(`Lỗi xóa thông báo: ${err.message}`);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handleConfirmClearAll = async () => {
    try {
      await api.notifications.clearAll();
      setNotifications([]);
      setClearModalOpen(false);
      setActionMessage('Đã dọn sạch toàn bộ thông báo hộp thư.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setActionMessage(`Lỗi dọn sạch thông báo: ${err.message}`);
      setTimeout(() => setActionMessage(null), 3500);
    }
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
            <div className="notif-header-icon-wrap flex items-center justify-center" aria-hidden="true">
              <Icon name="bell" size={28} ariaHidden />
            </div>
            <div>
              <h1 className="notif-page-title">Hộp Thư & Trung Tâm Thông Báo</h1>
              <p className="notif-page-subtitle">
                Xem lại toàn bộ thông báo hệ thống, cập nhật restock vé, vé của bạn và thông báo sàn từ ban quản trị.
              </p>
            </div>
          </div>

          <div className="notif-header-actions flex gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                onClick={handleMarkAllRead}
              >
                <Icon name="check-check" size="xs" ariaHidden />
                <span>Đọc tất cả ({unreadCount})</span>
              </button>
            )}
            {totalCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm text-danger flex items-center gap-1.5"
                onClick={() => setClearModalOpen(true)}
              >
                <Icon name="trash" size="xs" ariaHidden />
                <span>Xóa tất cả</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback alert */}
        {actionMessage && (
          <div className="alert alert-success notif-alert-banner flex items-center justify-between" role="status">
            <span className="flex items-center gap-1.5">
              <Icon name="check" size="xs" ariaHidden />
              <span>{actionMessage}</span>
            </span>
            <button type="button" className="alert-close-btn flex items-center justify-center" onClick={() => setActionMessage(null)} aria-label="Đóng thông báo">
              <Icon name="x" size="xs" ariaHidden />
            </button>
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

          <div className="notif-search-box flex items-center">
            <Icon name="search" size={16} ariaHidden className="notif-search-icon" />
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
                className="notif-search-clear flex items-center justify-center"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <Icon name="x" size="xs" ariaHidden />
              </button>
            )}
          </div>
        </div>

        {/* Error state (UI-14) */}
        {error && (
          <div className="alert alert-error mb-md flex justify-between items-center">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadNotifications}>
              Thử lại
            </button>
          </div>
        )}

        {/* Notifications List */}
        {loading ? (
          <div className="page-suspense-fallback" style={{ minHeight: '30vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <VectorSpinner size={36} />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card notif-empty-card text-center p-8">
            <EmptyStateIllustration type="empty-notifications" size={120} />
            <h2 className="notif-empty-title">
              {searchQuery.trim()
                ? 'Không tìm thấy thông báo phù hợp'
                : activeFilter === 'unread'
                ? 'Không có thông báo chưa đọc'
                : 'Hộp thư của bạn hiện đang trống'}
            </h2>
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
                        <span className="notif-card-type-tag flex items-center gap-1">
                          {n.type === 'RESTOCK' ? (
                            <>
                              <Icon name="ticket" size="xs" ariaHidden />
                              <span>Restock Vé</span>
                            </>
                          ) : n.type === 'BROADCAST' ? (
                            <>
                              <Icon name="bell" size="xs" ariaHidden />
                              <span>Thông Báo Chung</span>
                            </>
                          ) : n.type === 'REFUND' ? (
                            <>
                              <Icon name="refresh" size="xs" ariaHidden />
                              <span>Hoàn Tiền</span>
                            </>
                          ) : (
                            <>
                              <Icon name="bell" size="xs" ariaHidden />
                              <span>Thông Báo</span>
                            </>
                          )}
                        </span>
                      )}
                      <span className="notif-card-timestamp flex items-center gap-1" title={formatFullDateTime(n.created_at)}>
                        <Icon name="clock" size="xs" ariaHidden />
                        <span>{formatRelativeTime(n.created_at)}</span>
                      </span>
                    </div>

                    <div className="notif-card-actions" onClick={(e) => e.stopPropagation()}>
                      {!n.is_read && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-primary flex items-center gap-1"
                          onClick={() => handleToggleRead(n)}
                          title="Đánh dấu đã đọc"
                        >
                          <Icon name="check" size="xs" ariaHidden />
                          <span>Đã đọc</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-muted hover:text-danger flex items-center gap-1"
                        onClick={() => handleDeleteNotification(n.id)}
                        title="Xóa thông báo"
                        aria-label="Xóa thông báo"
                      >
                        <Icon name="trash" size="xs" ariaHidden />
                        <span>Xóa</span>
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
          title="Xác Nhận Xóa Toàn Bộ Thông Báo"
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
