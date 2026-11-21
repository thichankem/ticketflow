import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { money, formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';
import { Icon } from '../ui/Icon';
import { Modal } from '../Modal';
import { api } from '../../services/api';

export const AdminOrdersTab = ({ orders = [] }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [exporting, setExporting] = useState(false);
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

  // Aggregate executive metrics for the transactions & reports summary
  const summaryMetrics = useMemo(() => {
    const totalTransactions = orders.length;
    let totalCompletedAmount = 0;
    let pendingCount = 0;
    let refundedCount = 0;

    orders.forEach((ord) => {
      const st = (ord.status || 'COMPLETED').toUpperCase();
      const amt = Number(ord.total || ord.total_gross || 0);
      if (st === 'COMPLETED' || st === 'PAID') {
        totalCompletedAmount += amt;
      } else if (st === 'PENDING_PAYMENT' || st === 'RESERVED') {
        pendingCount++;
      } else if (st === 'REFUNDED') {
        refundedCount++;
      }
    });

    return {
      totalTransactions,
      totalCompletedAmount,
      pendingCount,
      refundedCount,
    };
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

  const handleExportAudit = async () => {
    setExporting(true);
    try {
      await api.admin.exportAuditReport();
    } catch (err) {
      console.error('Lỗi tải báo cáo kiểm toán:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="admin-table-card stack gap-md">
      {/* Transaction & Report Mini-Summary Banner */}
      <div className="grid-4-cols gap-sm">
        <div className="card p-sm border flex items-center gap-sm">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', marginBottom: 0, padding: '8px', borderRadius: '8px' }}>
            <Icon name="receipt" size="sm" ariaHidden />
          </div>
          <div>
            <span className="muted text-xs uppercase font-semibold tracking-wider">Tổng Giao Dịch</span>
            <div className="text-lg font-bold font-mono text-main">{summaryMetrics.totalTransactions} đơn</div>
          </div>
        </div>

        <div className="card p-sm border flex items-center gap-sm">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: 0, padding: '8px', borderRadius: '8px' }}>
            <Icon name="dollar" size="sm" ariaHidden />
          </div>
          <div>
            <span className="muted text-xs uppercase font-semibold tracking-wider">Thực Thu Hoàn Tất</span>
            <div className="text-lg font-bold font-mono text-good">{money(summaryMetrics.totalCompletedAmount)}</div>
          </div>
        </div>

        <div className="card p-sm border flex items-center gap-sm">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', marginBottom: 0, padding: '8px', borderRadius: '8px' }}>
            <Icon name="clock" size="sm" ariaHidden />
          </div>
          <div>
            <span className="muted text-xs uppercase font-semibold tracking-wider">Chờ / Giữ Chỗ</span>
            <div className="text-lg font-bold font-mono text-amber">{summaryMetrics.pendingCount} đơn</div>
          </div>
        </div>

        <div className="card p-sm border flex items-center gap-sm">
          <div className="kpi-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', marginBottom: 0, padding: '8px', borderRadius: '8px' }}>
            <Icon name="alert" size="sm" ariaHidden />
          </div>
          <div>
            <span className="muted text-xs uppercase font-semibold tracking-wider">Đã Hoàn Tiền</span>
            <div className="text-lg font-bold font-mono text-purple">{summaryMetrics.refundedCount} đơn</div>
          </div>
        </div>
      </div>

      {/* Search, Filter Toolbar & Export Report Action */}
      <div className="admin-toolbar flex justify-between items-center flex-wrap gap-sm">
        <div className="admin-toolbar-left flex items-center gap-sm flex-wrap flex-1">
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

        {/* Financial & Audit Export Report Button */}
        <div className="admin-toolbar-right">
          <button
            type="button"
            className="btn btn-sm btn-primary flex items-center gap-1.5"
            onClick={handleExportAudit}
            disabled={exporting}
            title="Xuất tệp báo cáo đối soát tài chính toàn sàn dạng CSV"
          >
            <Icon name="download" size="xs" ariaHidden />
            <span>{exporting ? 'Đang xuất báo cáo...' : 'Xuất Báo Cáo (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* Orders & Invoices History Table */}
      <div className="table-responsive admin-table-container">
        <table className="data-table admin-modern-table" style={{ width: '100%', minWidth: '850px' }}>
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Mã Đơn</th>
              <th style={{ minWidth: '150px' }}>Người mua</th>
              <th style={{ minWidth: '160px' }}>Sự kiện</th>
              <th style={{ width: '110px' }}>Tổng tiền</th>
              <th style={{ width: '80px' }}>Cổng</th>
              <th style={{ width: '105px' }}>Trạng thái</th>
              <th style={{ width: '95px' }}>Thời gian</th>
              <th style={{ width: '140px' }} className="text-right">Hóa đơn & Biên lai</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center p-xl muted">
                  Không tìm thấy đơn hàng hay lịch sử giao dịch nào phù hợp.
                </td>
              </tr>
            ) : (
              paginatedOrders.map((ord) => {
                const buyerName = ord.buyer_name || ord.buyer?.name || ord.customer_name || 'Khách vãng lai';
                const buyerEmail = ord.buyer_email || ord.buyer?.email || ord.customer_email || '—';
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
                      <div className="table-actions justify-end flex items-center gap-1 flex-nowrap">
                        <button
                          type="button"
                          className="btn btn-xs btn-primary inline-flex items-center gap-1"
                          onClick={() => setSelectedOrder(ord)}
                          title="Xem chi tiết hóa đơn thanh toán"
                        >
                          <Icon name="receipt" size="2xs" ariaHidden />
                          <span>Hóa đơn</span>
                        </button>
                        <Link
                          to={`/receipt/${ord.id}`}
                          className="btn btn-xs btn-secondary inline-flex items-center gap-1"
                          style={{ whiteSpace: 'nowrap' }}
                          target="_blank"
                          rel="noreferrer"
                          title="Mở biên lai gốc trong tab mới"
                        >
                          <Icon name="external-link" size="2xs" ariaHidden />
                        </Link>
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

      {/* Payment Invoice Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Hóa Đơn Thanh Toán #${selectedOrder.orderShortId || `ORD-${selectedOrder.id}`}`}
        >
          <div className="invoice-modal-content stack gap-md p-xs">
            {/* Header info */}
            <div className="flex justify-between items-start border-b pb-sm">
              <div>
                <span className="text-xs uppercase text-muted font-semibold tracking-wider">Mã Giao Dịch / Hóa Đơn</span>
                <h4 className="text-xl font-bold font-mono text-primary m-0">
                  {selectedOrder.orderShortId || `ORD-${selectedOrder.id}`}
                </h4>
                <span className="text-xs text-muted font-mono">{formatDate(selectedOrder.created_at)}</span>
              </div>
              <StatusBadge status={selectedOrder.status || 'COMPLETED'} />
            </div>

            {/* Info Grid */}
            <div className="grid-2-cols gap-md text-xs">
              <div className="card p-sm bg-surface-subtle">
                <strong className="d-block mb-xs text-muted uppercase font-semibold tracking-wide">Thông tin người mua</strong>
                <div className="font-semibold text-sm text-main">{selectedOrder.buyer_name || selectedOrder.buyer?.name || selectedOrder.customer_name || 'Khách vãng lai'}</div>
                <div className="text-muted font-mono">{selectedOrder.buyer_email || selectedOrder.buyer?.email || selectedOrder.customer_email || '—'}</div>
                {selectedOrder.buyer_phone && <div className="text-muted font-mono mt-01">SĐT: {selectedOrder.buyer_phone}</div>}
              </div>

              <div className="card p-sm bg-surface-subtle">
                <strong className="d-block mb-xs text-muted uppercase font-semibold tracking-wide">Thông tin sự kiện</strong>
                <div className="font-semibold text-sm text-main">{selectedOrder.event_title || `Sự kiện #${selectedOrder.event_id}`}</div>
                <div className="text-muted mt-01">Cổng thanh toán: <strong className="font-mono text-main">{selectedOrder.payment_gateway || selectedOrder.payment_method || 'VNPAY'}</strong></div>
                {selectedOrder.promo_code && (
                  <div className="text-teal font-medium mt-01">Mã khuyến mãi: <strong className="font-mono">{selectedOrder.promo_code}</strong></div>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="card p-sm border stack gap-xs text-xs">
              <div className="flex justify-between items-center text-muted">
                <span>Tạm tính (Subtotal):</span>
                <span className="font-mono font-semibold">{money(selectedOrder.subtotal || selectedOrder.total || 0)}</span>
              </div>
              {Number(selectedOrder.discount_amount || 0) > 0 && (
                <div className="flex justify-between items-center text-good">
                  <span>Giảm giá khuyến mãi:</span>
                  <span className="font-mono font-semibold">-{money(selectedOrder.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-bold border-t pt-xs text-main">
                <span>Tổng tiền thanh toán (Gross):</span>
                <span className="font-mono text-lg text-primary">{money(selectedOrder.total || selectedOrder.total_gross || 0)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-sm border-t mt-xs">
              <Link
                to={`/receipt/${selectedOrder.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm flex items-center gap-xs"
              >
                <Icon name="external-link" size="xs" ariaHidden />
                <span>Xem & In Bản Gốc</span>
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedOrder(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};

export default AdminOrdersTab;
