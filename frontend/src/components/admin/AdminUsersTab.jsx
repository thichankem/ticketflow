import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Icon } from '../ui/Icon';

export const AdminUsersTab = ({ users = [], currentUser, onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [createData, setCreateData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ATTENDEE',
    phone: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts = { ALL: users.length, ADMIN: 0, ORGANIZER: 0, ATTENDEE: 0 };
    users.forEach((u) => {
      const r = u.role || 'ATTENDEE';
      if (counts[r] !== undefined) counts[r]++;
    });
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        String(u.id).includes(q);

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const getInitials = (name, email) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    return (email || 'US').slice(0, 2).toUpperCase();
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.admin.updateUserRole(userId, newRole);
      notify(`Đã cập nhật vai trò người dùng #${userId} thành ${newRole}`);
      onReload();
    } catch (err) {
      notify(`Lỗi đổi vai trò: ${err.message}`, 'error');
    }
  };

  const handleToggleStatus = async (userId, isSuspended) => {
    const action = isSuspended ? 'kích hoạt lại' : 'tạm khóa';
    try {
      await api.admin.toggleUserStatus(userId);
      notify(`Đã ${action} tài khoản #${userId} thành công!`);
      onReload();
    } catch (err) {
      notify(`Lỗi cập nhật trạng thái: ${err.message}`, 'error');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (createSubmitting) return;
    try {
      setCreateSubmitting(true);
      await api.admin.createUser(createData);
      notify(`Đã tạo người dùng "${createData.name}" (${createData.role}) thành công!`);
      setShowCreateModal(false);
      setCreateData({ name: '', email: '', password: '', role: 'ATTENDEE', phone: '' });
      onReload();
    } catch (err) {
      notify(`Lỗi tạo người dùng: ${err.message}`, 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser || editSubmitting) return;
    try {
      setEditSubmitting(true);
      await api.admin.updateUser(editingUser.id, editingUser);
      notify(`Đã cập nhật thông tin người dùng #${editingUser.id}`);
      setEditingUser(null);
      onReload();
    } catch (err) {
      notify(`Lỗi cập nhật: ${err.message}`, 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.admin.deleteUser(deleteTarget.id);
      notify(`Đã xóa người dùng #${deleteTarget.id} (${deleteTarget.email})`);
      setDeleteTarget(null);
      onReload();
    } catch (err) {
      notify(`Lỗi xóa người dùng: ${err.message}`, 'error');
    }
  };

  return (
    <section className="admin-table-card">
      {/* Search and Filters Toolbar */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <label htmlFor="admin-users-search" className="sr-only">Tìm theo tên, email, ID</label>
          <span className="admin-search-icon" aria-hidden="true">
            <Icon name="search" size="xs" ariaHidden />
          </span>
          <input
            id="admin-users-search"
            type="text"
            className="admin-search-input"
            placeholder="Tìm theo tên, email, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearch('')}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <Icon name="x" size="xs" ariaHidden />
            </button>
          )}
        </div>

        <div className="filter-pills flex items-center gap-xs flex-wrap">
          <span className="muted text-xs mr-xs font-semibold">Vai trò:</span>
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'ADMIN', label: 'Admin' },
            { key: 'ORGANIZER', label: 'Organizer' },
            { key: 'ATTENDEE', label: 'Attendee' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`filter-pill ${roleFilter === key ? 'active' : ''}`}
              onClick={() => setRoleFilter(key)}
            >
              {label} ({roleCounts[key] || 0})
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto flex items-center gap-1.5"
          onClick={() => setShowCreateModal(true)}
        >
          <Icon name="plus" size="xs" ariaHidden />
          <span>Thêm Người Dùng</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="table-responsive admin-table-container">
        <table className="data-table admin-modern-table" style={{ minWidth: '920px' }}>
          <thead>
            <tr>
              <th style={{ width: '70px' }}>ID</th>
              <th style={{ minWidth: '220px' }}>Người Dùng</th>
              <th style={{ minWidth: '200px' }}>Email</th>
              <th style={{ width: '130px' }}>Vai trò</th>
              <th style={{ width: '120px' }}>Trạng thái</th>
              <th style={{ width: '120px' }}>Ngày tạo</th>
              <th style={{ width: '240px' }} className="text-right">Thao tác quản trị</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center p-xl muted">
                  Không tìm thấy người dùng phù hợp.
                </td>
              </tr>
            ) : (
              paginatedUsers.map((u) => {
                const isSuspended =
                  u.is_suspended === true ||
                  u.status === 'SUSPENDED' ||
                  u.status === 'suspended';

                const isRoot = u.id === 1 || u.id === currentUser?.id;
                const roleKey = (u.role || 'ATTENDEE').toLowerCase();

                return (
                  <tr key={u.id}>
                    <td>
                      <strong className="font-mono text-xs text-muted">#{u.id}</strong>
                    </td>
                    <td>
                      <div className="flex items-center gap-sm">
                        <span className={`admin-avatar admin-avatar-${roleKey}`}>
                          {getInitials(u.name, u.email)}
                        </span>
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{u.name || 'Chưa đặt tên'}</div>
                          {u.phone && <div className="text-xs text-slate-500 font-mono">{u.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{u.email}</span>
                    </td>
                    <td>
                      <span className={`badge badge-role-${roleKey}`}>
                        {u.role || 'ATTENDEE'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isSuspended ? 'badge-status-suspended' : 'badge-status-active'}`}>
                        <span className={isSuspended ? 'mr-1 text-red-500' : 'mr-1 text-emerald-500'}>●</span>
                        {isSuspended ? 'Đã khóa' : 'Hoạt động'}
                      </span>
                    </td>
                    <td>
                      <span className="muted text-xs font-mono">{formatDate(u.created_at)}</span>
                    </td>
                    <td>
                      <div className="table-actions justify-end flex items-center gap-1.5 flex-nowrap">
                        <select
                          className="select select-compact text-xs"
                          style={{ width: '105px', padding: '0.25rem 0.5rem', height: '30px' }}
                          value={u.role || 'ATTENDEE'}
                          aria-label={`Thay đổi vai trò cho ${u.name || u.email}`}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={isRoot}
                        >
                          <option value="ATTENDEE">Attendee</option>
                          <option value="ORGANIZER">Organizer</option>
                          <option value="ADMIN">Admin</option>
                        </select>

                        {isRoot ? (
                          <span className="badge badge-subtle text-xs" title="Tài khoản Quản trị gốc">
                            Root Admin
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-xs btn-secondary"
                              onClick={() => setEditingUser(u)}
                              title="Chỉnh sửa thông tin"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className={`btn btn-xs ${isSuspended ? 'btn-success' : 'btn-warning'}`}
                              onClick={() => handleToggleStatus(u.id, isSuspended)}
                              title={isSuspended ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản'}
                            >
                              {isSuspended ? 'Mở' : 'Khóa'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => setDeleteTarget(u)}
                              title="Xóa tài khoản vĩnh viễn"
                            >
                              Xóa
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

      {/* Pagination Controls */}
      <div className="admin-pagination-bar">
        <div>
          Hiển thị <strong>{filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> – <strong>{Math.min(currentPage * pageSize, filteredUsers.length)}</strong> trên tổng số <strong>{filteredUsers.length}</strong> người dùng
        </div>
        {totalPages > 1 && (
          <div className="admin-page-controls">
            <button
              type="button"
              className="admin-page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              aria-label="Trang trước"
            >
              &larr;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
              .map((page, idx, arr) => {
                const prev = arr[idx - 1];
                return (
                  <React.Fragment key={page}>
                    {prev && page - prev > 1 && <span className="muted px-1">...</span>}
                    <button
                      type="button"
                      className={`admin-page-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}
            <button
              type="button"
              className="admin-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              aria-label="Trang sau"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { if (!createSubmitting) setShowCreateModal(false); }}
        title="Thêm Người Dùng Mới Vào Hệ Thống"
      >
        <form onSubmit={handleCreateUser} className="stack gap-sm">
          <div className="form-group mb-0">
            <label htmlFor="create-user-name" className="text-sm font-semibold required">Họ và tên</label>
            <input
              id="create-user-name"
              type="text"
              className="input"
              required
              placeholder="Nguyễn Văn A"
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              disabled={createSubmitting}
            />
          </div>

          <div className="form-group mb-0">
            <label htmlFor="create-user-email" className="text-sm font-semibold required">Email</label>
            <input
              id="create-user-email"
              type="email"
              className="input"
              required
              placeholder="email@example.com"
              value={createData.email}
              onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
              disabled={createSubmitting}
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group mb-0">
              <label htmlFor="create-user-password" className="text-sm font-semibold">Mật khẩu ban đầu</label>
              <input
                id="create-user-password"
                type="text"
                className="input"
                placeholder="Mặc định: Ticketflow@123"
                value={createData.password}
                onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
                disabled={createSubmitting}
              />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="create-user-role" className="text-sm font-semibold">Vai trò</label>
              <select
                id="create-user-role"
                className="select"
                value={createData.role}
                onChange={(e) => setCreateData({ ...createData, role: e.target.value })}
                disabled={createSubmitting}
              >
                <option value="ATTENDEE">Khách Mua Vé (Attendee)</option>
                <option value="ORGANIZER">Ban Tổ Chức (Organizer)</option>
                <option value="ADMIN">Quản Trị Viên (Admin)</option>
              </select>
            </div>
          </div>

          <div className="form-group mb-0">
            <label htmlFor="create-user-phone" className="text-sm font-semibold">Số điện thoại</label>
            <input
              id="create-user-phone"
              type="tel"
              className="input"
              placeholder="0912345678"
              value={createData.phone}
              onChange={(e) => setCreateData({ ...createData, phone: e.target.value })}
              disabled={createSubmitting}
            />
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={createSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createSubmitting}
            >
              {createSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '0.85rem', height: '0.85rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                  <span>Đang tạo người dùng...</span>
                </span>
              ) : (
                'Tạo Người Dùng'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={() => { if (!editSubmitting) setEditingUser(null); }}
        title="Chỉnh Sửa Thông Tin Người Dùng"
      >
        {editingUser && (
          <form onSubmit={handleUpdateUser} className="stack gap-sm">
            <div className="form-group mb-0">
              <label htmlFor="edit-user-name" className="text-sm font-semibold required">Họ và tên</label>
              <input
                id="edit-user-name"
                type="text"
                className="input"
                required
                value={editingUser.name || ''}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                disabled={editSubmitting}
              />
            </div>

            <div className="form-group mb-0">
              <label htmlFor="edit-user-email" className="text-sm font-semibold required">Email</label>
              <input
                id="edit-user-email"
                type="email"
                className="input"
                required
                value={editingUser.email || ''}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                disabled={editSubmitting}
              />
            </div>

            <div className="grid grid-2 gap-sm">
              <div className="form-group mb-0">
                <label htmlFor="edit-user-role" className="text-sm font-semibold">Vai trò</label>
                <select
                  id="edit-user-role"
                  className="select"
                  value={editingUser.role || 'ATTENDEE'}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  disabled={editSubmitting}
                >
                  <option value="ATTENDEE">Attendee</option>
                  <option value="ORGANIZER">Organizer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="form-group mb-0">
                <label htmlFor="edit-user-phone" className="text-sm font-semibold">Số điện thoại</label>
                <input
                  id="edit-user-phone"
                  type="tel"
                  className="input"
                  value={editingUser.phone || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  disabled={editSubmitting}
                />
              </div>
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingUser(null)}
                disabled={editSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={editSubmitting}
              >
                {editSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '0.85rem', height: '0.85rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                    <span>Đang lưu...</span>
                  </span>
                ) : (
                  'Lưu Thay Đổi'
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete User Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa tài khoản người dùng"
        message={`Bạn có chắc chắn muốn xóa tài khoản "${deleteTarget?.email}" (ID: #${deleteTarget?.id})? Thao tác này sẽ vô hiệu hóa hoàn toàn quyền truy cập của người dùng.`}
        isDanger={true}
      />
    </section>
  );
};

export default AdminUsersTab;
