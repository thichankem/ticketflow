import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money, formatDate, formatDateTime } from '../utils/display';
import { QrCodeSvg } from '../utils/qr';

export const MyTicketsPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' | 'HISTORY'
  const [orderSearch, setOrderSearch] = useState('');
  const [orderVisibleCount, setOrderVisibleCount] = useState(10);

  // Refund Modal State
  const [refundTargetOrder, setRefundTargetOrder] = useState(null);
  const refundDialogRef = useRef(null);
  const [refundReason, setRefundReason] = useState('Bận việc đột xuất không thể tham dự');
  const [refunding, setRefunding] = useState(false);
  const [refundNotice, setRefundNotice] = useState(null);

  // Transfer Modal State
  const [transferTargetAttendee, setTransferTargetAttendee] = useState(null);
  const transferDialogRef = useRef(null);
  const [transferForm, setTransferForm] = useState({ new_name: '', new_email: '' });
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    const dialog = refundDialogRef.current;
    if (!dialog) return;
    if (refundTargetOrder) {
      if (!dialog.open) {
        dialog.showModal();
        const focusTarget = dialog.querySelector('.modal-close-btn') || dialog.querySelector('button');
        if (focusTarget) focusTarget.focus();
      }
    } else {
      if (dialog.open) dialog.close();
    }
  }, [refundTargetOrder]);

  useEffect(() => {
    const dialog = transferDialogRef.current;
    if (!dialog) return;
    if (transferTargetAttendee) {
      if (!dialog.open) {
        dialog.showModal();
        const firstInput = dialog.querySelector('input') || dialog.querySelector('.modal-close-btn');
        if (firstInput) firstInput.focus();
      }
    } else {
      if (dialog.open) dialog.close();
    }
  }, [transferTargetAttendee]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      let fetched = [];
      try {
        const res = await (api.orders.getMyOrders ? api.orders.getMyOrders() : api.get('/orders/my'));
        fetched = Array.isArray(res) ? res : res?.orders || [];
      } catch (err) {
        console.warn('Could not load orders from API:', err.message);
      }

      setOrders(fetched);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Filter orders by tab and search
  const filteredActiveOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'PAID' || o.status === 'CONFIRMED' || o.status === 'COMPLETED')
      .filter((o) => {
        if (!orderSearch.trim()) return true;
        const q = orderSearch.toLowerCase();
        const code = (o.orderShortId || `TF-ORD-${o.id}`).toLowerCase();
        const title = (o.event_title || '').toLowerCase();
        const hasAttendee = o.attendees?.some((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
        return code.includes(q) || title.includes(q) || hasAttendee;
      });
  }, [orders, orderSearch]);

  const filteredPastOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'REFUNDED' || o.status === 'CANCELLED' || o.status === 'EXPIRED')
      .filter((o) => {
        if (!orderSearch.trim()) return true;
        const q = orderSearch.toLowerCase();
        const code = (o.orderShortId || `TF-ORD-${o.id}`).toLowerCase();
        const title = (o.event_title || '').toLowerCase();
        const hasAttendee = o.attendees?.some((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
        return code.includes(q) || title.includes(q) || hasAttendee;
      });
  }, [orders, orderSearch]);

  const targetOrders = activeTab === 'ACTIVE' ? filteredActiveOrders : filteredPastOrders;
  const displayedOrders = targetOrders.slice(0, orderVisibleCount);

  // Handle self-service refund
  const handleConfirmRefund = async () => {
    if (!refundTargetOrder) return;
    setRefunding(true);
    try {
      await (api.orders.refund ? api.orders.refund(refundTargetOrder.id, { reason: refundReason }) : api.post(`/orders/${refundTargetOrder.id}/cancel`, { reason: refundReason }));

      // Update local state
      setOrders((prev) =>
        prev.map((o) =>
          o.id === refundTargetOrder.id ? { ...o, status: 'REFUNDED', refundReason, refunded_at: new Date().toISOString() } : o
        )
      );

      // Update localStorage
      const local = JSON.parse(localStorage.getItem('tf_my_orders') || '[]');
      const updatedLocal = local.map((it) => {
        if (String(it.order?.id || it.id) === String(refundTargetOrder.id)) {
          return { ...it, status: 'REFUNDED', refundReason };
        }
        return it;
      });
      localStorage.setItem('tf_my_orders', JSON.stringify(updatedLocal));

      setRefundNotice(`Đã hủy vé và kích hoạt hoàn tiền thành công cho đơn #${refundTargetOrder.orderShortId || refundTargetOrder.id}. Tiền sẽ được hoàn về tài khoản thanh toán ban đầu của bạn.`);
      setRefundTargetOrder(null);
    } catch (err) {
      alert(`Lỗi khi yêu cầu hoàn tiền: ${err.message || 'Chính sách sự kiện không cho phép hoàn hủy vé vào thời điểm này.'}`);
    } finally {
      setRefunding(false);
    }
  };

  // Handle Ticket Transfer
  const handleConfirmTransfer = async (e) => {
    e.preventDefault();
    if (!transferTargetAttendee) return;
    setTransferring(true);
    try {
      await api.orders.transferTicket(transferTargetAttendee.id, {
        new_name: transferForm.new_name,
        new_email: transferForm.new_email,
      });

      setRefundNotice(`Đã chuyển nhượng vé thành công sang cho ${transferForm.new_name} (${transferForm.new_email})!`);

      // Update local state in place
      setOrders((prev) =>
        prev.map((ord) => ({
          ...ord,
          attendees: ord.attendees?.map((att) =>
            att.id === transferTargetAttendee.id
              ? { ...att, name: transferForm.new_name, email: transferForm.new_email }
              : att
          ),
        }))
      );

      setTransferTargetAttendee(null);
      setTransferForm({ new_name: '', new_email: '' });
      await loadOrders();
    } catch (err) {
      alert(`Lỗi chuyển nhượng vé: ${err.message}`);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="my-tickets-page-container">
      <header className="page-head">
        <h1>Vé của tôi</h1>
      </header>

      {refundNotice && (
        <div className="alert alert-success">
          {refundNotice}
        </div>
      )}

      {/* Tabs Filter & Search */}
      <div className="flex justify-between items-center gap-md flex-wrap mb-125">
        <nav className="tabs-nav m-0" aria-label="Bộ lọc đơn hàng">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => { setActiveTab('ACTIVE'); setOrderVisibleCount(10); }}
          >
            <span>{t('mytickets.tab_active', 'Vé đang hiệu lực')}</span>
            <span className="tab-count">{filteredActiveOrders.length}</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
            onClick={() => { setActiveTab('HISTORY'); setOrderVisibleCount(10); }}
          >
            <span>{t('mytickets.tab_history', 'Lịch sử / Đã hoàn tiền')}</span>
            <span className="tab-count">{filteredPastOrders.length}</span>
          </button>
        </nav>

        <div className="search-box-compact min-w-260">
          <label htmlFor="mytickets-search-input" className="sr-only">Tìm kiếm vé và đơn hàng</label>
          <input
            id="mytickets-search-input"
            type="search"
            className="input input-sm"
            placeholder={t('mytickets.search_placeholder', 'Tìm theo mã đơn, sự kiện, người tham dự...')}
            aria-label={t('mytickets.search_placeholder', 'Tìm theo mã đơn, sự kiện, người tham dự...')}
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div className="card loading-state">
          <div className="spinner" />
          <p className="muted">Đang tải danh sách vé điện tử và mã QR...</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          Lỗi tải đơn hàng: {error}
        </div>
      )}

      {!loading && targetOrders.length === 0 && (
        <div className="card empty-state my-xl">
          <div className="empty-icon">🎟️</div>
          <h3>Không tìm thấy vé nào phù hợp</h3>
          <p className="muted">
            {orderSearch
              ? `Không có kết quả nào khớp với "${orderSearch}".`
              : activeTab === 'ACTIVE'
              ? 'Bạn hiện không có vé sự kiện nào đang hiệu lực.'
              : 'Chưa có đơn hàng nào trong lịch sử hủy hoặc hoàn tiền.'}
          </p>
          {orderSearch ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOrderSearch('')}>
              Xóa tìm kiếm
            </button>
          ) : (
            <Link to="/" className="btn btn-primary btn-sm">
              Khám phá sự kiện & Đặt vé ngay
            </Link>
          )}
        </div>
      )}

      {/* Orders List */}
      <div className="orders-stack">
        {displayedOrders.map((order) => {
          const isRefunded = order.status === 'REFUNDED' || order.status === 'CANCELLED';

          return (
            <article key={order.id} className={`order-card-wrapper ${isRefunded ? 'order-card-refunded' : ''}`}>
              <div className="order-summary-band">
                <div className="order-meta-left">
                  <span className="order-ref-code">
                    Mã đơn: <strong>{order.orderShortId || `TF-ORD-${order.id}`}</strong>
                  </span>
                  <span className="order-timestamp">
                    Đặt lúc: {formatDateTime(order.created_at)}
                  </span>
                  <span className={`badge ${isRefunded ? 'badge-danger' : 'badge-success'}`}>
                    {isRefunded ? 'Đã hoàn tiền' : 'Đã thanh toán'}
                  </span>
                </div>

                <div className="order-meta-right">
                  <span className="order-total-price">{money(order.total)}</span>

                  <Link
                    to={`/receipt/${order.id}`}
                    className="btn btn-secondary btn-sm"
                    title="Xem biên lai"
                  >
                    Biên lai
                  </Link>

                  {/* Self-service Refund / Cancel Button */}
                  {!isRefunded && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm refund-trigger-btn"
                      onClick={() => setRefundTargetOrder(order)}
                    >
                      Hủy vé
                    </button>
                  )}
                </div>
              </div>

              {/* Event Title Banner */}
              <div className="order-event-title-banner">
                <h3>{order.event_title || 'Sự kiện Ticketflow'}</h3>
                {order.event_location && <div className="event-loc">{order.event_location}</div>}
              </div>

              {/* Tickets List with QR */}
              <div className="order-tickets-list">
                {order.attendees?.map((att, idx) => (
                  <div key={att.id || idx} className={`ticket-row-item ${isRefunded ? 'ticket-cancelled' : ''}`}>
                    <div className="ticket-details-box">
                      <div className="ticket-badge-row">
                        <span className="badge badge-primary">{att.tier_name || 'Vé tiêu chuẩn'}</span>
                        <span className={`status-pill ${att.status === 'CANCELLED' ? 'cancelled' : 'ready'}`}>
                          {att.status === 'CANCELLED' ? 'Đã hủy' : 'Vé hợp lệ'}
                        </span>
                      </div>

                      <div className="ticket-attendee-name">
                        <strong>Người tham dự:</strong> {att.name || 'Khách mời'}
                      </div>
                      <div className="ticket-attendee-email">
                        <strong>Email:</strong> {att.email || '—'}
                      </div>
                      <div className="ticket-seat-assignment">
                        <strong>Vị trí chỗ ngồi:</strong>{' '}
                        <span className="seat-badge">{att.seat || 'Ghế tự do (Open Seating)'}</span>
                      </div>

                      {/* Transfer Ticket Action Button */}
                      {!isRefunded && att.status !== 'CANCELLED' && (
                        <div className="mt-075">
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              setTransferTargetAttendee({ ...att, orderId: order.id });
                              setTransferForm({ new_name: '', new_email: '' });
                            }}
                          >
                            Chuyển nhượng
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="ticket-qr-container">
                      <QrCodeSvg value={att.qr_hash || att.ticket_code || att.barcode || `TKF-${order.id}-${idx}`} size={120} />
                      <div className="qr-door-label">Mã QR Vé Điện Tử</div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination for 50+ Orders */}
      {orderVisibleCount < targetOrders.length && (
        <div className="text-center mt-xl">
          <p className="muted text-sm mb-075">
            Đang hiển thị {displayedOrders.length} trên tổng số {targetOrders.length} đơn hàng
          </p>
          <div className="flex justify-center gap-sm">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setOrderVisibleCount((prev) => prev + 10)}
            >
              + Xem thêm 10 đơn hàng
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setOrderVisibleCount(targetOrders.length)}
            >
              Xem tất cả ({targetOrders.length})
            </button>
          </div>
        </div>
      )}

      {/* Self-service Refund Modal with native <dialog> */}
      <dialog
        ref={refundDialogRef}
        className="native-modal"
        aria-labelledby="refund-modal-title"
        onClose={() => setRefundTargetOrder(null)}
        onClick={(e) => {
          if (e.target === refundDialogRef.current) setRefundTargetOrder(null);
        }}
      >
        {refundTargetOrder && (
          <div className="modal-dialog refund-modal">
            <div className="modal-header">
              <h3 id="refund-modal-title">Xác nhận hủy vé & hoàn tiền</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRefundTargetOrder(null)}
                aria-label="Đóng cửa sổ"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="refund-policy-summary">
                <h4>Thông tin hoàn vé:</h4>
                <ul>
                  <li>• Đơn hàng: <strong>{refundTargetOrder.orderShortId || refundTargetOrder.id}</strong></li>
                  <li>• Tổng tiền hoàn: <strong>{money(refundTargetOrder.total)}</strong></li>
                  <li>• Điều kiện thời gian: Thực hiện trước ngày diễn ra sự kiện ít nhất 3 ngày.</li>
                  <li>• Phương thức hoàn: Hoàn về tài khoản thanh toán ban đầu.</li>
                  <li>• Thu hồi vé: Mã QR và chỗ ngồi sẽ bị vô hiệu hóa sau khi hủy.</li>
                </ul>
              </div>

              <div className="form-group form-mt">
                <label htmlFor="refundReasonSelect">Lý do yêu cầu hủy vé & hoàn tiền:</label>
                <select
                  id="refundReasonSelect"
                  className="select"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                >
                  <option value="Bận việc đột xuất không thể tham dự">Bận việc đột xuất không thể tham dự</option>
                  <option value="Thay đổi lịch trình công tác / du lịch">Thay đổi lịch trình công tác / du lịch</option>
                  <option value="Đặt nhầm hạng vé / số lượng">Đặt nhầm hạng vé / số lượng</option>
                  <option value="Lý do sức khỏe">Lý do sức khỏe</option>
                  <option value="Khác">Lý do khác</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-danger"
                disabled={refunding}
                onClick={handleConfirmRefund}
              >
                {refunding ? 'Đang xử lý hoàn tiền qua cổng trực tuyến...' : `Xác nhận Hủy & Nhận hoàn ${money(refundTargetOrder.total)}`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={refunding}
                onClick={() => setRefundTargetOrder(null)}
              >
                Quay lại
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Ticket Transfer Modal with native <dialog> */}
      <dialog
        ref={transferDialogRef}
        className="native-modal"
        aria-labelledby="transfer-modal-title"
        onClose={() => setTransferTargetAttendee(null)}
        onClick={(e) => {
          if (e.target === transferDialogRef.current) setTransferTargetAttendee(null);
        }}
      >
        {transferTargetAttendee && (
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 id="transfer-modal-title">Chuyển nhượng vé</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setTransferTargetAttendee(null)}
                aria-label="Đóng cửa sổ"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer}>
              <div className="modal-body">
                <p className="muted text-sm">
                  Bạn đang chuyển nhượng vé <strong>{transferTargetAttendee.tier_name || 'Vé tham dự'}</strong> (Ghế: {transferTargetAttendee.seat || 'Tự do'}). Sau khi chuyển nhượng, vé và mã QR sẽ thuộc quyền sở hữu của người nhận.
                </p>

                <div className="form-group form-mt">
                  <label htmlFor="transName">Họ và tên người nhận mới *</label>
                  <input
                    id="transName"
                    type="text"
                    required
                    autoComplete="name"
                    className="input"
                    placeholder="Nguyễn Văn B"
                    value={transferForm.new_name}
                    onChange={(e) => setTransferForm({ ...transferForm, new_name: e.target.value })}
                  />
                </div>

                <div className="form-group form-mt-sm">
                  <label htmlFor="transEmail">Email người nhận mới *</label>
                  <input
                    id="transEmail"
                    type="email"
                    required
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    className="input"
                    placeholder="nguyenvanb@example.com"
                    value={transferForm.new_email}
                    onChange={(e) => setTransferForm({ ...transferForm, new_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={transferring}
                >
                  {transferring ? 'Đang chuyển nhượng...' : 'Xác nhận chuyển nhượng'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={transferring}
                  onClick={() => setTransferTargetAttendee(null)}
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  );
};

export default MyTicketsPage;
