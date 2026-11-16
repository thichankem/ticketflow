import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { money, formatDate, formatDateTime } from '../utils/display';
import { Modal } from '../components/Modal';
import { AdminAnalyticsDashboard } from '../components/AdminAnalyticsDashboard';

export const AdminPage = () => {
  const { user: currentUser, isAdmin, loading: authLoading } = useAuth();

  // Active tab state: 'overview' | 'users' | 'events' | 'orders' | 'announcements'
  const [activeTab, setActiveTab] = useState('overview');

  // Loading & global error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Data states
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // Announcements Form & Filter states
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementData, setAnnouncementData] = useState({
    title: '',
    message: '',
    type: 'GENERAL',
    target_role: 'ALL',
  });
  const [announcementSearch, setAnnouncementSearch] = useState('');
  const [announcementTypeFilter, setAnnouncementTypeFilter] = useState('ALL');
  const [announcementRoleFilter, setAnnouncementRoleFilter] = useState('ALL');
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);

  // Filters & Searches
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL'); // ALL, ADMIN, ORGANIZER, ATTENDEE
  const [userLimit, setUserLimit] = useState(25);

  const [eventSearch, setEventSearch] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState('ALL'); // ALL, LIVE, DRAFT, CANCELLED
  const [eventLimit, setEventLimit] = useState(25);

  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL'); // ALL, PAID, RESERVED, CANCELLED
  const [orderLimit, setOrderLimit] = useState(25);

  // Notice timer
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserData, setCreateUserData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'ATTENDEE',
  });
  const [editingUser, setEditingUser] = useState(null);

  const notify = (msg, type = 'success') => {
    setActionNotice({ message: msg, type });
    setTimeout(() => {
      setActionNotice(null);
    }, 4500);
  };

  // Fetch initial data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch platform stats
      try {
        const statsRes = await api.admin.getStats();
        setStats(statsRes);
      } catch (err) {
        console.warn('Could not load stats:', err.message);
      }

      // 2. Fetch users
      try {
        const usersRes = await api.admin.getUsers();
        setUsers(Array.isArray(usersRes) ? usersRes : usersRes?.users || []);
      } catch (err) {
        console.warn('Could not load users:', err.message);
      }

      // 3. Fetch events
      try {
        const eventsRes = await api.admin.getEvents();
        setEvents(Array.isArray(eventsRes) ? eventsRes : eventsRes?.events || []);
      } catch {
        // Fallback to public list
        try {
          const pubEvents = await api.events.list();
          setEvents(Array.isArray(pubEvents) ? pubEvents : pubEvents?.events || []);
        } catch (err) {
          console.warn('Could not load events:', err.message);
        }
      }

      // 4. Fetch orders
      try {
        const ordersRes = await api.admin.getOrders();
        setOrders(Array.isArray(ordersRes) ? ordersRes : ordersRes?.orders || []);
      } catch (err) {
        console.warn('Could not load orders:', err.message);
      }

      // 5. Fetch announcements (Thông báo chung)
      try {
        const annRes = await api.admin.getAnnouncements();
        setAnnouncements(Array.isArray(annRes) ? annRes : annRes?.announcements || []);
      } catch (err) {
        console.warn('Could not load announcements:', err.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  // --- Handlers for User Management ---
  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.admin.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      notify(`User #${userId} role updated to ${newRole}`);
    } catch (err) {
      notify(`Failed to update role: ${err.message}`, 'error');
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    try {
      const res = await api.admin.toggleUserStatus(userId);
      const isSuspended = res?.user?.is_active === false || currentStatus === 'ACTIVE';
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                is_active: res?.user?.is_active !== undefined ? res.user.is_active : !u.is_active,
                status: isSuspended ? 'SUSPENDED' : 'ACTIVE',
              }
            : u
        )
      );
      notify(`User #${userId} status set to ${isSuspended ? 'SUSPENDED' : 'ACTIVE'}`);
    } catch (err) {
      try {
        await api.admin.suspendUser(userId);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, is_active: false, status: 'SUSPENDED' } : u
          )
        );
        notify(`User #${userId} suspended successfully.`);
      } catch (fallbackErr) {
        notify(`Failed to toggle user status: ${fallbackErr.message}`, 'error');
      }
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to remove user "${userName || userId}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.admin.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      notify(`User #${userId} deleted.`);
    } catch (err) {
      notify(`Failed to delete user: ${err.message}`, 'error');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await api.admin.createUser(createUserData);
      const created = res.user || res;
      setUsers((prev) => [created, ...prev]);
      notify(`Đã tạo người dùng "${created.name || created.email}" thành công!`);
      setShowCreateUserModal(false);
      setCreateUserData({ name: '', email: '', password: '', phone: '', role: 'ATTENDEE' });
    } catch (err) {
      notify(`Lỗi tạo người dùng: ${err.message}`, 'error');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await api.admin.updateUser(editingUser.id, editingUser);
      const updated = res.user || res;
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...updated } : u)));
      notify(`Đã cập nhật thông tin người dùng #${editingUser.id} thành công!`);
      setEditingUser(null);
    } catch (err) {
      notify(`Lỗi cập nhật người dùng: ${err.message}`, 'error');
    }
  };

  // --- Handlers for Events Control ---
  const handleEventStatusChange = async (eventId, newStatus) => {
    try {
      await api.admin.updateEventStatus(eventId, newStatus);
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? { ...ev, status: newStatus } : ev))
      );
      notify(`Event #${eventId} status changed to ${newStatus}`);
    } catch (err) {
      notify(`Failed to update event status: ${err.message}`, 'error');
    }
  };

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`⚠️ CẢNH BÁO XÓA SỰ KIỆN: "${eventTitle}"\n\nBạn có chắc chắn muốn xóa vĩnh viễn sự kiện này không?\n\n⚡ Toàn bộ đơn hàng đã mua vé sẽ tự động được HOÀN TIỀN 100% cho khách hàng!`)) {
      return;
    }
    try {
      const res = await api.admin.deleteEvent(eventId);
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      notify(res?.message || `Sự kiện "${eventTitle}" đã được xóa và tự động hoàn tiền 100% cho người mua.`);
    } catch (err) {
      notify(`Lỗi khi xóa sự kiện: ${err.message}`, 'error');
    }
  };

  // --- Filtered Data ---
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !userSearch ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
        String(u.id).includes(userSearch);

      const matchRole =
        userRoleFilter === 'ALL' ||
        (u.role && u.role.toUpperCase() === userRoleFilter.toUpperCase());

      return matchSearch && matchRole;
    });
  }, [users, userSearch, userRoleFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchSearch =
        !eventSearch ||
        (ev.title && ev.title.toLowerCase().includes(eventSearch.toLowerCase())) ||
        (ev.organizer_name && ev.organizer_name.toLowerCase().includes(eventSearch.toLowerCase())) ||
        String(ev.id).includes(eventSearch);

      const matchStatus =
        eventStatusFilter === 'ALL' ||
        (ev.status && ev.status.toUpperCase() === eventStatusFilter.toUpperCase());

      return matchSearch && matchStatus;
    });
  }, [events, eventSearch, eventStatusFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !orderSearch ||
        (o.short_id && o.short_id.toLowerCase().includes(orderSearch.toLowerCase())) ||
        (o.customer_email && o.customer_email.toLowerCase().includes(orderSearch.toLowerCase())) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(orderSearch.toLowerCase())) ||
        String(o.id).includes(orderSearch);

      const matchStatus =
        orderStatusFilter === 'ALL' ||
        (o.status && o.status.toUpperCase() === orderStatusFilter.toUpperCase());

      return matchSearch && matchStatus;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  // --- Handlers & Filtering for Broadcast Announcements ---
  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementData.title.trim()) {
      notify('Vui lòng nhập tiêu đề thông báo', 'error');
      return;
    }
    if (!announcementData.message.trim()) {
      notify('Vui lòng nhập nội dung thông báo', 'error');
      return;
    }

    setIsSubmittingAnnouncement(true);
    try {
      const res = await api.admin.createAnnouncement(announcementData);
      const newAnn = res.announcement || {
        id: Date.now(),
        ...announcementData,
        recipients_count: res.recipients_count || 0,
        created_at: new Date().toISOString(),
      };
      setAnnouncements((prev) => [newAnn, ...prev]);
      setShowAnnouncementModal(false);
      setAnnouncementData({ title: '', message: '', type: 'GENERAL', target_role: 'ALL' });
      notify(`Đã phát thông báo thành công tới ${res.recipients_count || 'tất cả'} người nhận!`);
    } catch (err) {
      notify(err.message || 'Lỗi khi phát thông báo', 'error');
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa thông báo chung này khỏi hệ thống?')) return;
    try {
      await api.admin.deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      notify('Đã xóa thông báo chung!');
    } catch (err) {
      notify(err.message || 'Lỗi khi xóa thông báo', 'error');
    }
  };

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      const matchSearch =
        !announcementSearch ||
        a.title?.toLowerCase().includes(announcementSearch.toLowerCase()) ||
        a.message?.toLowerCase().includes(announcementSearch.toLowerCase());
      const matchType = announcementTypeFilter === 'ALL' || a.type === announcementTypeFilter;
      const matchRole = announcementRoleFilter === 'ALL' || a.target_role === announcementRoleFilter;
      return matchSearch && matchType && matchRole;
    });
  }, [announcements, announcementSearch, announcementTypeFilter, announcementRoleFilter]);

  const displayedUsers = filteredUsers.slice(0, userLimit);
  const displayedEvents = filteredEvents.slice(0, eventLimit);
  const displayedOrders = filteredOrders.slice(0, orderLimit);

  // Non-admin guard
  if (!authLoading && !isAdmin) {
    return (
      <section className="card empty-state max-w-modal">
        <span className="badge badge-danger">Restricted</span>
        <h2 className="mt-08">Admin Access Denied</h2>
        <p className="muted">
          You must be signed in with an administrator account to view and manage platform controls.
        </p>
      </section>
    );
  }

  // Calculated conversion and refund metrics
  const grossSales = stats?.gross_sales || stats?.grossRevenue || 0;
  const totalOrders = stats?.total_orders || orders.length || 0;
  const totalEvents = stats?.total_events || events.length || 0;
  const totalUsers = stats?.total_users || users.length || 0;
  const totalRefundedOrders = orders.filter((o) => o.status === 'REFUNDED' || o.status === 'CANCELLED').length;
  const refundRate =
    stats?.refund_rate ||
    (totalOrders > 0 ? ((totalRefundedOrders / totalOrders) * 100).toFixed(1) + '%' : '1.8%');
  const platformCommission = Math.round(grossSales * 0.05); // 5% standard platform commission

  return (
    <section>
      <header className="page-head">
        <div className="flex items-center gap-sm">
          <span className="badge badge-role-admin">Admin Dashboard</span>
          <span className="muted text-xs">
            Logged in as {currentUser?.name || 'Administrator'}
          </span>
        </div>
        <h1>Platform Administration</h1>
      </header>

      {/* Action Notification Alert */}
      {actionNotice && (
        <div className={`alert ${actionNotice.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {actionNotice.message}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Tabs Navigation */}
      <nav className="tabs-nav" aria-label="Admin Sections">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span>Platform Overview</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span>User Management</span>
          <span className="tab-count">{users.length}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <span>Events Control</span>
          <span className="tab-count">{events.length}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span>Platform Orders</span>
          <span className="tab-count">{orders.length}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          <span>📢 Thông Báo Chung</span>
          <span className="tab-count">{announcements.length}</span>
        </button>
      </nav>

      {/* TAB 1: Platform Overview & Super Admin Analytics Dashboard */}
      {activeTab === 'overview' && (
        <div className="stack gap-md">
          {/* Executive Analytics Dashboard with 4 Required Charts & Detailed Stats */}
          <AdminAnalyticsDashboard
            events={events}
            users={users}
            orders={orders}
            stats={stats}
            onRefresh={loadData}
          />

          {/* Quick Summary Grid */}
          <div className="split mt-sm">
            <section className="card flex-1">
              <h2 className="panel-title">Operational Quick Jump</h2>
              <p className="muted text-sm">
                Direct access to high-priority moderation and platform tasks.
              </p>
              <div className="flex gap-sm flex-wrap mt-md">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('users')}
                >
                  Manage Users & Roles
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('events')}
                >
                  Moderate Live Events
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('orders')}
                >
                  Review Platform Orders
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('announcements')}
                >
                  📢 Phát Thông Báo Chung
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportAuditReport}
                >
                  📥 Export Financial Audit
                </button>
              </div>
            </section>

            <section className="card dialog-inner w-modal-380">
              <h2 className="panel-title">Platform Summary</h2>
              <div className="stack gap-sm mt-sm">
                <div className="flex justify-between items-center">
                  <span className="muted">Total Users</span>
                  <strong>{totalUsers}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="muted">Live Events</span>
                  <strong>{events.length}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="muted">Total Orders</span>
                  <strong>{orders.length}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="muted">Operational Status</span>
                  <span className="badge badge-success">Active</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: User Management */}
      {activeTab === 'users' && (
        <section className="card">
          <div className="toolbar flex flex-wrap justify-between items-center gap-2">
            <div className="search-input-wrapper">
              <label htmlFor="admin-users-search" className="sr-only">Tìm kiếm người dùng</label>
              <input
                id="admin-users-search"
                type="text"
                className="input"
                placeholder="Search user by name, email, or ID..."
                aria-label="Search user by name, email, or ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div className="filter-pills">
              <span className="muted text-xs mr-02">
                Role:
              </span>
              {['ALL', 'ADMIN', 'ORGANIZER', 'ATTENDEE'].map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`filter-pill ${userRoleFilter === role ? 'active' : ''}`}
                  onClick={() => setUserRoleFilter(role)}
                >
                  {role === 'ALL' ? 'All Roles' : role}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm ml-auto"
              onClick={() => setShowCreateUserModal(true)}
            >
              ➕ Thêm Người Dùng
            </button>
          </div>

          {/* Modal Popup: Thêm Người Dùng Mới */}
          <Modal
            isOpen={showCreateUserModal}
            onClose={() => setShowCreateUserModal(false)}
            title="➕ Thêm Người Dùng Mới Vào Hệ Thống"
            subtitle="Tạo tài khoản mới với vai trò Khách hàng, Ban tổ chức hoặc Quản trị viên"
          >
            <form onSubmit={handleCreateUser} className="stack gap-sm">
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Họ và tên *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="Nguyễn Văn A"
                  value={createUserData.name}
                  onChange={(e) => setCreateUserData({ ...createUserData, name: e.target.value })}
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Email *</label>
                <input
                  type="email"
                  className="input"
                  required
                  placeholder="email@example.com"
                  value={createUserData.email}
                  onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Mật khẩu</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Mặc định: Ticketflow@123"
                  value={createUserData.password}
                  onChange={(e) => setCreateUserData({ ...createUserData, password: e.target.value })}
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Số điện thoại</label>
                <input
                  type="tel"
                  className="input"
                  placeholder="0912345678"
                  value={createUserData.phone}
                  onChange={(e) => setCreateUserData({ ...createUserData, phone: e.target.value })}
                />
              </div>
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Vai trò (Role)</label>
                <select
                  className="select"
                  value={createUserData.role}
                  onChange={(e) => setCreateUserData({ ...createUserData, role: e.target.value })}
                >
                  <option value="ATTENDEE">Khách Mua Vé (Attendee)</option>
                  <option value="ORGANIZER">Ban Tổ Chức (Organizer)</option>
                  <option value="ADMIN">Quản Trị Viên (Admin)</option>
                </select>
              </div>
              <div className="flex justify-end gap-xs mt-md">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowCreateUserModal(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  ✓ Tạo Người Dùng
                </button>
              </div>
            </form>
          </Modal>

          {/* Modal Popup: Chỉnh Sửa Thông Tin Người Dùng */}
          <Modal
            isOpen={!!editingUser}
            onClose={() => setEditingUser(null)}
            title={`✏️ Chỉnh Sửa Người Dùng #${editingUser?.id || ''}`}
            subtitle="Cập nhật thông tin định danh và phân quyền tài khoản người dùng"
          >
            {editingUser && (
              <form onSubmit={handleUpdateUser} className="stack gap-sm">
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Họ và tên</label>
                  <input
                    type="text"
                    className="input"
                    value={editingUser.name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Email</label>
                  <input
                    type="email"
                    className="input"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Số điện thoại</label>
                  <input
                    type="tel"
                    className="input"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Vai trò (Role)</label>
                  <select
                    className="select"
                    value={editingUser.role || 'ATTENDEE'}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    <option value="ATTENDEE">Khách Mua Vé (Attendee)</option>
                    <option value="ORGANIZER">Ban Tổ Chức (Organizer)</option>
                    <option value="ADMIN">Quản Trị Viên (Admin)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-xs mt-md">
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditingUser(null)}>
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary flex-1">
                    Lưu Thay Đổi
                  </button>
                </div>
              </form>
            )}
          </Modal>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-w-60">ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="td-empty-state">
                      <p className="muted">No users found matching your filters.</p>
                    </td>
                  </tr>
                ) : (
                  displayedUsers.map((u) => {
                    const isSuspended =
                      u.is_active === false ||
                      u.status === 'SUSPENDED' ||
                      u.status === 'suspended';
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>#{u.id}</strong>
                        </td>
                        <td>
                          <div className="font-semibold">{u.name || 'Unnamed User'}</div>
                        </td>
                        <td className="muted">{u.email}</td>
                        <td>
                          <span
                            className={`badge badge-role-${(u.role || 'ATTENDEE').toLowerCase()}`}
                          >
                            {u.role || 'ATTENDEE'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${isSuspended ? 'badge-status-suspended' : 'badge-status-active'}`}
                          >
                            {isSuspended ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td className="muted text-xs">
                          {formatDate(u.created_at)}
                        </td>
                        <td>
                          <div className="table-actions justify-end">
                            <select
                              className="select select-compact btn-table-action"
                              value={u.role || 'ATTENDEE'}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            >
                              <option value="ATTENDEE">Attendee</option>
                              <option value="ORGANIZER">Organizer</option>
                              <option value="ADMIN">Admin</option>
                            </select>

                            {u.id === 1 || u.id === currentUser?.id ? (
                              <span className="badge badge-subtle" title="Tài khoản Quản trị gốc">
                                Root Admin
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-secondary"
                                  title="Chỉnh sửa thông tin"
                                  onClick={() =>
                                    setEditingUser({
                                      id: u.id,
                                      name: u.name || '',
                                      email: u.email || '',
                                      phone: u.phone || '',
                                      role: u.role || 'ATTENDEE',
                                    })
                                  }
                                >
                                  ✏️
                                </button>

                                <button
                                  type="button"
                                  className={`btn btn-xs ${isSuspended ? 'btn-secondary' : 'btn-danger'}`}
                                  onClick={() => handleToggleUserStatus(u.id, isSuspended ? 'SUSPENDED' : 'ACTIVE')}
                                >
                                  {isSuspended ? 'Reactivate' : 'Suspend'}
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-xs btn-danger"
                                  title="Delete User"
                                  onClick={() => handleDeleteUser(u.id, u.name)}
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* User Pagination Controls */}
          {userLimit < filteredUsers.length && (
            <div className="card-footer-action">
              <span className="muted text-sm mr-md">
                Showing {displayedUsers.length} of {filteredUsers.length} users
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm mr-sm"
                onClick={() => setUserLimit((prev) => prev + 25)}
              >
                + Load 25 More Users
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setUserLimit(filteredUsers.length)}
              >
                Show All ({filteredUsers.length})
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Events Control */}
      {activeTab === 'events' && (
        <section className="card">
          <div className="toolbar">
            <div className="search-input-wrapper">
              <label htmlFor="admin-events-search" className="sr-only">Tìm kiếm sự kiện</label>
              <input
                id="admin-events-search"
                type="text"
                className="input"
                placeholder="Search event title or organizer..."
                aria-label="Search event title or organizer..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </div>

            <div className="filter-pills">
              <span className="muted text-xs mr-02">
                Status:
              </span>
              {['ALL', 'LIVE', 'DRAFT', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`filter-pill ${eventStatusFilter === st ? 'active' : ''}`}
                  onClick={() => setEventStatusFilter(st)}
                >
                  {st === 'ALL' ? 'All Events' : st}
                </button>
              ))}
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-w-60">ID</th>
                  <th>Event Title</th>
                  <th>Organizer</th>
                  <th>Tiers / Capacity</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th className="text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="td-empty-state">
                      <p className="muted">No events found matching your criteria.</p>
                    </td>
                  </tr>
                ) : (
                  displayedEvents.map((ev) => {
                    const statusKey = (ev.status || 'DRAFT').toUpperCase();
                    const tiersCount = ev.tiers?.length || ev.tiers_count || 1;
                    return (
                      <tr key={ev.id}>
                        <td>
                          <strong>#{ev.id}</strong>
                        </td>
                        <td>
                          <div className="font-semibold">{ev.title}</div>
                          <span className="muted text-xs">
                            {ev.category || 'Event'} · {ev.location || 'Online'}
                          </span>
                        </td>
                        <td>
                          <span className="muted">
                            {ev.organizer_name || `Organizer #${ev.organizer_id || 1}`}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">{tiersCount} Tier{tiersCount > 1 ? 's' : ''}</span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-status-${statusKey.toLowerCase()}`}
                          >
                            {statusKey}
                          </span>
                        </td>
                        <td className="muted text-xs">
                          {formatDate(ev.start_date || ev.starts_at)}
                        </td>
                        <td>
                          <div className="table-actions justify-end">
                            <select
                              className="select select-compact btn-table-action"
                              value={statusKey}
                              onChange={(e) => handleEventStatusChange(ev.id, e.target.value)}
                            >
                              <option value="LIVE">LIVE</option>
                              <option value="DRAFT">DRAFT</option>
                              <option value="CANCELLED">CANCELLED</option>
                              <option value="ARCHIVED">ARCHIVED</option>
                            </select>

                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => handleDeleteEvent(ev.id, ev.title)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Events Pagination Controls */}
          {eventLimit < filteredEvents.length && (
            <div className="card-footer-action">
              <span className="muted text-sm mr-md">
                Showing {displayedEvents.length} of {filteredEvents.length} events
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm mr-sm"
                onClick={() => setEventLimit((prev) => prev + 25)}
              >
                + Load 25 More Events
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEventLimit(filteredEvents.length)}
              >
                Show All ({filteredEvents.length})
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: Platform Orders */}
      {activeTab === 'orders' && (
        <section className="card">
          <div className="toolbar">
            <div className="search-input-wrapper">
              <label htmlFor="admin-orders-search" className="sr-only">Tìm kiếm đơn hàng</label>
              <input
                id="admin-orders-search"
                type="text"
                className="input"
                placeholder="Search by Order ID, Short ID, or Customer email..."
                aria-label="Search by Order ID, Short ID, or Customer email..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
            </div>

            <div className="filter-pills">
              <span className="muted text-xs mr-02">
                Status:
              </span>
              {['ALL', 'PAID', 'RESERVED', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`filter-pill ${orderStatusFilter === st ? 'active' : ''}`}
                  onClick={() => setOrderStatusFilter(st)}
                >
                  {st === 'ALL' ? 'All Orders' : st}
                </button>
              ))}
            </div>

            <div className="flex gap-sm items-center">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    await api.admin.exportAuditReport();
                  } catch (e) {
                    alert('Lỗi xuất báo cáo kiểm toán: ' + e.message);
                  }
                }}
                title="Xuất báo cáo tài chính kiểm toán toàn sàn dạng CSV"
              >
                Xuất Báo Cáo Kiểm Toán (CSV)
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Customer</th>
                  <th>Event</th>
                  <th>Gross Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="td-empty-state">
                      <p className="muted">No platform transactions recorded yet.</p>
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((ord) => {
                    const statusKey = (ord.status || 'PAID').toUpperCase();
                    return (
                      <tr key={ord.id || ord.short_id}>
                        <td>
                          <div className="font-mono font-bold">
                            {ord.short_id ? `#${ord.short_id}` : `#ORD-${ord.id}`}
                          </div>
                        </td>
                        <td>
                          <div className="font-semibold">{ord.customer_name || 'Customer'}</div>
                          <div className="muted text-xs">
                            {ord.customer_email || ord.email || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <span className="muted">{ord.event_title || `Event #${ord.event_id || 1}`}</span>
                        </td>
                        <td>
                          <strong className="text-base-plus">
                            {money(ord.total_gross || ord.total_amount || ord.total || 0)}
                          </strong>
                        </td>
                        <td>
                          <span className={`badge badge-order-${statusKey.toLowerCase()}`}>
                            {statusKey}
                          </span>
                        </td>
                        <td className="muted text-xs">
                          {formatDateTime(ord.created_at) || 'Recent'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Orders Pagination Controls */}
          {orderLimit < filteredOrders.length && (
            <div className="card-footer-action">
              <span className="muted text-sm mr-md">
                Showing {displayedOrders.length} of {filteredOrders.length} orders
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm mr-sm"
                onClick={() => setOrderLimit((prev) => prev + 25)}
              >
                + Load 25 More Orders
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOrderLimit(filteredOrders.length)}
              >
                Show All ({filteredOrders.length})
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 5: Platform Broadcast Announcements (Thông Báo Chung) */}
      {activeTab === 'announcements' && (
        <section className="card">
          <div className="panel-header flex flex-wrap justify-between items-center gap-md pb-md border-b mb-md">
            <div>
              <h2 className="panel-title m-0">📢 Quản Lý Thông Báo Chung Toàn Sàn</h2>
              <p className="muted text-sm mt-xs">
                Soạn thảo và phát thông báo tức thời đến tất cả người dùng, ban tổ chức hoặc khách mua vé.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-xs"
              onClick={() => setShowAnnouncementModal(true)}
            >
              <span>➕ Tạo Thông Báo Mới</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="kpi-grid mb-md">
            <article className="card kpi">
              <span className="muted">Tổng Thông Báo Đã Phát</span>
              <strong>{announcements.length}</strong>
              <span className="note good text-xs">Vận hành toàn sàn</span>
            </article>
            <article className="card kpi">
              <span className="muted">Lượt Người Nhận Tiếp Cận</span>
              <strong>{announcements.reduce((acc, a) => acc + (a.recipients_count || 0), 0)}</strong>
              <span className="note good text-xs">Phân phối In-app Box</span>
            </article>
            <article className="card kpi">
              <span className="muted">Đối Tượng Phủ Sóng</span>
              <strong>3 Nhóm Người Dùng</strong>
              <span className="muted text-xs">Toàn sàn / BTC / Khách vé</span>
            </article>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="toolbar flex flex-wrap justify-between items-center gap-2 mb-md">
            <div className="search-input-wrapper flex-1">
              <label htmlFor="admin-announcement-search" className="sr-only">Tìm kiếm thông báo</label>
              <input
                id="admin-announcement-search"
                type="text"
                className="input"
                placeholder="Tìm kiếm theo tiêu đề hoặc nội dung thông báo..."
                aria-label="Tìm kiếm theo tiêu đề hoặc nội dung thông báo..."
                value={announcementSearch}
                onChange={(e) => setAnnouncementSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <select
                className="select select-sm"
                value={announcementTypeFilter}
                onChange={(e) => setAnnouncementTypeFilter(e.target.value)}
                aria-label="Lọc theo loại thông báo"
              >
                <option value="ALL">Tất cả loại thông báo</option>
                <option value="GENERAL">Thông báo chung</option>
                <option value="MAINTENANCE">Bảo trì hệ thống</option>
                <option value="POLICY">Cập nhật chính sách</option>
                <option value="PROMO">Sự kiện & Ưu đãi</option>
              </select>
              <select
                className="select select-sm"
                value={announcementRoleFilter}
                onChange={(e) => setAnnouncementRoleFilter(e.target.value)}
                aria-label="Lọc theo đối tượng"
              >
                <option value="ALL">Tất cả đối tượng</option>
                <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
                <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
              </select>
              {(announcementSearch || announcementTypeFilter !== 'ALL' || announcementRoleFilter !== 'ALL') && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setAnnouncementSearch('');
                    setAnnouncementTypeFilter('ALL');
                    setAnnouncementRoleFilter('ALL');
                  }}
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </div>

          {/* Announcements Table */}
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Mã</th>
                  <th scope="col">Phân Loại</th>
                  <th scope="col">Tiêu Đề & Nội Dung</th>
                  <th scope="col">Đối Tượng Nhận</th>
                  <th scope="col">Số Người Nhận</th>
                  <th scope="col">Thời Gian Gửi</th>
                  <th scope="col" className="text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted">
                      <div className="empty-state p-4">
                        <span className="text-2xl d-block mb-2">📢</span>
                        <p className="font-semibold">Chưa có thông báo chung nào phù hợp</p>
                        <p className="text-xs text-muted mt-1">Bấm nút "Tạo Thông Báo Mới" để phát thông báo toàn sàn.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAnnouncements.map((a) => {
                    let typeBadgeClass = 'badge-primary';
                    let typeLabel = 'Thông Báo Chung';
                    if (a.type === 'MAINTENANCE') {
                      typeBadgeClass = 'badge-warning';
                      typeLabel = 'Bảo Trì Hệ Thống';
                    } else if (a.type === 'POLICY') {
                      typeBadgeClass = 'badge-role-admin';
                      typeLabel = 'Chính Sách';
                    } else if (a.type === 'PROMO') {
                      typeBadgeClass = 'badge-success';
                      typeLabel = 'Ưu Đãi & Sự Kiện';
                    }

                    let roleLabel = '🌐 Toàn Bộ Người Dùng';
                    if (a.target_role === 'ORGANIZER') roleLabel = '🏢 Ban Tổ Chức';
                    if (a.target_role === 'ATTENDEE') roleLabel = '🎟️ Khách Mua Vé';

                    return (
                      <tr key={a.id}>
                        <td>
                          <span className="code-badge">#{a.id}</span>
                        </td>
                        <td>
                          <span className={`badge ${typeBadgeClass}`}>{typeLabel}</span>
                        </td>
                        <td className="max-w-md">
                          <strong className="d-block text-sm">{a.title}</strong>
                          <p className="muted text-xs line-clamp-2 mt-035">{a.message}</p>
                        </td>
                        <td>
                          <span className="badge badge-secondary">{roleLabel}</span>
                        </td>
                        <td>
                          <strong>{a.recipients_count || 0}</strong> <span className="muted text-xs">người</span>
                        </td>
                        <td className="muted text-xs">
                          {formatDateTime(a.created_at) || formatDate(a.created_at)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-danger hover:bg-danger-light"
                            onClick={() => handleDeleteAnnouncement(a.id)}
                            title="Xóa thông báo này"
                          >
                            🗑️ Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal Tạo Thông Báo Chung Mới (Popup đơn giản, tuân thủ quy tắc) */}
      <Modal
        isOpen={showAnnouncementModal}
        onClose={() => setShowAnnouncementModal(false)}
        title="📢 Phát Thông Báo Chung Toàn Sàn"
      >
        <form onSubmit={handleCreateAnnouncement} className="stack gap-md">
          <div className="form-group">
            <label htmlFor="announcement-title" className="form-label font-semibold">
              Tiêu đề thông báo <span className="text-danger">*</span>
            </label>
            <input
              id="announcement-title"
              type="text"
              className="input w-full"
              placeholder="VD: Bảo trì nâng cấp hệ thống thanh toán ngày 16/11"
              value={announcementData.title}
              onChange={(e) => setAnnouncementData({ ...announcementData, title: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div className="form-group">
              <label htmlFor="announcement-type" className="form-label font-semibold">
                Loại thông báo
              </label>
              <select
                id="announcement-type"
                className="select w-full"
                value={announcementData.type}
                onChange={(e) => setAnnouncementData({ ...announcementData, type: e.target.value })}
              >
                <option value="GENERAL">📢 Thông báo chung</option>
                <option value="MAINTENANCE">⚠️ Bảo trì hệ thống</option>
                <option value="POLICY">📜 Cập nhật chính sách</option>
                <option value="PROMO">🎁 Ưu đãi & Sự kiện</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="announcement-target-role" className="form-label font-semibold">
                Đối tượng nhận thông báo
              </label>
              <select
                id="announcement-target-role"
                className="select w-full"
                value={announcementData.target_role}
                onChange={(e) => setAnnouncementData({ ...announcementData, target_role: e.target.value })}
              >
                <option value="ALL">🌐 Tất cả người dùng (All Users)</option>
                <option value="ORGANIZER">🏢 Chỉ Ban Tổ Chức (Organizers)</option>
                <option value="ATTENDEE">🎟️ Chỉ Khách Mua Vé (Attendees)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="announcement-message" className="form-label font-semibold">
              Nội dung thông báo chi tiết <span className="text-danger">*</span>
            </label>
            <textarea
              id="announcement-message"
              className="input w-full"
              rows={4}
              placeholder="Nhập nội dung thông báo đầy đủ sẽ được gửi tới hộp thư của người nhận..."
              value={announcementData.message}
              onChange={(e) => setAnnouncementData({ ...announcementData, message: e.target.value })}
              required
            />
          </div>

          <div className="alert alert-info text-xs">
            ℹ️ Thông báo này sẽ được tự động phân phối tức thì đến hộp thư in-app của tất cả người dùng thuộc nhóm đối tượng đã chọn.
          </div>

          <div className="flex justify-end gap-sm pt-sm border-t">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAnnouncementModal(false)}
              disabled={isSubmittingAnnouncement}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmittingAnnouncement}
            >
              {isSubmittingAnnouncement ? 'Đang phát thông báo...' : '🚀 Phát Thông Báo Ngay'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
};

export default AdminPage;
