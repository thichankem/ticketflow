import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { money, formatDate } from '../../utils/display';
import { StatusBadge } from '../common/StatusBadge';

export const AdminOrdersTab = ({ orders = [] }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  return (
    <section className="card">
      {/* Search & Filters */}
      <div className="toolbar flex flex-wrap justify-between items-center gap-2 mb-md pb-sm border-b">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="input input-sm"
            style={{ width: '280px' }}
            placeholder="Tìm theo mã đơn, email người mua, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills flex items-center gap-xs">
          <span className="muted text-xs mr-xs">Trạng thái:</span>
          {['ALL', 'COMPLETED', 'PENDING_PAYMENT', 'RESERVED', 'CANCELLED', 'REFUNDED'].map((st) => (
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

      {/* Orders Table */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã Đơn Hàng</th>
              <th>Người mua</th>
              <th>Sự kiện</th>
              <th>Tổng tiền</th>
              <th>Cổng thanh toán</th>
              <th>Trạng thái</th>
              <th>Thời gian đặt</th>
              <th className="text-right">Biên lai</th>
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
              filteredOrders.map((ord) => {
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
                      <div className="font-semibold">{buyerName}</div>
                      <div className="text-xs muted font-mono">{buyerEmail}</div>
                    </td>
                    <td>
                      <div className="text-sm font-semibold">{ord.event_title || `Sự kiện #${ord.event_id}`}</div>
                    </td>
                    <td>
                      <strong className="text-emerald-600 dark:text-emerald-400">
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
                    <td className="muted text-xs">{formatDate(ord.created_at)}</td>
                    <td className="text-right">
                      <Link
                        to={`/receipt/${ord.id}`}
                        className="btn btn-xs btn-secondary"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Xem biên lai
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminOrdersTab;
