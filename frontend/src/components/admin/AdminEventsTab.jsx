import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmModal } from '../common/ConfirmModal';

export const AdminEventsTab = ({ events = [], onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [massRefundTarget, setMassRefundTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [processing, setProcessing] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.organizer_name || '').toLowerCase().includes(q) ||
        String(ev.id).includes(q);

      const statusKey = (ev.status || 'DRAFT').toUpperCase();
      const matchesStatus = statusFilter === 'ALL' || statusKey === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [events, search, statusFilter]);

  const handleStatusChange = async (eventId, newStatus) => {
    try {
      await api.admin.updateEventStatus(eventId, newStatus);
      notify(`Đã cập nhật trạng thái sự kiện #${eventId} thành ${newStatus}`);
      onReload();
    } catch (err) {
      notify(`Lỗi cập nhật trạng thái sự kiện: ${err.message}`, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setProcessing(true);
    try {
      await api.admin.deleteEvent(deleteTarget.id);
      notify(`Đã xóa sự kiện #${deleteTarget.id} ("${deleteTarget.title}") thành công!`);
      setDeleteTarget(null);
      onReload();
    } catch (err) {
      notify(`Lỗi xóa sự kiện: ${err.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const confirmMassRefund = async () => {
    if (!massRefundTarget) return;
    setProcessing(true);
    try {
      const res = await api.post(`/api/admin/events/${massRefundTarget.id}/mass-refund`, {});
      notify(
        res?.message || `Đã kích hoạt hoàn tiền hàng loạt 100% cho sự kiện "${massRefundTarget.title}"!`
      );
      setMassRefundTarget(null);
      onReload();
    } catch (err) {
      notify(`Lỗi thực hiện hoàn tiền hàng loạt: ${err.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="card">
      {/* Search & Filters */}
      <div className="toolbar flex flex-wrap justify-between items-center gap-2 mb-md pb-sm border-b">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="input input-sm"
            style={{ width: '280px' }}
            placeholder="Tìm theo tên sự kiện, BTC, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills flex items-center gap-xs">
          <span className="muted text-xs mr-xs">Trạng thái:</span>
          {['ALL', 'LIVE', 'DRAFT', 'PAUSED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'ALL' ? 'Tất cả' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Events Table */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên sự kiện</th>
              <th>Ban tổ chức</th>
              <th>Hạng vé</th>
              <th>Trạng thái</th>
              <th>Thời gian</th>
              <th className="text-right">Thao tác quản trị</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center p-xl muted">
                  Không tìm thấy sự kiện nào phù hợp.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => {
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
                      <span className="badge badge-info">{tiersCount} hạng vé</span>
                    </td>
                    <td>
                      <StatusBadge status={statusKey} />
                    </td>
                    <td className="muted text-xs">{formatDate(ev.start_date || ev.starts_at)}</td>
                    <td>
                      <div className="table-actions justify-end flex items-center gap-xs">
                        <select
                          className="select select-compact"
                          style={{ width: '120px' }}
                          value={statusKey}
                          onChange={(e) => handleStatusChange(ev.id, e.target.value)}
                        >
                          <option value="LIVE">LIVE (Mở bán)</option>
                          <option value="PAUSED">PAUSED (Tạm dừng)</option>
                          <option value="ENDED">ENDED (Kết thúc)</option>
                          <option value="CANCELLED">CANCELLED (Hủy)</option>
                          <option value="DRAFT">DRAFT (Nháp)</option>
                        </select>

                        <button
                          type="button"
                          className="btn btn-xs btn-warning"
                          onClick={() => setMassRefundTarget(ev)}
                          title="Hoàn tiền hàng loạt 100% cho người mua"
                        >
                          Hoàn tiền 100%
                        </button>

                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => setDeleteTarget(ev)}
                          title="Xóa sự kiện khỏi hệ thống"
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

      {/* Delete Event Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa sự kiện"
        message={`Bạn có chắc chắn muốn xóa sự kiện "${deleteTarget?.title}" (ID: #${deleteTarget?.id})? Thao tác này sẽ tự động hoàn tiền 100% và vô hiệu hóa vé của tất cả người mua.`}
        isDanger={true}
        loading={processing}
        confirmText="Xóa Sự Kiện"
      />

      {/* Mass Refund Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(massRefundTarget)}
        onClose={() => setMassRefundTarget(null)}
        onConfirm={confirmMassRefund}
        title="Kích hoạt Hoàn tiền hàng loạt (Mass Refund)"
        message={`CẢNH BÁO TÀI CHÍNH: Bạn đang chuẩn bị kích hoạt lệnh hoàn tiền 100% cho tất cả đơn hàng đã thanh toán của sự kiện "${massRefundTarget?.title}" (ID: #${massRefundTarget?.id}). Toàn bộ vé phát hành sẽ chuyển sang trạng thái CANCELLED.`}
        isDanger={true}
        loading={processing}
        confirmText="Xác nhận hoàn tiền toàn sàn"
      />
    </section>
  );
};

export default AdminEventsTab;
