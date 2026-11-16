import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';

export const AdminAnnouncementsTab = ({ announcements = [], onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    try {
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
    <section className="card">
      {/* Header */}
      <div className="panel-header flex flex-wrap justify-between items-center gap-md pb-md border-b mb-md">
        <div>
          <h2 className="panel-title m-0">Quản Lý Thông Báo Toàn Sàn</h2>
          <p className="muted text-sm mt-xs">
            Phát thông báo tức thời đến tất cả người dùng, ban tổ chức hoặc người tham dự.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreateModal(true)}
        >
          + Tạo Thông Báo Mới
        </button>
      </div>

      {/* Search and Filters */}
      <div className="toolbar flex flex-wrap justify-between items-center gap-2 mb-md">
        <div className="search-input-wrapper flex-1">
          <input
            type="text"
            className="input input-sm"
            placeholder="Tìm theo tiêu đề hoặc nội dung thông báo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            className="select select-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Tất cả loại thông báo</option>
            <option value="GENERAL">Thông báo chung</option>
            <option value="MAINTENANCE">Bảo trì hệ thống</option>
            <option value="POLICY">Cập nhật chính sách</option>
            <option value="PROMO">Sự kiện & Ưu đãi</option>
          </select>
          <select
            className="select select-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">Tất cả đối tượng</option>
            <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
            <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
          </select>
        </div>
      </div>

      {/* Announcements Table */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Phân loại</th>
              <th>Tiêu đề & Nội dung</th>
              <th>Đối tượng nhận</th>
              <th>Thời gian gửi</th>
              <th className="text-right">Thao tác</th>
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
              filteredAnnouncements.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>#{a.id}</strong>
                  </td>
                  <td>
                    <span className="badge badge-info">{a.type || 'GENERAL'}</span>
                  </td>
                  <td>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs muted" style={{ maxWidth: '400px' }}>
                      {a.message}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-secondary">{a.target_role || 'ALL'}</span>
                  </td>
                  <td className="muted text-xs">{formatDate(a.created_at)}</td>
                  <td>
                    <div className="table-actions justify-end">
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        onClick={() => setDeleteTarget(a)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Announcement Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Tạo Thông Báo Phát Sóng Toàn Sàn"
      >
        <form onSubmit={handleCreate} className="stack gap-sm">
          <div className="form-group mb-0">
            <label className="text-sm font-semibold required">Tiêu đề thông báo</label>
            <input
              type="text"
              className="input"
              required
              placeholder="VD: Thông báo bảo trì nâng cấp hệ thống định kỳ"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="form-group mb-0">
            <label className="text-sm font-semibold required">Nội dung chi tiết</label>
            <textarea
              className="input textarea"
              rows="4"
              required
              placeholder="Nhập nội dung đầy đủ thông điệp muốn truyền đạt đến người dùng..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group mb-0">
              <label className="text-sm font-semibold">Phân loại</label>
              <select
                className="select"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="GENERAL">Thông báo chung</option>
                <option value="MAINTENANCE">Bảo trì hệ thống</option>
                <option value="POLICY">Cập nhật chính sách</option>
                <option value="PROMO">Sự kiện & Khuyến mãi</option>
              </select>
            </div>

            <div className="form-group mb-0">
              <label className="text-sm font-semibold">Đối tượng tiếp nhận</label>
              <select
                className="select"
                value={formData.target_role}
                onChange={(e) => setFormData({ ...formData, target_role: e.target.value })}
              >
                <option value="ALL">Toàn bộ người dùng</option>
                <option value="ORGANIZER">Chỉ Ban Tổ Chức</option>
                <option value="ATTENDEE">Chỉ Khách Mua Vé</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Phát Sóng Thông Báo
            </button>
          </div>
        </form>
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
