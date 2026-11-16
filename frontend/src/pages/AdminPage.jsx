import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AdminAnalyticsDashboard } from '../components/AdminAnalyticsDashboard';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminEventsTab } from '../components/admin/AdminEventsTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminAnnouncementsTab } from '../components/admin/AdminAnnouncementsTab';

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

  // Toast feedback notice
  const [notice, setNotice] = useState(null);
  const notify = (msg, type = 'success') => {
    setNotice({ message: msg, type });
    setTimeout(() => setNotice(null), 4500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, eventsRes, ordersRes, announcementsRes] = await Promise.allSettled([
        api.admin.getStats(),
        api.admin.getUsers(),
        api.admin.getEvents(),
        api.admin.getOrders(),
        api.admin.getAnnouncements(),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value?.stats || statsRes.value);
      if (usersRes.status === 'fulfilled') {
        const u = usersRes.value;
        setUsers(Array.isArray(u) ? u : u?.users || []);
      }
      if (eventsRes.status === 'fulfilled') {
        const e = eventsRes.value;
        setEvents(Array.isArray(e) ? e : e?.events || []);
      }
      if (ordersRes.status === 'fulfilled') {
        const o = ordersRes.value;
        setOrders(Array.isArray(o) ? o : o?.orders || []);
      }
      if (announcementsRes.status === 'fulfilled') {
        const a = announcementsRes.value;
        setAnnouncements(Array.isArray(a) ? a : a?.announcements || []);
      }
    } catch (err) {
      console.warn('Error loading admin platform data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <section className="container py-md">
      {/* Toast Notice */}
      {notice && (
        <div className={`alert alert-${notice.type} mb-md flex justify-between items-center`}>
          <span>{notice.message}</span>
          <button type="button" className="btn-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {/* Admin Console Header */}
      <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
        <div>
          <h1 className="text-2xl font-bold m-0 flex items-center gap-xs">
            <span>🛡️</span> {t('admin.title', 'Bảng Điều Khiển Quản Trị Sàn (Executive Console)')}
          </h1>
          <p className="muted text-sm m-0">
            {t('admin.subtitle', 'Giám sát tổng quan, quản lý người dùng, kiểm duyệt sự kiện và đối soát dòng tiền.')}
          </p>
        </div>

        <div className="flex items-center gap-xs">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? 'Đang đồng bộ...' : 'Tải lại dữ liệu'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-nav mb-lg border-b">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          {t('admin.tab_overview', 'Tổng quan & Đối soát')}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          {t('admin.tab_users', 'Người dùng')} ({users.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          {t('admin.tab_events', 'Sự kiện')} ({events.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          {t('admin.tab_orders', 'Đơn hàng')} ({orders.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          {t('admin.tab_announcements', 'Thông báo toàn sàn')} ({announcements.length})
        </button>
      </div>

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
