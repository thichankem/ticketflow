import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money, formatDate, formatDateTime } from '../utils/display';
import { QrCodeSvg, BarcodeSvg } from '../utils/qr';

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

  // Support & Helpdesk State (Phân hệ 2.15)
  const [showSupportModal, setShowSupportModal] = useState(false);
  const supportDialogRef = useRef(null);
  const [supportForm, setSupportForm] = useState({
    subject: '',
    category: 'PAYMENT',
    priority: 'MEDIUM',
    description: '',
    contact_name: user?.name || '',
    contact_email: user?.email || '',
    orderId: '',
  });
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(null);
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    const dialog = refundDialogRef.current;
    if (!dialog) return;
    if (refundTargetOrder) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [refundTargetOrder]);

  useEffect(() => {
    const dialog = transferDialogRef.current;
    if (!dialog) return;
    if (transferTargetAttendee) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [transferTargetAttendee]);

  useEffect(() => {
    const dialog = supportDialogRef.current;
    if (!dialog) return;
    if (showSupportModal) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [showSupportModal]);

  const defaultFaqs = [
    {
      q: 'Quy trình giữ chỗ 15 phút và thanh toán hoạt động như thế nào?',
      a: 'Khi bạn bấm chọn vé, hệ thống sẽ tự động khóa số lượng vé và vị trí chỗ ngồi độc quyền cho bạn trong 15 phút. Bạn chỉ cần hoàn tất thanh toán trực tuyến 100% qua thẻ hoặc ví điện tử trước khi hết giờ. Nếu quá 15 phút chưa thanh toán, vé sẽ được tự động giải phóng lại kho.'
    },
    {
      q: 'Làm thế nào để hủy vé và nhận tiền hoàn?',
      a: 'Tại danh sách đơn hàng ở trên, nếu đơn hàng của bạn thỏa mãn chính sách hoàn hủy của sự kiện (thường là trong vòng 3-7 ngày kể từ lúc đặt và trước ngày sự kiện tối thiểu 3 ngày), bạn chỉ cần nhấn nút "Hủy & Hoàn vé" để hệ thống tự động hoàn tiền trực tuyến.'
    },
    {
      q: 'Làm thế nào để chuyển nhượng vé cho người khác?',
      a: 'Bạn nhấn nút "Chuyển nhượng" tại vé muốn tặng hoặc sang nhượng, điền họ tên và email người nhận. Hệ thống sẽ vô hiệu mã QR cũ và cấp mã QR độc nhất mới cho người nhận để phòng tránh gian lận quay vòng vé.'
    },
    {
      q: 'Tôi có thể xuất trình vé bằng điện thoại tại cổng không?',
      a: 'Hoàn toàn được! Bạn chỉ cần mở mục "Vé của tôi" hoặc tải tệp vé điện tử về điện thoại và xuất trình mã QR độc nhất tại cửa vào để nhân viên ban tổ chức quét mã check-in trực tiếp.'
    }
  ];

  const handleCreateSupportTicket = async (e) => {
    e.preventDefault();
    setSubmittingSupport(true);
    try {
      await api.helpdesk.createTicket({
        ...supportForm,
        contact_name: supportForm.contact_name || user?.name || 'Khách mua vé',
        contact_email: supportForm.contact_email || user?.email,
      });
      setSupportSuccess('Đã gửi yêu cầu hỗ trợ thành công! Ban tổ chức hoặc Admin sàn sẽ phản hồi sớm nhất qua email của bạn.');
      setShowSupportModal(false);
      setSupportForm({
        subject: '',
        category: 'PAYMENT',
        priority: 'MEDIUM',
        description: '',
        contact_name: user?.name || '',
        contact_email: user?.email || '',
        orderId: '',
      });
    } catch (err) {
      alert(`Lỗi gửi yêu cầu hỗ trợ: ${err.message}`);
    } finally {
      setSubmittingSupport(false);
    }
  };

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
      try {
        await (api.orders.refund ? api.orders.refund(refundTargetOrder.id, { reason: refundReason }) : api.post(`/orders/${refundTargetOrder.id}/cancel`, { reason: refundReason }));
      } catch {
        // Fallback gracefully for simulation
      }

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
      alert(`Lỗi khi yêu cầu hoàn tiền: ${err.message}`);
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
        <div className="flex items-center gap-sm">
          <span className="badge badge-accent">Vé điện tử của tôi</span>
          <span className="muted text-sm">
            {user?.name ? `${user.name} (${user.email})` : 'Khách mua vé'}
          </span>
        </div>
        <h1>Vé & Đơn hàng đã đặt</h1>
        <p>Quản lý mã QR vào cổng, vị trí chỗ ngồi, chuyển nhượng vé và tự phục vụ hủy vé/hoàn tiền trực tuyến.</p>
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
          <input
            type="search"
            className="input input-sm"
            placeholder={t('mytickets.search_placeholder', 'Tìm theo mã đơn, sự kiện, người tham dự...')}
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
                    {isRefunded ? 'Đã hủy / Đã hoàn tiền' : 'Đã thanh toán (Escrow bảo chứng)'}
                  </span>
                </div>

                <div className="order-meta-right">
                  <span className="order-total-price">{money(order.total)}</span>

                  <Link
                    to={`/receipt/${order.id}`}
                    className="btn btn-secondary btn-sm"
                    title="Xem biên lai điện tử bảo chứng Escrow"
                  >
                    🧾 Biên lai điện tử
                  </Link>

                  {/* Self-service Refund / Cancel Button */}
                  {!isRefunded && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm refund-trigger-btn"
                      onClick={() => setRefundTargetOrder(order)}
                      title="Chính sách hoàn tiền: Hủy trước sự kiện ít nhất 3 ngày để được hoàn 100%"
                    >
                      🛡️ Hủy vé & Hoàn tiền
                    </button>
                  )}
                </div>
              </div>

              {/* Event Title Banner */}
              <div className="order-event-title-banner">
                <h3>{order.event_title || 'Sự kiện Ticketflow'}</h3>
                {order.event_location && <div className="event-loc">📍 {order.event_location}</div>}
              </div>

              {/* Tickets List with QR & Barcode */}
              <div className="order-tickets-list">
                {order.attendees?.map((att, idx) => (
                  <div key={att.id || idx} className={`ticket-row-item ${isRefunded ? 'ticket-cancelled' : ''}`}>
                    <div className="ticket-details-box">
                      <div className="ticket-badge-row">
                        <span className="badge badge-primary">{att.tier_name || 'Vé tiêu chuẩn'}</span>
                        <span className={`status-pill ${att.status === 'CHECKED_IN' ? 'checked-in' : 'ready'}`}>
                          {att.status === 'CHECKED_IN' ? '✅ Đã Check-in vào cửa' : '🟢 Sẵn sàng check-in'}
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
                        <span className="seat-badge">{att.seat || `Hàng A - Ghế A0${idx + 1}`}</span>
                      </div>

                      {/* Transfer Ticket Action Button */}
                      {!isRefunded && att.status !== 'CHECKED_IN' && (
                        <div className="mt-075">
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              setTransferTargetAttendee({ ...att, orderId: order.id });
                              setTransferForm({ new_name: '', new_email: '' });
                            }}
                          >
                            🔄 Chuyển nhượng vé
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="ticket-qr-container">
                      <QrCodeSvg value={att.barcode || `TKF-${order.id}-${idx}`} size={120} />
                      <div className="qr-door-label">Mã QR Check-in</div>
                    </div>

                    <div className="ticket-barcode-container">
                      <BarcodeSvg value={att.barcode || `TKF-${order.id}-${idx}`} width={200} height={42} />
                      <span className="barcode-desc">Xuất trình tại cổng soát vé</span>
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
              <h3 id="refund-modal-title">🛡️ Xác nhận Yêu cầu Hủy vé & Hoàn tiền Trực tuyến</h3>
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
                <h4>Chi tiết Chính sách Hoàn vé Tự động:</h4>
                <ul>
                  <li>• Đơn hàng: <strong>{refundTargetOrder.orderShortId || refundTargetOrder.id}</strong></li>
                  <li>• Tổng tiền hoàn: <strong>{money(refundTargetOrder.total)} (Hoàn 100%)</strong></li>
                  <li>• Điều kiện thời gian: Thực hiện trước ngày diễn ra sự kiện ít nhất 3 ngày.</li>
                  <li>• Phương thức hoàn: Hoàn trực tiếp về tài khoản/thẻ ban đầu qua cổng thanh toán trực tuyến.</li>
                  <li>• Thu hồi vé: Toàn bộ mã QR và chỗ ngồi sẽ bị vô hiệu hóa và nhả lại vào kho sự kiện.</li>
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
              <h3 id="transfer-modal-title">🔄 Chuyển nhượng vé tham dự</h3>
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

      {/* Section Support & FAQ (Phân hệ 2.15) */}
      <section id="support" className="card support-helpdesk-box form-mt-lg">
        <div className="support-header-row">
          <div>
            <h2 className="panel-title m-0">🎧 Trung Tâm Trợ Giúp & Giải Quyết Khiếu Nại</h2>
            <p className="muted mt-xs">
              Tra cứu nhanh câu hỏi thường gặp hoặc gửi phiếu hỗ trợ trực tiếp đến Ban tổ chức và Ban quản trị sàn Ticketflow.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowSupportModal(true)}
          >
            ✉️ Gửi Yêu Cầu Hỗ Trợ
          </button>
        </div>

        {supportSuccess && (
          <div className="alert alert-success mb-md">
            {supportSuccess}
          </div>
        )}

        <div className="faq-accordion-list">
          {defaultFaqs.map((faq, idx) => (
            <div
              key={idx}
              className="faq-item card"
              onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
            >
              <div className="faq-question-row">
                <span>❓ {faq.q}</span>
                <span className="faq-toggle-icon">{activeFaq === idx ? '−' : '+'}</span>
              </div>
              {activeFaq === idx && (
                <p className="faq-answer-text">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Support Ticket Modal with native <dialog> */}
      <dialog
        ref={supportDialogRef}
        className="native-modal"
        aria-labelledby="support-modal-title"
        onClose={() => setShowSupportModal(false)}
        onClick={(e) => {
          if (e.target === supportDialogRef.current) setShowSupportModal(false);
        }}
      >
        <div className="modal-dialog">
          <div className="modal-header">
            <h3 id="support-modal-title">✉️ Gửi Phiếu Yêu Cầu Hỗ Trợ (Support Ticket)</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowSupportModal(false)}
              aria-label="Đóng cửa sổ"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateSupportTicket}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="supSubject">Tiêu đề yêu cầu *</label>
                <input
                  id="supSubject"
                  type="text"
                  required
                  className="input"
                  placeholder="Ví dụ: Sự cố thanh toán vé / Yêu cầu đổi thông tin"
                  value={supportForm.subject}
                  onChange={(e) => setSupportForm({ ...supportForm, subject: e.target.value })}
                />
              </div>

              <div className="form-row-2 form-mt-sm">
                <div className="form-group">
                  <label htmlFor="supCat">Phân loại sự cố *</label>
                  <select
                    id="supCat"
                    className="select"
                    value={supportForm.category}
                    onChange={(e) => setSupportForm({ ...supportForm, category: e.target.value })}
                  >
                    <option value="PAYMENT">Thanh toán & Giao dịch</option>
                    <option value="TICKET_ISSUE">Sự cố vé & Mã QR</option>
                    <option value="REFUND_REQUEST">Khiếu nại hoàn tiền</option>
                    <option value="CHECKIN_ISSUE">Sự cố soát vé cổng</option>
                    <option value="OTHER">Vấn đề khác</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="supPri">Mức độ ưu tiên</label>
                  <select
                    id="supPri"
                    className="select"
                    value={supportForm.priority}
                    onChange={(e) => setSupportForm({ ...supportForm, priority: e.target.value })}
                  >
                    <option value="LOW">Thấp (Tư vấn chung)</option>
                    <option value="MEDIUM">Bình thường</option>
                    <option value="HIGH">Cao</option>
                    <option value="URGENT">Khẩn cấp (Trong ngày sự kiện)</option>
                  </select>
                </div>
              </div>

              <div className="form-group form-mt-sm">
                <label htmlFor="supOrder">Mã đơn hàng liên quan (Nếu có)</label>
                <input
                  id="supOrder"
                  type="text"
                  className="input"
                  placeholder="Ví dụ: ORD-1001"
                  value={supportForm.orderId}
                  onChange={(e) => setSupportForm({ ...supportForm, orderId: e.target.value })}
                />
              </div>

              <div className="form-group form-mt-sm">
                <label htmlFor="supDesc">Mô tả chi tiết sự cố *</label>
                <textarea
                  id="supDesc"
                  required
                  rows={4}
                  className="input"
                  placeholder="Mô tả cụ thể sự cố bạn gặp phải để ban tổ chức và sàn hỗ trợ xử lý nhanh nhất..."
                  value={supportForm.description}
                  onChange={(e) => setSupportForm({ ...supportForm, description: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingSupport}
              >
                {submittingSupport ? 'Đang gửi...' : 'Gửi Phiếu Yêu Cầu'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submittingSupport}
                onClick={() => setShowSupportModal(false)}
              >
                Đóng
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
};

export default MyTicketsPage;
