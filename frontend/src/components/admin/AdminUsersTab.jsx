import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';

export const AdminUsersTab = ({ users = [], currentUser, onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [createData, setCreateData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ATTENDEE',
    phone: '',
  });

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
    try {
      await api.admin.createUser(createData);
      notify(`Đã tạo người dùng "${createData.name}" (${createData.role}) thành công!`);
      setShowCreateModal(false);
      setCreateData({ name: '', email: '', password: '', role: 'ATTENDEE', phone: '' });
      onReload();
    } catch (err) {
      notify(`Lỗi tạo người dùng: ${err.message}`, 'error');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await api.admin.updateUser(editingUser.id, editingUser);
      notify(`Đã cập nhật thông tin người dùng #${editingUser.id}`);
      setEditingUser(null);
      onReload();
    } catch (err) {
      notify(`Lỗi cập nhật: ${err.message}`, 'error');
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
    <section className="card">
      {/* Search and Filters Toolbar */}
      <div className="toolbar flex flex-wrap justify-between items-center gap-2 mb-md pb-sm border-b">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="input input-sm"
            style={{ width: '280px' }}
            placeholder="Tìm theo tên, email, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills flex items-center gap-xs">
          <span className="muted text-xs mr-xs">Vai trò:</span>
          {['ALL', 'ADMIN', 'ORGANIZER', 'ATTENDEE'].map((role) => (
            <button
              key={role}
              type="button"
              className={`filter-pill ${roleFilter === role ? 'active' : ''}`}
              onClick={() => setRoleFilter(role)}
            >
              {role === 'ALL' ? 'Tất cả' : role}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto"
          onClick={() => setShowCreateModal(true)}
        >
          + Thêm Người Dùng
        </button>
      </div>

      {/* Users Table */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Họ và Tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th className="text-right">Thao tác</th>
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
              filteredUsers.map((u) => {
                const isSuspended =
                  u.is_suspended === true ||
                  u.status === 'SUSPENDED' ||
                  u.status === 'suspended';

                const isRoot = u.id === 1 || u.id === currentUser?.id;

                return (
                  <tr key={u.id}>
                    <td>
                      <strong>#{u.id}</strong>
                    </td>
                    <td>
                      <div className="font-semibold">{u.name || 'Chưa đặt tên'}</div>
                      {u.phone && <div className="text-xs muted">{u.phone}</div>}
                    </td>
                    <td className="muted font-mono text-xs">{u.email}</td>
                    <td>
                      <span className={`badge badge-role-${(u.role || 'ATTENDEE').toLowerCase()}`}>
                        {u.role || 'ATTENDEE'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isSuspended ? 'badge-status-suspended' : 'badge-status-active'}`}>
                        {isSuspended ? 'Đã khóa' : 'Hoạt động'}
                      </span>
                    </td>
                    <td className="muted text-xs">{formatDate(u.created_at)}</td>
                    <td>
                      <div className="table-actions justify-end flex items-center gap-xs">
                        <select
                          className="select select-compact"
                          style={{ width: '110px' }}
                          value={u.role || 'ATTENDEE'}
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
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className={`btn btn-xs ${isSuspended ? 'btn-success' : 'btn-warning'}`}
                              onClick={() => handleToggleStatus(u.id, isSuspended)}
                            >
                              {isSuspended ? 'Mở' : 'Khóa'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => setDeleteTarget(u)}
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

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Thêm Người Dùng Mới Vào Hệ Thống"
      >
        <form onSubmit={handleCreateUser} className="stack gap-sm">
          <div className="form-group mb-0">
            <label className="text-sm font-semibold required">Họ và tên</label>
            <input
              type="text"
              className="input"
              required
              placeholder="Nguyễn Văn A"
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
            />
          </div>

          <div className="form-group mb-0">
            <label className="text-sm font-semibold required">Email</label>
            <input
              type="email"
              className="input"
              required
              placeholder="email@example.com"
              value={createData.email}
              onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group mb-0">
              <label className="text-sm font-semibold">Mật khẩu ban đầu</label>
              <input
                type="text"
                className="input"
                placeholder="Mặc định: Ticketflow@123"
                value={createData.password}
                onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
              />
            </div>
            <div className="form-group mb-0">
              <label className="text-sm font-semibold">Vai trò</label>
              <select
                className="select"
                value={createData.role}
                onChange={(e) => setCreateData({ ...createData, role: e.target.value })}
              >
                <option value="ATTENDEE">Khách Mua Vé (Attendee)</option>
                <option value="ORGANIZER">Ban Tổ Chức (Organizer)</option>
                <option value="ADMIN">Quản Trị Viên (Admin)</option>
              </select>
            </div>
          </div>

          <div className="form-group mb-0">
            <label className="text-sm font-semibold">Số điện thoại</label>
            <input
              type="tel"
              className="input"
              placeholder="0912345678"
              value={createData.phone}
              onChange={(e) => setCreateData({ ...createData, phone: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Tạo Người Dùng
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title="Chỉnh Sửa Thông Tin Người Dùng"
      >
        {editingUser && (
          <form onSubmit={handleUpdateUser} className="stack gap-sm">
            <div className="form-group mb-0">
              <label className="text-sm font-semibold required">Họ và tên</label>
              <input
                type="text"
                className="input"
                required
                value={editingUser.name || ''}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
              />
            </div>

            <div className="form-group mb-0">
              <label className="text-sm font-semibold required">Email</label>
              <input
                type="email"
                className="input"
                required
                value={editingUser.email || ''}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
              />
            </div>

            <div className="grid grid-2 gap-sm">
              <div className="form-group mb-0">
                <label className="text-sm font-semibold">Vai trò</label>
                <select
                  className="select"
                  value={editingUser.role || 'ATTENDEE'}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                >
                  <option value="ATTENDEE">Attendee</option>
                  <option value="ORGANIZER">Organizer</option>
                  <option value="ADMIN">Admin</option>
                </select>
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
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Lưu Thay Đổi
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
