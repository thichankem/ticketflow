import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { money, formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { Icon } from '../ui/Icon';

export const AdminOrdersTab = ({ orders = [] }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: orders.length,
      COMPLETED: 0,
      PENDING_PAYMENT: 0,
      RESERVED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
    };
    orders.forEach((ord) => {
      const st = (ord.status || 'COMPLETED').toUpperCase();
      if (counts[st] !== undefined) counts[st]++;
      else if (st === 'PAID') counts.COMPLETED++;
      else if (st === 'EXPIRED') counts.CANCELLED++;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const q = search.toLowerCase();
      const buyerName = (ord.buyer_name || ord.buyer?.name || '').toLowerCase();
      const buyerEmail = (ord.buyer_email || ord.buyer?.email || '').toLowerCase();
      const orderCode = (ord.orderShortId || `ORD-${ord.id}`).toLowerCase();

      const matchesSearch =
        !q ||
        buyerName.includes(q) ||
        buyerEmail.includes(q) ||
        orderCode.includes(q) ||
        String(ord.id).includes(q);

      const statusKey = (ord.status || 'COMPLETED').toUpperCase();
      const matchesStatus = statusFilter === 'ALL' || statusKey === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  return (
    <section className="admin-table-card">
      {/* Search & Filters */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <label htmlFor="admin-orders-search" className="sr-only">Tìm theo mã đơn, email người mua, ID</label>
          <span className="admin-search-icon" aria-hidden="true">
            <Icon name="search" size="xs" ariaHidden />
          </span>
          <input
            id="admin-orders-search"
            type="search"
            className="admin-search-input"
            placeholder="Tìm theo mã đơn, email người mua, ID..."
            aria-label="Tìm kiếm theo mã đơn, email người mua hoặc ID"
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
          <span className="muted text-xs mr-xs font-semibold">Trạng thái:</span>
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'COMPLETED', label: 'Hoàn tất' },
            { key: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
            { key: 'RESERVED', label: 'Đang giữ chỗ' },
            { key: 'CANCELLED', label: 'Đã hủy' },
            { key: 'REFUNDED', label: 'Hoàn tiền' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`filter-pill ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label} ({statusCounts[key] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="table-responsive admin-table-container">
        <table className="data-table admin-modern-table" style={{ minWidth: '980px' }}>
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Mã Đơn Hàng</th>
              <th style={{ minWidth: '220px' }}>Người mua</th>
              <th style={{ minWidth: '220px' }}>Sự kiện</th>
              <th style={{ width: '130px' }}>Tổng tiền</th>
              <th style={{ width: '130px' }}>Cổng thanh toán</th>
              <th style={{ width: '140px' }}>Trạng thái</th>
              <th style={{ width: '130px' }}>Thời gian đặt</th>
              <th style={{ width: '130px' }} className="text-right">Biên lai</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center p-xl muted">
                  Không tìm thấy đơn hàng nào phù hợp.
                </td>
              </tr>
            ) : (
              paginatedOrders.map((ord) => {
                const buyerName = ord.buyer_name || ord.buyer?.name || 'Khách vãng lai';
                const buyerEmail = ord.buyer_email || ord.buyer?.email || '—';
                const total = Number(ord.total || ord.total_gross || 0);

                return (
                  <tr key={ord.id}>
                    <td>
                      <strong className="badge badge-secondary font-mono text-xs">
                        {ord.orderShortId || `ORD-${ord.id}`}
                      </strong>
                    </td>
                    <td>
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{buyerName}</div>
                      <div className="text-xs muted font-mono">{buyerEmail}</div>
                    </td>
                    <td>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ord.event_title || `Sự kiện #${ord.event_id}`}</div>
                    </td>
                    <td>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                        {money(total)}
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-subtle font-mono text-xs">
                        {ord.payment_gateway || ord.payment_method || 'VNPAY'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={ord.status || 'COMPLETED'} />
                    </td>
                    <td>
                      <span className="muted text-xs font-mono">{formatDate(ord.created_at)}</span>
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/receipt/${ord.id}`}
                        className="btn btn-xs btn-secondary inline-flex items-center gap-1"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>Xem biên lai</span>
                        <Icon name="external-link" size="2xs" ariaHidden />
                      </Link>
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
          Hiển thị <strong>{filteredOrders.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> – <strong>{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> trên tổng số <strong>{filteredOrders.length}</strong> đơn hàng
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
    </section>
  );
};

export default AdminOrdersTab;
