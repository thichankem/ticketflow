import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmModal } from '../common/ConfirmModal';

export const OrganizerEventsTab = ({
  events = [],
  loading = false,
  onSelectEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const itemsPerPage = 9;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.category || '').toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q)
    );
  }, [events, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await onDeleteEvent(deleteTarget.id, deleteTarget.title);
    setDeleteTarget(null);
  };

  return (
    <div className="stack">
      {/* Search and Action Toolbar */}
      <div className="toolbar toolbar-row-flex flex items-center justify-between flex-wrap gap-sm">
        <div className="flex items-center gap-sm">
          <h2 className="panel-title m-0">Sự Kiện Của Tôi</h2>
          <span className="badge badge-primary">{filtered.length} sự kiện</span>
        </div>

        <div className="flex items-center gap-sm flex-wrap">
          <input
            type="search"
            className="input input-sm"
            style={{ width: '260px' }}
            placeholder="Tìm theo tên, thể loại, địa điểm..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/organizer/events/new')}
          >
            + Tạo Sự Kiện Mới
          </button>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="card loading-state p-xl text-center text-muted">
          Đang tải danh sách sự kiện...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state p-xl text-center">
          <h3>Không tìm thấy sự kiện nào</h3>
          <p className="muted mb-md">Hãy thử từ khóa khác hoặc tạo một sự kiện mới ngay.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/organizer/events/new')}
          >
            Tạo Sự Kiện Mới
          </button>
        </div>
      ) : (
        <>
          <div className="grid-cards">
            {paginated.map((ev) => {
              const sold = Number(ev.tickets_sold) || 0;
              const total = Number(ev.total_tickets) || (sold > 0 ? sold + 20 : 100);
              const soldPct = Math.min(100, Math.round((sold / total) * 100));

              return (
                <article key={ev.id} className="event-card">
                  <div
                    className="event-cover"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectEvent(String(ev.id), 'event-dashboard')}
                    title="Mở bảng điều khiển sự kiện"
                  >
                    {ev.cover || ev.banner ? (
                      <img
                        src={ev.cover || ev.banner}
                        alt={ev.title}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/images/events/summit.svg';
                        }}
                      />
                    ) : (
                      <div className="event-thumb-placeholder">{ev.category || 'Event'}</div>
                    )}
                    <div className="cover-meta">
                      <span className="status-pill">{ev.category || 'Tech'}</span>
                      <StatusBadge status={ev.status || 'DRAFT'} />
                    </div>
                  </div>

                  <div className="event-card-body">
                    <h3
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelectEvent(String(ev.id), 'event-dashboard')}
                      title="Mở bảng điều khiển sự kiện"
                    >
                      {ev.title}
                    </h3>
                    <p className="muted text-xs">
                      {formatDate(ev.start_date || ev.starts_at)} · {ev.location || 'Online / TBA'}
                    </p>

                    <div className="stack gap-xs mt-xs">
                      <div className="flex justify-between text-xs muted">
                        <span>Đã bán: {sold} vé</span>
                        <span>{soldPct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${soldPct}%` }} />
                      </div>
                    </div>

                    <div className="event-card-footer mt-md flex justify-between items-center gap-xs">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm flex-1"
                        onClick={() => onSelectEvent(String(ev.id), 'event-dashboard')}
                      >
                        Quản lý
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEditEvent(ev)}
                        title="Chỉnh sửa thông tin sự kiện"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(ev)}
                        title="Xóa sự kiện"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-lg p-md">
              <span className="text-sm muted">
                Trang {page} / {totalPages}
              </span>
              <div className="flex gap-xs">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Event Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Xác nhận xóa sự kiện: "${deleteTarget?.title}"`}
        message={`CẢNH BÁO: Xóa sự kiện sẽ tự động kích hoạt HOÀN TIỀN 100% cho toàn bộ người mua vé và hủy toàn bộ vé đã phát hành. Thao tác này là vĩnh viễn và không thể khôi phục.`}
        isDanger={true}
        confirmText="Xác nhận xóa & Hoàn tiền"
      />
    </div>
  );
};

export default OrganizerEventsTab;
