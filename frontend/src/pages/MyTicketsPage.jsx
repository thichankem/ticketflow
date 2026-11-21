import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money, formatDate, formatDateTime } from '../utils/display';
import { QrCodeSvg } from '../utils/qr';
import { Modal } from '../components/Modal';
import { Icon } from '../components/ui/Icon';
import { VectorSpinner } from '../components/ui/VectorAnimation';
import { EmptyStateIllustration } from '../components/ui/EmptyStateIllustration';

export const getOrderStatusInfo = (status) => {
  const st = (status || '').toUpperCase();
  switch (st) {
    case 'PAID':
    case 'CONFIRMED':
    case 'COMPLETED':
      return { label: 'Đã thanh toán', badgeClass: 'badge-success', isRefundable: true, isTicketActive: true };
    case 'PENDING_PAYMENT':
    case 'RESERVED':
      return { label: 'Chờ thanh toán', badgeClass: 'badge-warning', isRefundable: false, isTicketActive: false };
    case 'EXPIRED_PAYMENT_PENDING_REFUND':
    case 'PENDING_RECONCILIATION':
    case 'REFUND_REQUIRED':
    case 'REFUND_PROCESSING':
    case 'PENDING_REFUND':
      return { label: 'Đang xử lý hoàn tiền', badgeClass: 'badge-warning', isRefundable: false, isTicketActive: false };
    case 'REFUNDED':
      return { label: 'Đã hoàn tiền', badgeClass: 'badge-info', isRefundable: false, isTicketActive: false };
    case 'REFUND_FAILED':
      return { label: 'Hoàn tiền thất bại', badgeClass: 'badge-danger', isRefundable: false, isTicketActive: false };
    case 'CANCELLED':
      return { label: 'Đã hủy', badgeClass: 'badge-danger', isRefundable: false, isTicketActive: false };
    case 'EXPIRED':
      return { label: 'Hết hạn', badgeClass: 'badge-secondary', isRefundable: false, isTicketActive: false };
    case 'UNVERIFIED':
      return { label: 'Chưa xác minh', badgeClass: 'badge-secondary', isRefundable: false, isTicketActive: false };
    default:
      return { label: st || 'Chờ xử lý', badgeClass: 'badge-secondary', isRefundable: false, isTicketActive: false };
  }
};

export const MyTicketsPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' | 'PROCESSING' | 'HISTORY'
  const [orderSearch, setOrderSearch] = useState('');
  const [orderVisibleCount, setOrderVisibleCount] = useState(10);

  // Refund Modal State
  const [refundTargetOrder, setRefundTargetOrder] = useState(null);
  const [refundReason, setRefundReason] = useState('Bận việc đột xuất không thể tham dự');
  const [refunding, setRefunding] = useState(false);
  const [refundNotice, setRefundNotice] = useState(null);
  const [refundError, setRefundError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      let fetched = [];
      try {
        const res = await (api.orders.getMyOrders ? api.orders.getMyOrders() : api.get('/orders/my'));
        fetched = Array.isArray(res) ? res : res?.orders || [];
      } catch (err) {
        console.warn('Could not load orders from API:', err.message);
        setLoadError(err.message || 'Không thể kết nối đến máy chủ để tải danh sách đơn vé.');
      }

      // UI-22: Merge with local orders stored from checkout (for guest orders)
      try {
        const local = JSON.parse(localStorage.getItem('tf_my_orders') || '[]');
        const existingIds = new Set(fetched.map((o) => String(o.id)));
        const unverifiedLocal = local.filter((it) => !existingIds.has(String(it.id || it.order?.id)));

        if (unverifiedLocal.length > 0) {
          const verifiedLocal = await Promise.all(
            unverifiedLocal.map(async (it) => {
              const ordId = it.id || it.order?.id;
              const token =
                it.session_token ||
                (typeof sessionStorage !== 'undefined'
                  ? sessionStorage.getItem(`tf_guest_token_${ordId}`) || sessionStorage.getItem('tf_active_guest_token')
                  : null);
              try {
                const serverOrd = await api.orders.getById(ordId, token);
                const actualOrder = serverOrd?.order || serverOrd;
                return {
                  id: ordId,
                  orderShortId: actualOrder?.orderShortId || it.orderShortId || `TF-ORD-${ordId}`,
                  event_title: actualOrder?.event_title || it.event_title || 'Sự kiện Ticketflow',
                  event_location: actualOrder?.event_location || it.event_location || '',
                  event_date: actualOrder?.event_date || actualOrder?.starts_at || it.event_date || null,
                  subtotal: actualOrder?.subtotal || it.subtotal || actualOrder?.total || it.total || 0,
                  discount: actualOrder?.discount || it.discount || 0,
                  total: actualOrder?.total_gross || actualOrder?.total || it.total || 0,
                  paymentMethod: actualOrder?.paymentMethod || actualOrder?.payment_method || it.paymentMethod || 'VNPAY',
                  payment_method: actualOrder?.payment_method || actualOrder?.paymentMethod || it.payment_method || 'VNPAY',
                  status: actualOrder?.status || it.status || 'UNVERIFIED',
                  attendees: serverOrd?.attendees || actualOrder?.attendees || it.attendees || [],
                  created_at: actualOrder?.created_at || it.created_at || new Date().toISOString(),
                  isVerified: true,
                };
              } catch {
                return {
                  id: ordId,
                  orderShortId: it.orderShortId || `TF-ORD-${ordId}`,
                  event_title: it.event_title || 'Sự kiện Ticketflow',
                  event_location: it.event_location || '',
                  event_date: it.event_date || null,
                  subtotal: it.subtotal || it.total || 0,
                  discount: it.discount || 0,
                  total: it.total || 0,
                  paymentMethod: it.paymentMethod || 'VNPAY',
                  payment_method: it.payment_method || it.paymentMethod || 'VNPAY',
                  status: it.status || 'UNVERIFIED',
                  attendees: it.attendees || [],
                  created_at: it.created_at || new Date().toISOString(),
                  isVerified: false,
                };
              }
            })
          );
          fetched = [...fetched, ...verifiedLocal];
        }
      } catch {
        // ignore localStorage errors
      }

      // Sort newest purchases first
      fetched.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0));

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

  // Filter orders by tab and search (UI-04: Ensure all order statuses are categorized)
  const filteredActiveOrders = useMemo(() => {
    return orders
      .filter((o) => ['PAID', 'CONFIRMED', 'COMPLETED'].includes(o.status))
      .filter((o) => {
        if (!orderSearch.trim()) return true;
        const q = orderSearch.toLowerCase();
        const code = (o.orderShortId || `TF-ORD-${o.id}`).toLowerCase();
        const title = (o.event_title || '').toLowerCase();
        const hasAttendee = o.attendees?.some((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
        return code.includes(q) || title.includes(q) || hasAttendee;
      });
  }, [orders, orderSearch]);

  const filteredProcessingOrders = useMemo(() => {
    return orders
      .filter((o) =>
        [
          'RESERVED',
          'PENDING_PAYMENT',
          'PENDING_RECONCILIATION',
          'REFUND_REQUIRED',
          'EXPIRED_PAYMENT_PENDING_REFUND',
          'PENDING_REFUND',
          'REFUND_PROCESSING',
        ].includes(o.status)
      )
      .filter((o) => {
        if (!orderSearch.trim()) return true;
        const q = orderSearch.toLowerCase();
        const code = (o.orderShortId || `TF-ORD-${o.id}`).toLowerCase();
        const title = (o.event_title || '').toLowerCase();
        const hasAttendee = o.attendees?.some((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
        return code.includes(q) || title.includes(q) || hasAttendee;
      });
  }, [orders, orderSearch]);

  // Lịch sử mua hàng: Toàn bộ vé / đơn hàng đã mua tự động xuất hiện với đầy đủ thông tin
  const filteredHistoryOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!orderSearch.trim()) return true;
      const q = orderSearch.toLowerCase();
      const code = (o.orderShortId || `TF-ORD-${o.id}`).toLowerCase();
      const title = (o.event_title || '').toLowerCase();
      const hasAttendee = o.attendees?.some((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
      return code.includes(q) || title.includes(q) || hasAttendee;
    });
  }, [orders, orderSearch]);

  const filteredPastOrders = filteredHistoryOrders; // Alias for tests

  const targetOrders =
    activeTab === 'ACTIVE'
      ? filteredActiveOrders
      : activeTab === 'PROCESSING'
      ? filteredProcessingOrders
      : filteredHistoryOrders;
  const displayedOrders = targetOrders.slice(0, orderVisibleCount);

  // Handle self-service refund (UI-03: Differentiate pending vs settled refund)
  const handleConfirmRefund = async () => {
    if (!refundTargetOrder || refunding) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const res = await (api.orders.refund
        ? api.orders.refund(refundTargetOrder.id, { reason: refundReason })
        : api.post(`/orders/${refundTargetOrder.id}/cancel`, { reason: refundReason }));

      const returnedStatus = res?.status || res?.order?.status || res?.data?.status || 'PENDING_RECONCILIATION';
      const refundTimestamp = returnedStatus === 'REFUNDED' ? (res?.refunded_at || new Date().toISOString()) : null;

      // Update local state with authoritative server status
      setOrders((prev) =>
        prev.map((o) =>
          o.id === refundTargetOrder.id
            ? { ...o, status: returnedStatus, refundReason, ...(refundTimestamp ? { refunded_at: refundTimestamp } : {}) }
            : o
        )
      );

      // Update localStorage with authoritative server status
      const local = JSON.parse(localStorage.getItem('tf_my_orders') || '[]');
      const updatedLocal = local.map((it) => {
        if (String(it.order?.id || it.id) === String(refundTargetOrder.id)) {
          return { ...it, status: returnedStatus, refundReason };
        }
        return it;
      });
      localStorage.setItem('tf_my_orders', JSON.stringify(updatedLocal));

      if (returnedStatus === 'REFUNDED') {
        setRefundNotice(
          `Đã hoàn tiền thành công cho đơn #${refundTargetOrder.orderShortId || refundTargetOrder.id}. Tiền đã được hoàn về tài khoản thanh toán ban đầu của bạn.`
        );
      } else {
        setRefundNotice(
          `Yêu cầu hoàn vé cho đơn #${refundTargetOrder.orderShortId || refundTargetOrder.id} đã được tiếp nhận. Cổng thanh toán VNPay đang đối soát và tiến hành chuyển hoàn.`
        );
      }
      setRefundTargetOrder(null);
      setActionError(null);
    } catch (err) {
      setRefundError(err.message || 'Chính sách sự kiện không cho phép hoàn hủy vé vào thời điểm này.');
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="my-tickets-page-container">
      <header className="page-head">
        <h1>Vé của tôi</h1>
      </header>

      {loadError && (
        <div className="alert alert-error mb-125 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="alert-circle" size="xs" ariaHidden />
            <span>{loadError}</span>
          </span>
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={loadOrders}
          >
            Thử lại
          </button>
        </div>
      )}

      {refundNotice && (
        <div className="alert alert-success">
          {refundNotice}
        </div>
      )}

      {actionError && (
        <div className="alert alert-error mb-125 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="alert-circle" size="xs" ariaHidden />
            {actionError}
          </span>
          <button type="button" className="btn-close-alert flex items-center justify-center" onClick={() => setActionError(null)} aria-label="Đóng thông báo">
            <Icon name="x" size="xs" ariaHidden />
          </button>
        </div>
      )}

      {/* Tabs Filter & Search (UI-04: 3 distinct tabs for Active, Processing, and History) */}
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
            className={`tab-btn ${activeTab === 'PROCESSING' ? 'active' : ''}`}
            onClick={() => { setActiveTab('PROCESSING'); setOrderVisibleCount(10); }}
          >
            <span>{t('mytickets.tab_processing', 'Đang xử lý / Đối soát')}</span>
            <span className="tab-count">{filteredProcessingOrders.length}</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
            onClick={() => { setActiveTab('HISTORY'); setOrderVisibleCount(10); }}
          >
            <span>{t('mytickets.tab_history', 'Lịch sử mua hàng')}</span>
            <span className="tab-count">{filteredHistoryOrders.length}</span>
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
        <div className="card loading-state flex flex-col items-center justify-center p-8 text-center">
          <VectorSpinner size={36} />
          <p className="muted mt-3">Đang tải danh sách vé điện tử và mã QR...</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          Lỗi tải đơn hàng: {error}
        </div>
      )}

      {!loading && targetOrders.length === 0 && (
        <div className="card empty-state my-xl text-center p-8">
          <div className="empty-icon">
            <EmptyStateIllustration type="empty-tickets" size={130} />
          </div>
          <h2>Không tìm thấy vé nào phù hợp</h2>
          <p className="muted">
            {orderSearch
              ? `Không có kết quả nào khớp với "${orderSearch}".`
              : activeTab === 'ACTIVE'
              ? 'Bạn hiện không có vé sự kiện nào đang hiệu lực.'
              : activeTab === 'PROCESSING'
              ? 'Không có đơn hàng nào đang trong quá trình xử lý hoặc chờ đối soát.'
              : 'Bạn chưa có đơn hàng nào trong lịch sử mua hàng.'}
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
          const statusInfo = getOrderStatusInfo(order.status);
          const isCancelled = order.status === 'CANCELLED';
          const isRefunded = order.status === 'REFUNDED';
          const isPast = ['REFUNDED', 'CANCELLED', 'EXPIRED'].includes(order.status);

          return (
            <article key={order.id} className={`order-card-wrapper ${isPast ? 'order-card-refunded' : ''}`}>
              <div className="order-summary-band">
                <div className="order-meta-left">
                  <span className="order-ref-code">
                    Mã đơn: <strong>{order.orderShortId || `TF-ORD-${order.id}`}</strong>
                  </span>
                  <span className="order-timestamp">
                    Đặt lúc: {formatDateTime(order.created_at)}
                  </span>
                  <span className={`badge ${statusInfo.badgeClass}`}>
                    {statusInfo.label}
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

                  {/* Self-service Refund / Cancel Button (UI-04: Only for eligible paid orders) */}
                  {statusInfo.isRefundable && (
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
                <h2>{order.event_title || 'Sự kiện Ticketflow'}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs muted mt-1">
                  {order.event_location && <span className="event-loc">📍 {order.event_location}</span>}
                  {order.event_date && <span className="event-date">🗓️ {formatDateTime(order.event_date)}</span>}
                </div>
              </div>

              {/* Order Full Purchase Details Strip */}
              <div className="order-purchase-details-strip flex flex-wrap items-center justify-between gap-sm p-3 my-2 bg-slate-50 dark:bg-slate-800/60 rounded-md text-xs border">
                <div className="flex items-center gap-4 flex-wrap">
                  <span>
                    <strong className="text-muted">Phương thức:</strong>{' '}
                    <span className="font-semibold">
                      {order.paymentMethod || order.payment_method || (order.total === 0 ? 'Miễn phí (0đ)' : 'Cổng trực tuyến VNPay')}
                    </span>
                  </span>
                  {order.subtotal > 0 && order.subtotal !== order.total && (
                    <span>
                      <strong className="text-muted">Tạm tính:</strong>{' '}
                      <span className="font-mono">{money(order.subtotal)}</span>
                    </span>
                  )}
                  {order.discount > 0 && (
                    <span className="text-success font-semibold">
                      <strong>Chiết khấu:</strong> -{money(order.discount)}
                    </span>
                  )}
                  <span>
                    <strong className="text-muted">Số lượng:</strong>{' '}
                    <span className="font-bold">{order.attendees?.length || 1} vé</span>
                  </span>
                </div>
                <div className="text-muted">
                  <span>Tổng thanh toán: <strong className="text-primary font-mono text-sm">{money(order.total)}</strong></span>
                </div>
              </div>

              {/* Tickets List with QR */}
              <div className="order-tickets-list">
                {order.attendees && order.attendees.length > 0 ? (
                  order.attendees.map((att, idx) => {
                    const attCancelled = isCancelled || isRefunded || att.status === 'CANCELLED';
                    const isTicketValid = statusInfo.isTicketActive && !attCancelled;

                  return (
                    <div key={att.id || idx} className={`e-ticket-card ${attCancelled ? 'ticket-cancelled' : ''}`}>
                      <div className="ticket-top-band">
                        <span className="ticket-brand">TICKETFLOW PASS</span>
                        <span className="ticket-tier-badge">{att.tier_name || 'Vé tiêu chuẩn'}</span>
                      </div>

                      <div className="ticket-main-body">
                        <div className="ticket-info-col">
                          <div className="ticket-field">
                            <span className="field-label">NGƯỜI THAM DỰ</span>
                            <span className="field-value">{att.name || 'Khách mời'}</span>
                          </div>

                          <div className="ticket-field">
                            <span className="field-label">EMAIL LIÊN HỆ</span>
                            <span className="field-value font-mono text-sm">{att.email || '—'}</span>
                          </div>

                          <div className="ticket-field">
                            <span className="field-label">QUY CHẾ CHỖ NGỒI</span>
                            <span className="field-value font-bold text-primary">
                              Ghế tự do theo hạng vé (Open Seating)
                            </span>
                          </div>

                          <div className="ticket-field">
                            <span className="field-label">MÃ VÉ</span>
                            <span className="field-value seat-highlight">
                              {isTicketValid ? (att.ticket_code || att.barcode || 'Mã vé đang được khởi tạo...') : '— (Chưa khả dụng)'}
                            </span>
                          </div>

                          <div className="ticket-field">
                            <span className="field-label">TRẠNG THÁI</span>
                            <div>
                              <span className={`badge ${attCancelled ? 'badge-status-suspended badge-danger' : isTicketValid ? 'badge-status-active badge-success' : 'badge-warning'}`}>
                                {attCancelled ? 'Đã hủy' : isTicketValid ? 'Vé hợp lệ' : 'Chờ kích hoạt'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="ticket-qr-col">
                          {isTicketValid && (att.qr_hash || att.ticket_code || att.barcode) ? (
                            <>
                              <QrCodeSvg value={att.qr_hash || att.ticket_code || att.barcode} size={120} />
                              <div className="qr-caption">Quét QR tại cổng</div>
                            </>
                          ) : (
                            <div className="ticket-inactive-box p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-center text-xs text-muted flex flex-col items-center justify-center h-full min-h-120 border">
                              <Icon name="clock" size="sm" className="mb-1 text-muted" ariaHidden />
                              <span>{attCancelled ? 'Vé đã bị hủy' : (isTicketValid ? 'Mã vé chưa phát hành, thử tải lại' : 'Mã vé chưa khả dụng')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border text-xs text-muted flex items-center justify-between">
                  <span>Vé tham dự sự kiện (Đang đồng bộ chi tiết vé)</span>
                  <span className="font-mono font-bold text-primary">{money(order.total)}</span>
                </div>
              )}
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

      {/* Self-service Refund Modal with reusable <Modal> */}
      <Modal
        isOpen={Boolean(refundTargetOrder)}
        onClose={() => { if (!refunding) setRefundTargetOrder(null); }}
        title="Xác nhận hủy vé & hoàn tiền"
        footer={
          <div className="flex justify-end gap-sm w-full">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={refunding}
              onClick={() => setRefundTargetOrder(null)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={refunding}
              onClick={handleConfirmRefund}
            >
              {refunding ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                  <span>Đang xử lý hoàn tiền...</span>
                </span>
              ) : (
                `Xác nhận Hủy & Nhận hoàn ${refundTargetOrder ? money(refundTargetOrder.total) : ''}`
              )}
            </button>
          </div>
        }
      >
        {refundTargetOrder && (
          <div className="stack gap-md">
            {refundError && (
              <div className="alert alert-error" role="alert">
                {refundError}
              </div>
            )}

            <div className="refund-policy-summary">
              <h4 className="font-bold text-sm mb-xs">Thông tin hoàn vé:</h4>
              <ul className="text-sm muted space-y-1">
                <li>• Đơn hàng: <strong>{refundTargetOrder.orderShortId || refundTargetOrder.id}</strong></li>
                <li>• Tổng tiền hoàn: <strong>{money(refundTargetOrder.total)}</strong></li>
                <li>• Điều kiện thời gian: Thực hiện trước ngày diễn ra sự kiện ít nhất 3 ngày.</li>
                <li>• Phương thức hoàn: Hoàn về tài khoản thanh toán ban đầu.</li>
                <li>• Thu hồi vé: Mã QR và chỗ ngồi sẽ bị vô hiệu hóa sau khi hủy.</li>
              </ul>
            </div>

            <div className="form-group mb-0">
              <label htmlFor="refundReasonSelect" className="form-label font-semibold">
                Lý do yêu cầu hủy vé & hoàn tiền:
              </label>
              <select
                id="refundReasonSelect"
                required
                className="select"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                disabled={refunding}
              >
                <option value="Bận việc đột xuất không thể tham dự">Bận việc đột xuất không thể tham dự</option>
                <option value="Thay đổi lịch trình công tác / du lịch">Thay đổi lịch trình công tác / du lịch</option>
                <option value="Đặt nhầm hạng vé / số lượng">Đặt nhầm hạng vé / số lượng</option>
                <option value="Lý do sức khỏe">Lý do sức khỏe</option>
                <option value="Khác">Lý do khác</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyTicketsPage;
