import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AdminAnalyticsDashboard } from '../components/AdminAnalyticsDashboard';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminEventsTab } from '../components/admin/AdminEventsTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminAnnouncementsTab } from '../components/admin/AdminAnnouncementsTab';
import { AdminReportsTab } from '../components/admin/AdminReportsTab';
import { Icon } from '../components/ui/Icon';

export const AdminPage = () => {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();

  // Active tab: 'overview' | 'users' | 'events' | 'orders' | 'announcements' | 'reports'
  const [activeTab, setActiveTab] = useState('overview');

  // Shared platform data
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [reports, setReports] = useState([]);
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
      const [statsRes, usersRes, eventsRes, ordersRes, announcementsRes, reportsRes] = await Promise.allSettled([
        api.admin.getStats(),
        api.admin.getUsers(),
        api.admin.getEvents(),
        api.admin.getOrders(),
        api.admin.getAnnouncements(),
        api.admin.getReports(),
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
        const rawEvents = Array.isArray(e) ? e : e?.events || [];
        // Admin does not have permission to view DRAFT events (DRAFT belongs exclusively to Organizer)
        setEvents(rawEvents.filter((ev) => (ev.status || '').toUpperCase() !== 'DRAFT'));
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

      if (reportsRes.status === 'fulfilled') {
        const r = reportsRes.value;
        setReports(Array.isArray(r) ? r : r?.reports || []);
      } else {
        newErrors.reports = reportsRes.reason?.message || 'Không thể tải báo cáo vi phạm';
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
        const rawEvents = Array.isArray(e) ? e : e?.events || [];
        setEvents(rawEvents.filter((ev) => (ev.status || '').toUpperCase() !== 'DRAFT'));
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
      } else if (target === 'reports') {
        const r = await api.admin.getReports();
        setReports(Array.isArray(r) ? r : r?.reports || []);
        setTabErrors((prev) => {
          const next = { ...prev };
          delete next.reports;
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

  const handleUpdateReport = async (id, data) => {
    const res = await api.admin.updateReport(id, data);
    const updated = res?.report;
    if (updated) {
      setReports((prev) => prev.map((it) => (it.id === id ? { ...it, ...updated } : it)));
    } else {
      await loadData();
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <section className="container py-md">
      {/* Notice Alert */}
      {notice && (
        <div className={`alert alert-${notice.type === 'error' ? 'error' : notice.type === 'warning' ? 'warning' : 'success'} mb-md flex justify-between items-center`}>
          <div className="flex items-center gap-2">
            <Icon name={notice.type === 'error' ? 'alert-triangle' : notice.type === 'warning' ? 'alert-circle' : 'check-circle'} size="sm" ariaHidden />
            <span className="font-medium text-sm">{notice.message}</span>
          </div>
          <button
            type="button"
            className="btn-close flex items-center justify-center"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            <Icon name="x" size="xs" ariaHidden />
          </button>
        </div>
      )}

      {/* Standard TicketFlow Page Header */}
      <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
        <div>
          <h1 className="text-2xl font-bold m-0 flex items-center gap-xs">
            <Icon name="shield" size="lg" ariaHidden className="text-primary mr-1" />
            <span>{t('admin.title', 'Bảng Điều Hành Quản Trị Sàn')}</span>
          </h1>
          <p className="text-xs muted m-0 mt-1">
            {t('admin.subtitle', 'Giám sát tổng quan, quản lý người dùng, kiểm duyệt sự kiện và theo dõi dòng tiền.')}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
          onClick={loadData}
          disabled={loading}
          title="Tải lại dữ liệu"
        >
          <Icon name="refresh" size="xs" className={loading ? 'animate-spin' : ''} ariaHidden />
          <span>{loading ? 'Đang đồng bộ...' : 'Tải lại dữ liệu'}</span>
        </button>
      </div>

      {/* Standard Tab Navigation */}
      <div className="tabs-nav mb-lg border-b overflow-x-auto whitespace-nowrap" role="tablist" aria-label="Khu vực quản trị sàn">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Icon name="chart" size="xs" ariaHidden />
          <span>{t('admin.tab_overview', 'Tổng quan & Báo cáo')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Icon name="user" size="xs" ariaHidden />
          <span>{t('admin.tab_users', 'Người dùng')}</span>
          <span className="tab-count">{users.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'events'}
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <Icon name="calendar" size="xs" ariaHidden />
          <span>{t('admin.tab_events', 'Sự kiện')}</span>
          <span className="tab-count">{events.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Icon name="receipt" size="xs" ariaHidden />
          <span>{t('admin.tab_orders', 'Lịch sử')}</span>
          <span className="tab-count">{orders.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'announcements'}
          className={`tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          <Icon name="bell" size="xs" ariaHidden />
          <span>{t('admin.tab_announcements', 'Thông báo toàn sàn')}</span>
          <span className="tab-count">{announcements.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reports'}
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <Icon name="shield" size="xs" ariaHidden />
          <span>{t('admin.tab_reports', 'Báo cáo vi phạm')}</span>
          <span className="tab-count">
            {reports.filter((r) => r.status === 'PENDING').length > 0
              ? reports.filter((r) => r.status === 'PENDING').length
              : reports.length}
          </span>
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
          reports={reports}
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

      {activeTab === 'reports' && (
        <AdminReportsTab
          reports={reports}
          loading={loading}
          onUpdateReport={handleUpdateReport}
          onReload={loadData}
          notify={notify}
        />
      )}
    </section>
  );
};

export default AdminPage;
