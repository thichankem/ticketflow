import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmModal } from '../common/ConfirmModal';
import { Icon } from '../ui/Icon';

export const AdminEventsTab = ({ events = [], onReload, notify }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [massRefundTarget, setMassRefundTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [processing, setProcessing] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: events.length, LIVE: 0, DRAFT: 0, PAUSED: 0, CANCELLED: 0 };
    events.forEach((ev) => {
      const st = (ev.status || 'DRAFT').toUpperCase();
      if (counts[st] !== undefined) counts[st]++;
    });
    return counts;
  }, [events]);

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

  const totalPages = Math.ceil(filteredEvents.length / pageSize) || 1;
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

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
      const res = await api.post(`/admin/events/${massRefundTarget.id}/mass-refund`, {});
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
    <section className="admin-table-card">
      {/* Search & Filters */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <label htmlFor="admin-events-search" className="sr-only">Tìm theo tên sự kiện, BTC, ID</label>
          <span className="admin-search-icon" aria-hidden="true">
            <Icon name="search" size="xs" ariaHidden />
          </span>
          <input
            id="admin-events-search"
            type="text"
            className="admin-search-input"
            placeholder="Tìm theo tên sự kiện, BTC, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm sự kiện"
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
          <span className="muted text-xs mr-xs font-semibold">Trạng thái:</span>
          {['ALL', 'LIVE', 'DRAFT', 'PAUSED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'ALL' ? 'Tất cả' : st} ({statusCounts[st] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Events Table */}
      <div className="table-responsive admin-table-container">
        <table className="data-table admin-modern-table" style={{ minWidth: '1050px' }}>
          <thead>
            <tr>
              <th style={{ width: '70px' }}>ID</th>
              <th style={{ minWidth: '260px' }}>Tên sự kiện</th>
              <th style={{ minWidth: '180px' }}>Ban tổ chức</th>
              <th style={{ width: '130px' }}>Hạng vé</th>
              <th style={{ width: '130px' }}>Trạng thái</th>
              <th style={{ width: '130px' }}>Thời gian</th>
              <th style={{ width: '260px' }} className="text-right">Thao tác quản trị</th>
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
              paginatedEvents.map((ev) => {
                const statusKey = (ev.status || 'DRAFT').toUpperCase();
                const tiersCount = ev.tiers?.length || ev.tiers_count || 1;

                return (
                  <tr key={ev.id}>
                    <td>
                      <strong className="font-mono text-xs text-muted">#{ev.id}</strong>
                    </td>
                    <td>
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{ev.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="badge badge-subtle text-2xs">
                          {ev.category || 'Event'}
                        </span>
                        <span className="muted text-xs">·</span>
                        <span className="muted text-xs">
                          {ev.location || 'Online'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {ev.organizer_name || `Organizer #${ev.organizer_id || 1}`}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info text-xs inline-flex items-center gap-1">
                        <Icon name="ticket" size="2xs" ariaHidden />
                        <span>{tiersCount} hạng vé</span>
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={statusKey} />
                    </td>
                    <td>
                      <span className="muted text-xs font-mono">{formatDate(ev.start_date || ev.starts_at)}</span>
                    </td>
                    <td>
                      <div className="table-actions justify-end flex items-center gap-1.5 flex-nowrap">
                        <select
                          className="select select-compact text-xs"
                          style={{ width: '115px', padding: '0.25rem 0.5rem', height: '30px' }}
                          value={statusKey}
                          onChange={(e) => handleStatusChange(ev.id, e.target.value)}
                          aria-label={`Thay đổi trạng thái sự kiện ${ev.title}`}
                        >
                          <option value="LIVE">LIVE (Mở bán)</option>
                          <option value="PAUSED">PAUSED (Tạm dừng)</option>
                          <option value="ENDED">ENDED (Kết thúc)</option>
                          <option value="CANCELLED">CANCELLED (Hủy)</option>
                          <option value="DRAFT">DRAFT (Nháp)</option>
                        </select>

                        <button
                          type="button"
                          className="btn btn-xs btn-warning flex-shrink-0"
                          onClick={() => setMassRefundTarget(ev)}
                          title="Hoàn tiền hàng loạt 100% cho người mua"
                        >
                          Hoàn tiền 100%
                        </button>

                        <button
                          type="button"
                          className="btn btn-xs btn-danger flex-shrink-0"
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

      {/* Pagination Controls */}
      <div className="admin-pagination-bar">
        <div>
          Hiển thị <strong>{filteredEvents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> – <strong>{Math.min(currentPage * pageSize, filteredEvents.length)}</strong> trên tổng số <strong>{filteredEvents.length}</strong> sự kiện
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
