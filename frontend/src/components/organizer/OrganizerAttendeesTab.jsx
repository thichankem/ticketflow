import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { ReportModal } from '../common/ReportModal';
import { Icon } from '../ui/Icon';

export const OrganizerAttendeesTab = ({ selectedEventId, events = [], onSelectEvent, notify, hideEventSelector = false }) => {
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
  const [reportTargetAttendee, setReportTargetAttendee] = useState(null);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

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
    if (!selectedEventId || guestSubmitting) return;
    try {
      setGuestSubmitting(true);
      await api.events.createAttendee(selectedEventId, guestFormData);
      notify(`Đã cấp vé mời cho ${guestFormData.name || guestFormData.email} thành công!`);
      setShowGuestModal(false);
      setGuestFormData({ name: '', email: '', phone: '', ticket_tier_id: '' });
      loadData(selectedEventId);
    } catch (err) {
      notify(`Lỗi tạo vé mời: ${err.message}`, 'error');
    } finally {
      setGuestSubmitting(false);
    }
  };

  const handleUpdateAttendee = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !editingAttendee || editSubmitting) return;
    try {
      setEditSubmitting(true);
      await api.events.updateAttendee(selectedEventId, editingAttendee.id, editingAttendee);
      notify(`Đã cập nhật thông tin người tham dự #${editingAttendee.id}!`);
      setEditingAttendee(null);
      loadData(selectedEventId);
    } catch (err) {
      notify(`Lỗi cập nhật: ${err.message}`, 'error');
    } finally {
      setEditSubmitting(false);
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
        {!hideEventSelector && events.length > 0 ? (
          <div className="flex items-center gap-sm flex-1" style={{ minWidth: '280px' }}>
            <label htmlFor="attEvSelect" className="font-bold whitespace-nowrap">
              Chọn sự kiện:
            </label>
            <select
              id="attEvSelect"
              className="select max-w-400"
              value={selectedEventId || ''}
              onChange={(e) => onSelectEvent && onSelectEvent(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  #{ev.id} - {ev.title} ({ev.status})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <h3 className="text-base font-semibold m-0">Danh sách người tham dự & Khách mời</h3>
            <p className="muted text-xs m-0">Tra cứu người tham dự, trạng thái vé và cấp vé mời VIP</p>
          </div>
        )}

        <div className="flex items-center gap-sm">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={handleExportCsv}
            disabled={attendees.length === 0}
          >
            <Icon name="download" size="xs" ariaHidden />
            <span>Xuất CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => setShowGuestModal(true)}
          >
            <Icon name="plus" size="xs" ariaHidden />
            <span>Cấp Vé Mời (Guest Pass)</span>
          </button>
        </div>
      </div>

      {/* Attendees Table Section */}
      <section className="card">
        <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
          <div>
            <h2 className="panel-title mb-0">Danh Sách Người Tham Dự ({attendees.length})</h2>
            <p className="muted text-xs m-0">Tra cứu người tham dự, mã vé và trạng thái vé</p>
          </div>

          <div className="flex items-center gap-sm">
            <label htmlFor="att-search-input" className="sr-only">Tìm theo tên, email, barcode</label>
            <input
              id="att-search-input"
              type="text"
              className="input input-sm"
              style={{ width: '220px' }}
              placeholder="Tìm theo tên, email, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label htmlFor="att-status-filter" className="sr-only">Lọc theo trạng thái</label>
            <select
              id="att-status-filter"
              className="select select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hợp lệ (ACTIVE)</option>
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
                          <button
                            type="button"
                            className="btn btn-xs btn-outline"
                            onClick={() => setReportTargetAttendee(a)}
                            title="Báo cáo người tham dự vi phạm lên Ban Quản Trị"
                          >
                            Báo cáo
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
        onClose={() => { if (!guestSubmitting) setShowGuestModal(false); }}
        title="Cấp Vé Mời Khách VIP (Guest Pass)"
      >
        <form onSubmit={handleCreateGuest} className="stack">
          <div className="form-group">
            <label htmlFor="guest-name-input" className="form-label required">Họ và tên khách mời</label>
            <input
              id="guest-name-input"
              type="text"
              className="input"
              value={guestFormData.name}
              onChange={(e) => setGuestFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="VD: Nguyễn Văn A"
              required
              disabled={guestSubmitting}
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label htmlFor="guest-email-input" className="form-label required">Email</label>
              <input
                id="guest-email-input"
                type="email"
                className="input"
                value={guestFormData.email}
                onChange={(e) => setGuestFormData((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                required
                disabled={guestSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="guest-phone-input" className="form-label">Số điện thoại</label>
              <input
                id="guest-phone-input"
                type="tel"
                className="input"
                value={guestFormData.phone}
                onChange={(e) => setGuestFormData((p) => ({ ...p, phone: e.target.value }))}
                placeholder="0912345678"
                disabled={guestSubmitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="guest-tier-select" className="form-label">Hạng vé cấp</label>
            <select
              id="guest-tier-select"
              className="select"
              value={guestFormData.ticket_tier_id}
              onChange={(e) => setGuestFormData((p) => ({ ...p, ticket_tier_id: e.target.value }))}
              disabled={guestSubmitting}
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowGuestModal(false)}
              disabled={guestSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={guestSubmitting || loading}
            >
              {guestSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '0.85rem', height: '0.85rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                  <span>Đang phát hành vé mời...</span>
                </span>
              ) : (
                'Phát Hành Vé Mời'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Attendee Modal */}
      <Modal
        isOpen={Boolean(editingAttendee)}
        onClose={() => { if (!editSubmitting) setEditingAttendee(null); }}
        title="Chỉnh Sửa Thông Tin Người Tham Dự"
      >
        {editingAttendee && (
          <form onSubmit={handleUpdateAttendee} className="stack">
            <div className="form-group">
              <label htmlFor="edit-att-name" className="form-label required">Họ và tên</label>
              <input
                id="edit-att-name"
                type="text"
                className="input"
                placeholder="VD: Nguyễn Văn A"
                value={editingAttendee.name || `${editingAttendee.first_name || ''} ${editingAttendee.last_name || ''}`.trim()}
                onChange={(e) => setEditingAttendee((p) => ({ ...p, name: e.target.value }))}
                required
                disabled={editSubmitting}
              />
            </div>

            <div className="grid grid-2 gap-sm">
              <div className="form-group">
                <label htmlFor="edit-att-email" className="form-label required">Email</label>
                <input
                  id="edit-att-email"
                  type="email"
                  className="input"
                  placeholder="email@example.com"
                  value={editingAttendee.email || ''}
                  onChange={(e) => setEditingAttendee((p) => ({ ...p, email: e.target.value }))}
                  required
                  disabled={editSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-att-phone" className="form-label">Số điện thoại</label>
                <input
                  id="edit-att-phone"
                  type="tel"
                  className="input"
                  placeholder="0912345678"
                  value={editingAttendee.phone || ''}
                  onChange={(e) => setEditingAttendee((p) => ({ ...p, phone: e.target.value }))}
                  disabled={editSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="edit-att-status" className="form-label">Trạng thái vé</label>
              <select
                id="edit-att-status"
                className="select"
                value={editingAttendee.status || 'ACTIVE'}
                onChange={(e) => setEditingAttendee((p) => ({ ...p, status: e.target.value }))}
                disabled={editSubmitting}
              >
                <option value="ACTIVE">Hợp lệ (ACTIVE)</option>
                <option value="CANCELLED">Hủy hiệu lực</option>
              </select>
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingAttendee(null)}
                disabled={editSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={editSubmitting || loading}
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

      {/* Cancel Attendee Ticket Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận hủy vé người tham dự"
        message={`Bạn có chắc chắn muốn hủy vé của "${deleteTarget?.name || deleteTarget?.email}"? Mã vé này sẽ bị vô hiệu hóa.`}
        isDanger={true}
      />

      {/* Report Attendee Modal */}
      {reportTargetAttendee && (
        <ReportModal
          isOpen={Boolean(reportTargetAttendee)}
          onClose={() => setReportTargetAttendee(null)}
          targetType="ATTENDEE"
          targetId={reportTargetAttendee.id}
          targetTitle={`${reportTargetAttendee.name || `${reportTargetAttendee.first_name || ''} ${reportTargetAttendee.last_name || ''}`.trim()} (${reportTargetAttendee.email || ''})`}
          onSuccess={() => notify?.(`Đã gửi báo cáo người tham dự #${reportTargetAttendee.id} lên Admin!`)}
        />
      )}
    </div>
  );
};

export default OrganizerAttendeesTab;
