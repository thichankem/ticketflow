import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AdminAnalyticsDashboard } from '../components/AdminAnalyticsDashboard';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminEventsTab } from '../components/admin/AdminEventsTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminAnnouncementsTab } from '../components/admin/AdminAnnouncementsTab';
import { Icon } from '../components/ui/Icon';

export const AdminPage = () => {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();

  // Active tab: 'overview' | 'users' | 'events' | 'orders' | 'announcements'
  const [activeTab, setActiveTab] = useState('overview');

  // Shared platform data
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabErrors, setTabErrors] = useState({});

  // Toast feedback notice
  const [notice, setNotice] = useState(null);
  const notify = (msg, type = 'success') => {
    setNotice({ message: msg, type });
    setTimeout(() => setNotice(null), 4500);
  };

  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // UI-15: Individual error tracking for each API endpoint
  const loadData = async () => {
    setLoading(true);
    const newErrors = {};
    try {
      const [statsRes, usersRes, eventsRes, ordersRes, announcementsRes] = await Promise.allSettled([
        api.admin.getStats(),
        api.admin.getUsers(),
        api.admin.getEvents(),
        api.admin.getOrders(),
        api.admin.getAnnouncements(),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value?.stats || statsRes.value);
      } else {
        newErrors.overview = statsRes.reason?.message || 'Không thể tải số liệu thống kê tổng quan';
      }

      if (usersRes.status === 'fulfilled') {
        const u = usersRes.value;
        setUsers(Array.isArray(u) ? u : u?.users || []);
      } else {
        newErrors.users = usersRes.reason?.message || 'Không thể tải danh sách người dùng';
      }

      if (eventsRes.status === 'fulfilled') {
        const e = eventsRes.value;
        setEvents(Array.isArray(e) ? e : e?.events || []);
      } else {
        newErrors.events = eventsRes.reason?.message || 'Không thể tải danh sách sự kiện';
      }

      if (ordersRes.status === 'fulfilled') {
        const o = ordersRes.value;
        setOrders(Array.isArray(o) ? o : o?.orders || []);
      } else {
        newErrors.orders = ordersRes.reason?.message || 'Không thể tải danh sách đơn hàng';
      }

      if (announcementsRes.status === 'fulfilled') {
        const a = announcementsRes.value;
        setAnnouncements(Array.isArray(a) ? a : a?.announcements || []);
      } else {
        newErrors.announcements = announcementsRes.reason?.message || 'Không thể tải thông báo sàn';
      }

      setTabErrors(newErrors);
      setLastSyncTime(new Date());
      const failedCount = Object.keys(newErrors).length;
      if (failedCount > 0) {
        notify(`Có ${failedCount} nguồn dữ liệu tải không thành công. Bạn có thể nhấn thử lại.`, 'warning');
      }
    } catch (err) {
      console.warn('Error loading admin platform data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Isolated tab retry to avoid reloading all 5 endpoints when one tab fails (V12-18)
  const retryTab = async (tab) => {
    const target = tab || activeTab;
    try {
      if (target === 'overview') {
        const statsRes = await api.admin.getStats();
        setStats(statsRes?.stats || statsRes);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.overview;
          return next;
        });
      } else if (target === 'users') {
        const u = await api.admin.getUsers();
        setUsers(Array.isArray(u) ? u : u?.users || []);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.users;
          return next;
        });
      } else if (target === 'events') {
        const e = await api.admin.getEvents();
        setEvents(Array.isArray(e) ? e : e?.events || []);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.events;
          return next;
        });
      } else if (target === 'orders') {
        const o = await api.admin.getOrders();
        setOrders(Array.isArray(o) ? o : o?.orders || []);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.orders;
          return next;
        });
      } else if (target === 'announcements') {
        const a = await api.admin.getAnnouncements();
        setAnnouncements(Array.isArray(a) ? a : a?.announcements || []);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.announcements;
          return next;
        });
      }
    } catch (err) {
      setTabErrors((prev) => ({
        ...prev,
        [target]: err.message || `Không thể tải dữ liệu cho thẻ ${target}`,
      }));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <section className="container py-md">
      {/* Toast Notice */}
      {notice && (
        <div className={`admin-floating-toast admin-toast-${notice.type === 'error' ? 'error' : notice.type === 'warning' ? 'warning' : 'success'}`}>
          <div className="flex items-center gap-2">
            <Icon name={notice.type === 'error' ? 'alert-triangle' : notice.type === 'warning' ? 'alert-circle' : 'check-circle'} size="sm" ariaHidden />
            <span className="font-medium text-sm">{notice.message}</span>
          </div>
          <button type="button" className="btn-close flex items-center justify-center text-white" onClick={() => setNotice(null)} aria-label="Đóng thông báo">
            <Icon name="x" size="xs" ariaHidden />
          </button>
        </div>
      )}

      {/* Admin Executive Cockpit Hero Banner */}
      <div className="admin-hero-banner">
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <div className="flex items-center gap-xs mb-1">
              <span className="admin-hero-badge">
                <span className="admin-live-pulse" aria-hidden="true" />
                <span>Executive Command Center</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">
                · Đồng bộ lúc {lastSyncTime.toLocaleTimeString('vi-VN')}
              </span>
            </div>
            <h1 className="admin-hero-title flex items-center gap-2">
              <Icon name="shield" size="lg" ariaHidden className="text-indigo-400" />
              <span>{t('admin.title', 'Bảng Điều Khiển Quản Trị Sàn (Executive Console)')}</span>
            </h1>
            <p className="admin-hero-sub">
              {t('admin.subtitle', 'Giám sát tổng quan, quản lý người dùng, kiểm duyệt sự kiện và đối soát dòng tiền.')}
            </p>
          </div>

          <div className="admin-hero-actions">
            <button
              type="button"
              className="admin-sync-btn"
              onClick={loadData}
              disabled={loading}
              title="Đồng bộ dữ liệu thời gian thực"
            >
              <Icon name="refresh" size="xs" className={loading ? 'animate-spin' : ''} ariaHidden />
              <span>{loading ? 'Đang đồng bộ...' : 'Tải lại dữ liệu'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modern Tab Navigation */}
      <div className="tabs-nav admin-tab-bar" role="tablist" aria-label="Khu vực quản trị sàn">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`tab-btn admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Icon name="chart" size="xs" ariaHidden />
          <span>{t('admin.tab_overview', 'Tổng quan & Đối soát')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`tab-btn admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Icon name="user" size="xs" ariaHidden />
          <span>{t('admin.tab_users', 'Người dùng')}</span>
          <span className="admin-tab-counter">{users.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'events'}
          className={`tab-btn admin-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <Icon name="calendar" size="xs" ariaHidden />
          <span>{t('admin.tab_events', 'Sự kiện')}</span>
          <span className="admin-tab-counter">{events.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={`tab-btn admin-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Icon name="ticket" size="xs" ariaHidden />
          <span>{t('admin.tab_orders', 'Đơn hàng')}</span>
          <span className="admin-tab-counter">{orders.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'announcements'}
          className={`tab-btn admin-tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          <Icon name="bell" size="xs" ariaHidden />
          <span>{t('admin.tab_announcements', 'Thông báo toàn sàn')}</span>
          <span className="admin-tab-counter">{announcements.length}</span>
        </button>
      </div>

      {/* Tab-specific error alert if any resource failed (UI-15 & V12-18) */}
      {tabErrors[activeTab] && (
        <div className="alert alert-error mb-md flex justify-between items-center">
          <span>{tabErrors[activeTab]}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => retryTab(activeTab)}>
            Thử lại
          </button>
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <AdminAnalyticsDashboard
          stats={stats}
          events={events}
          orders={orders}
          users={users}
          notify={notify}
        />
      )}

      {activeTab === 'users' && (
        <AdminUsersTab
          users={users}
          currentUser={currentUser}
          onReload={loadData}
          notify={notify}
        />
      )}

      {activeTab === 'events' && (
        <AdminEventsTab
          events={events}
          onReload={loadData}
          notify={notify}
        />
      )}

      {activeTab === 'orders' && (
        <AdminOrdersTab
          orders={orders}
        />
      )}

      {activeTab === 'announcements' && (
        <AdminAnnouncementsTab
          announcements={announcements}
          onReload={loadData}
          notify={notify}
        />
      )}
    </section>
  );
};

export default AdminPage;
