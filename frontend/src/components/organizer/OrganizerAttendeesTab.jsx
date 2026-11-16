import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';

export const OrganizerAttendeesTab = ({ selectedEventId, events = [], onSelectEvent, notify }) => {
  const { t } = useLanguage();
  const [attendees, setAttendees] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [guestFormData, setGuestFormData] = useState({
    name: '',
    email: '',
    phone: '',
    ticket_tier_id: '',
  });

  const loadData = async (eventId) => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [attRes, tierRes] = await Promise.all([
        api.events.getAttendees(eventId),
        api.events.getTiers(eventId),
      ]);
      setAttendees(Array.isArray(attRes) ? attRes : attRes?.attendees || []);
      setTiers(Array.isArray(tierRes) ? tierRes : tierRes?.tiers || []);
    } catch (err) {
      console.warn('Could not load attendees:', err.message);
      setAttendees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadData(selectedEventId);
    }
  }, [selectedEventId]);

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      const q = search.toLowerCase();
      const name = `${a.first_name || ''} ${a.last_name || ''} ${a.name || ''}`.toLowerCase();
      const email = (a.email || '').toLowerCase();
      const barcode = (a.barcode || a.ticket_code || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || email.includes(q) || barcode.includes(q);

      const matchesStatus =
        statusFilter === 'ALL' ||
        (a.status || 'ACTIVE').toUpperCase() === statusFilter.toUpperCase();

      return matchesSearch && matchesStatus;
    });
  }, [attendees, search, statusFilter]);

  const handleCreateGuest = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      await api.events.createAttendee(selectedEventId, guestFormData);
      notify(`Đã cấp vé mời cho ${guestFormData.name || guestFormData.email} thành công!`);
      setShowGuestModal(false);
      setGuestFormData({ name: '', email: '', phone: '', ticket_tier_id: '' });
      loadData(selectedEventId);
    } catch (err) {
      notify(`Lỗi tạo vé mời: ${err.message}`, 'error');
    }
  };

  const handleUpdateAttendee = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !editingAttendee) return;
    try {
      await api.events.updateAttendee(selectedEventId, editingAttendee.id, editingAttendee);
      notify(`Đã cập nhật thông tin người tham dự #${editingAttendee.id}!`);
      setEditingAttendee(null);
      loadData(selectedEventId);
    } catch (err) {
      notify(`Lỗi cập nhật: ${err.message}`, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selectedEventId) return;
    try {
      await api.events.deleteAttendee(selectedEventId, deleteTarget.id);
      notify(`Đã hủy vé của khách "${deleteTarget.name || deleteTarget.email}" thành công.`);
      setAttendees((prev) =>
        prev.map((a) => (a.id === deleteTarget.id ? { ...a, status: 'CANCELLED' } : a))
      );
      setDeleteTarget(null);
    } catch (err) {
      notify(`Lỗi hủy vé: ${err.message}`, 'error');
    }
  };

  const handleExportCsv = async () => {
    if (!selectedEventId) return;
    try {
      await api.events.exportAttendees(selectedEventId);
      notify('Đang tải về tệp danh sách người tham dự (.csv)...');
    } catch (err) {
      notify(`Lỗi xuất CSV: ${err.message}`, 'error');
    }
  };

  return (
    <div className="stack">
      {/* Event Selector & Actions Toolbar */}
      <div className="card toolbar flex items-center justify-between flex-wrap gap-sm">
        <div className="flex items-center gap-sm flex-1" style={{ minWidth: '280px' }}>
          <label htmlFor="attEvSelect" className="font-bold whitespace-nowrap">
            Chọn sự kiện:
          </label>
          <select
            id="attEvSelect"
            className="select max-w-400"
            value={selectedEventId || ''}
            onChange={(e) => onSelectEvent(e.target.value)}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                #{ev.id} - {ev.title} ({ev.status})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-sm">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={attendees.length === 0}
          >
            📥 Xuất CSV
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowGuestModal(true)}
          >
            + Cấp Vé Mời (Guest Pass)
          </button>
        </div>
      </div>

      {/* Attendees Table Section */}
      <section className="card">
        <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
          <div>
            <h2 className="panel-title mb-0">Danh Sách Người Tham Dự ({attendees.length})</h2>
            <p className="muted text-xs m-0">Tra cứu người tham dự, mã vé check-in và trạng thái vé</p>
          </div>

          <div className="flex items-center gap-sm">
            <input
              type="text"
              className="input input-sm"
              style={{ width: '220px' }}
              placeholder="Tìm theo tên, email, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hợp lệ (ACTIVE)</option>
              <option value="CHECKED_IN">Đã check-in</option>
              <option value="TRANSFERRED">Đã chuyển nhượng</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state p-lg text-center text-muted">Đang tải danh sách người tham dự...</div>
        ) : filteredAttendees.length === 0 ? (
          <div className="empty-state p-xl text-center">
            <p className="muted mb-sm">Không tìm thấy người tham dự nào phù hợp với bộ lọc.</p>
            {attendees.length === 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowGuestModal(true)}
              >
                + Cấp Vé Mời Đầu Tiên
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Vé</th>
                  <th>Họ và Tên</th>
                  <th>Email & SĐT</th>
                  <th>Hạng vé</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.map((a) => {
                  const displayName = a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Chưa đặt tên';
                  const tierName = a.ticket_tier_name || a.tier_name || a.tier_title || 'Tiêu chuẩn';
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong className="badge badge-secondary font-mono text-xs">
                          {a.barcode || a.ticket_code || `#${a.id}`}
                        </strong>
                      </td>
                      <td>
                        <strong>{displayName}</strong>
                        {a.is_guest && <span className="badge badge-primary text-xs ml-xs">Khách mời</span>}
                      </td>
                      <td>
                        <div>{a.email || '—'}</div>
                        {a.phone && <div className="text-xs muted">{a.phone}</div>}
                      </td>
                      <td>{tierName}</td>
                      <td>
                        <StatusBadge status={a.status || 'ACTIVE'} />
                      </td>
                      <td>
                        <div className="table-actions justify-end">
                          <button
                            type="button"
                            className="btn btn-xs btn-secondary"
                            onClick={() => setEditingAttendee(a)}
                          >
                            Sửa
                          </button>
                          {a.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => setDeleteTarget(a)}
                            >
                              Hủy vé
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Guest Pass Modal */}
      <Modal
        isOpen={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        title="Cấp Vé Mời Khách VIP (Guest Pass)"
      >
        <form onSubmit={handleCreateGuest} className="stack">
          <div className="form-group">
            <label className="form-label required">Họ và tên khách mời</label>
            <input
              type="text"
              className="input"
              value={guestFormData.name}
              onChange={(e) => setGuestFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="VD: Nguyễn Văn A"
              required
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label className="form-label required">Email</label>
              <input
                type="email"
                className="input"
                value={guestFormData.email}
                onChange={(e) => setGuestFormData((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Số điện thoại</label>
              <input
                type="tel"
                className="input"
                value={guestFormData.phone}
                onChange={(e) => setGuestFormData((p) => ({ ...p, phone: e.target.value }))}
                placeholder="0912345678"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Hạng vé cấp</label>
            <select
              className="select"
              value={guestFormData.ticket_tier_id}
              onChange={(e) => setGuestFormData((p) => ({ ...p, ticket_tier_id: e.target.value }))}
            >
              <option value="">-- Mặc định (Hạng vé đầu tiên) --</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button type="button" className="btn btn-secondary" onClick={() => setShowGuestModal(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Phát Hành Vé Mời
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Attendee Modal */}
      <Modal
        isOpen={Boolean(editingAttendee)}
        onClose={() => setEditingAttendee(null)}
        title="Chỉnh Sửa Thông Tin Người Tham Dự"
      >
        {editingAttendee && (
          <form onSubmit={handleUpdateAttendee} className="stack">
            <div className="form-group">
              <label className="form-label required">Họ và tên</label>
              <input
                type="text"
                className="input"
                value={editingAttendee.name || `${editingAttendee.first_name || ''} ${editingAttendee.last_name || ''}`.trim()}
                onChange={(e) => setEditingAttendee((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-2 gap-sm">
              <div className="form-group">
                <label className="form-label required">Email</label>
                <input
                  type="email"
                  className="input"
                  value={editingAttendee.email || ''}
                  onChange={(e) => setEditingAttendee((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Số điện thoại</label>
                <input
                  type="tel"
                  className="input"
                  value={editingAttendee.phone || ''}
                  onChange={(e) => setEditingAttendee((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Trạng thái vé</label>
              <select
                className="select"
                value={editingAttendee.status || 'ACTIVE'}
                onChange={(e) => setEditingAttendee((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="ACTIVE">Hợp lệ (ACTIVE)</option>
                <option value="CHECKED_IN">Đã Check-in</option>
                <option value="CANCELLED">Hủy hiệu lực</option>
              </select>
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingAttendee(null)}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Lưu Thay Đổi
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Cancel Attendee Ticket Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận hủy vé người tham dự"
        message={`Bạn có chắc chắn muốn hủy vé của "${deleteTarget?.name || deleteTarget?.email}"? Mã vé này sẽ bị vô hiệu hóa và không thể check-in tại sự kiện.`}
        isDanger={true}
      />
    </div>
  );
};

export default OrganizerAttendeesTab;
