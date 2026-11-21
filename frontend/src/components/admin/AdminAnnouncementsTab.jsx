import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Icon } from '../ui/Icon';

export const AdminAnnouncementsTab = ({ announcements = [], onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'GENERAL',
    target_role: 'ALL',
    priority: 'NORMAL',
  });

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (a.title || '').toLowerCase().includes(q) ||
        (a.message || '').toLowerCase().includes(q);

      const matchesType = typeFilter === 'ALL' || a.type === typeFilter;
      const matchesRole = roleFilter === 'ALL' || (a.target_role || 'ALL') === roleFilter;

      return matchesSearch && matchesType && matchesRole;
    });
  }, [announcements, search, typeFilter, roleFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      await api.admin.createAnnouncement(formData);
      notify(`Đã phát thông báo "${formData.title}" thành công!`);
      setShowCreateModal(false);
      setFormData({
        title: '',
        message: '',
        type: 'GENERAL',
        target_role: 'ALL',
        priority: 'NORMAL',
      });
      onReload();
    } catch (err) {
      notify(`Lỗi phát thông báo: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (announcement) => {
    setEditingAnnouncement({
      id: announcement.id,
      title: announcement.title || '',
      message: announcement.message || '',
      type: announcement.type || 'GENERAL',
      target_role: announcement.target_role || 'ALL',
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingAnnouncement || submitting) return;
    try {
      setSubmitting(true);
      await api.admin.updateAnnouncement(editingAnnouncement.id, editingAnnouncement);
      notify(`Đã cập nhật thông báo #${editingAnnouncement.id} thành công!`);
      setEditingAnnouncement(null);
      onReload();
    } catch (err) {
      notify(`Lỗi cập nhật thông báo: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.admin.deleteAnnouncement(deleteTarget.id);
      notify(`Đã xóa thông báo #${deleteTarget.id}`);
      setDeleteTarget(null);
      onReload();
    } catch (err) {
      notify(`Lỗi xóa thông báo: ${err.message}`, 'error');
    }
  };

  return (
    <section className="admin-table-card">
      {/* Header Toolbar */}
      <div className="admin-toolbar flex justify-between items-center flex-wrap gap-md">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
            <Icon name="bell" size="sm" ariaHidden className="text-primary" />
            <span>Quản Lý Thông Báo Toàn Sàn</span>
          </h2>
          <p className="muted text-xs mt-1 mb-0">
            Phát thông báo tức thời đến tất cả người dùng, ban tổ chức hoặc người tham dự.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm flex items-center gap-1.5"
          onClick={() => setShowCreateModal(true)}
        >
          <Icon name="plus" size="xs" ariaHidden />
          <span>Tạo Thông Báo Mới</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="admin-toolbar" style={{ borderTop: 'none' }}>
        <div className="admin-toolbar-left">
          <div className="admin-search-wrapper" style={{ maxWidth: '340px' }}>
            <label htmlFor="admin-announcements-search" className="sr-only">Tìm theo tiêu đề hoặc nội dung thông báo</label>
            <span className="admin-search-icon" aria-hidden="true">
              <Icon name="search" size="xs" ariaHidden />
            </span>
            <input
              id="admin-announcements-search"
              type="text"
              className="admin-search-input"
              placeholder="Tìm theo tiêu đề hoặc nội dung thông báo..."
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

          <div className="flex gap-2 flex-wrap items-center">
            <label htmlFor="admin-announcements-type-filter" className="sr-only">Lọc theo loại thông báo</label>
            <select
              id="admin-announcements-type-filter"
              className="select select-compact text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">Tất cả loại thông báo</option>
              <option value="GENERAL">Thông báo chung</option>
              <option value="MAINTENANCE">Bảo trì hệ thống</option>
              <option value="POLICY">Cập nhật chính sách</option>
              <option value="PROMO">Sự kiện & Ưu đãi</option>
            </select>
            <label htmlFor="admin-announcements-role-filter" className="sr-only">Lọc theo đối tượng nhận</label>
            <select
              id="admin-announcements-role-filter"
              className="select select-compact text-xs"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">Tất cả đối tượng</option>
              <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
              <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
            </select>
          </div>
        </div>
      </div>

      {/* Announcements Table */}
      <div className="table-responsive admin-table-container">
        <table className="data-table admin-modern-table" style={{ width: '100%', minWidth: '700px' }}>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Mã</th>
              <th style={{ width: '105px' }}>Phân loại</th>
              <th style={{ minWidth: '240px' }}>Tiêu đề & Nội dung</th>
              <th style={{ width: '110px' }}>Đối tượng nhận</th>
              <th style={{ width: '100px' }}>Thời gian gửi</th>
              <th style={{ width: '80px' }} className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredAnnouncements.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center p-xl muted">
                  Chưa có thông báo nào phù hợp.
                </td>
              </tr>
            ) : (
              filteredAnnouncements.map((a) => {
                const typeStyle =
                  a.type === 'POLICY'
                    ? 'badge-info'
                    : a.type === 'MAINTENANCE'
                    ? 'badge-warning'
                    : a.type === 'PROMO'
                    ? 'badge-purple'
                    : 'badge-teal';

                return (
                  <tr key={a.id}>
                    <td>
                      <strong className="font-mono text-xs text-muted">#{a.id}</strong>
                    </td>
                    <td>
                      <span className={`badge ${typeStyle} text-xs`}>{a.type || 'GENERAL'}</span>
                    </td>
                    <td>
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{a.title}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2" style={{ maxWidth: '500px' }}>
                        {a.message}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-secondary text-xs">{a.target_role || 'ALL'}</span>
                    </td>
                    <td>
                      <span className="muted text-xs font-mono">{formatDate(a.created_at)}</span>
                    </td>
                    <td className="text-right">
                      <div className="table-actions justify-end">
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary btn-table-action"
                          onClick={() => handleEdit(a)}
                          title="Chỉnh sửa thông báo"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger btn-table-action"
                          onClick={() => setDeleteTarget(a)}
                          title="Xóa thông báo"
                        >
                          Xóa
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

      {/* Create Announcement Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { if (!submitting) setShowCreateModal(false); }}
        title="Tạo Thông Báo Phát Sóng Toàn Sàn"
      >
        <form onSubmit={handleCreate} className="stack gap-sm">
          <div className="form-group mb-0">
            <label htmlFor="announcement-title" className="text-sm font-semibold required">Tiêu đề thông báo</label>
            <input
              id="announcement-title"
              type="text"
              className="input"
              required
              placeholder="VD: Thông báo bảo trì nâng cấp hệ thống định kỳ"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="form-group mb-0">
            <label htmlFor="announcement-message" className="text-sm font-semibold required">Nội dung chi tiết</label>
            <textarea
              id="announcement-message"
              className="input textarea"
              rows="4"
              required
              placeholder="Nhập nội dung đầy đủ thông điệp muốn truyền đạt đến người dùng..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group mb-0">
              <label htmlFor="announcement-type" className="text-sm font-semibold">Phân loại</label>
              <select
                id="announcement-type"
                className="select"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                disabled={submitting}
              >
                <option value="GENERAL">Thông báo chung</option>
                <option value="MAINTENANCE">Bảo trì hệ thống</option>
                <option value="POLICY">Cập nhật chính sách</option>
                <option value="PROMO">Sự kiện & Khuyến mãi</option>
              </select>
            </div>

            <div className="form-group mb-0">
              <label htmlFor="announcement-target-role" className="text-sm font-semibold">Đối tượng tiếp nhận</label>
              <select
                id="announcement-target-role"
                className="select"
                value={formData.target_role}
                onChange={(e) => setFormData({ ...formData, target_role: e.target.value })}
                disabled={submitting}
              >
                <option value="ALL">Toàn bộ người dùng</option>
                <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
                <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '0.85rem', height: '0.85rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                  <span>Đang phát sóng thông báo...</span>
                </span>
              ) : (
                'Phát Sóng Thông Báo'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Announcement Modal */}
      <Modal
        isOpen={Boolean(editingAnnouncement)}
        onClose={() => { if (!submitting) setEditingAnnouncement(null); }}
        title="Chỉnh Sửa Thông Báo Toàn Sàn"
      >
        {editingAnnouncement && (
          <form onSubmit={handleUpdate} className="stack gap-sm">
            <div className="form-group mb-0">
              <label htmlFor="edit-announcement-title" className="text-sm font-semibold required">Tiêu đề thông báo</label>
              <input
                id="edit-announcement-title"
                type="text"
                className="input"
                required
                placeholder="VD: Thông báo bảo trì nâng cấp hệ thống định kỳ"
                value={editingAnnouncement.title}
                onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                disabled={submitting}
              />
            </div>

            <div className="form-group mb-0">
              <label htmlFor="edit-announcement-message" className="text-sm font-semibold required">Nội dung chi tiết</label>
              <textarea
                id="edit-announcement-message"
                className="input textarea"
                rows="4"
                required
                placeholder="Nhập nội dung đầy đủ thông điệp muốn truyền đạt đến người dùng..."
                value={editingAnnouncement.message}
                onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, message: e.target.value })}
                disabled={submitting}
              />
            </div>

            <div className="grid grid-2 gap-sm">
              <div className="form-group mb-0">
                <label htmlFor="edit-announcement-type" className="text-sm font-semibold">Phân loại</label>
                <select
                  id="edit-announcement-type"
                  className="select"
                  value={editingAnnouncement.type}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, type: e.target.value })}
                  disabled={submitting}
                >
                  <option value="GENERAL">Thông báo chung</option>
                  <option value="MAINTENANCE">Bảo trì hệ thống</option>
                  <option value="POLICY">Cập nhật chính sách</option>
                  <option value="PROMO">Sự kiện & Khuyến mãi</option>
                </select>
              </div>

              <div className="form-group mb-0">
                <label htmlFor="edit-announcement-target-role" className="text-sm font-semibold">Đối tượng tiếp nhận</label>
                <select
                  id="edit-announcement-target-role"
                  className="select"
                  value={editingAnnouncement.target_role}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, target_role: e.target.value })}
                  disabled={submitting}
                >
                  <option value="ALL">Toàn bộ người dùng</option>
                  <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
                  <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingAnnouncement(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa thông báo"
        message={`Bạn có chắc chắn muốn xóa thông báo "${deleteTarget?.title}"?`}
        isDanger={true}
      />
    </section>
  );
};

export default AdminAnnouncementsTab;
