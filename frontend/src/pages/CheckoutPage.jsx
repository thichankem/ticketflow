import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money } from '../utils/display';
import { QrCodeSvg, BarcodeSvg } from '../utils/qr';

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    cartItems,
    activeOrder,
    remainingSeconds,
    total,
    discountAmount,
    subtotal,
    finalizeCheckout,
    cancelActiveOrder,
  } = useCart();

  const [buyerName, setBuyerName] = useState(user?.name || '');
  const [buyerEmail, setBuyerEmail] = useState(user?.email || '');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD'); // Online only: CARD, VNPAY, MOMO, NAPAS_QR
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completedResult, setCompletedResult] = useState(null);

  // Dynamic individual attendee information list
  const [attendeeForms, setAttendeeForms] = useState([]);

  // Initialize attendee forms based on cartItems
  useEffect(() => {
    const list = [];
    cartItems.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) {
        list.push({
          ticket_tier_id: item.tier.id,
          tier_name: item.tier.name || item.tier.title || 'Vé tiêu chuẩn',
          price: item.tier.price,
          name: i === 0 ? (buyerName || '') : '',
          email: i === 0 ? (buyerEmail || '') : '',
          barcode: `TKF-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`,
        });
      }
    });
    setAttendeeForms(list);
  }, [cartItems]);

  // Keep first attendee synced with buyer
  const handleBuyerNameChange = (val) => {
    setBuyerName(val);
    setAttendeeForms((prev) =>
      prev.map((att, idx) => (idx === 0 ? { ...att, name: val } : att))
    );
  };

  const handleBuyerEmailChange = (val) => {
    setBuyerEmail(val);
    setAttendeeForms((prev) =>
      prev.map((att, idx) => (idx === 0 ? { ...att, email: val } : att))
    );
  };

  const handleAttendeeFieldChange = (index, field, value) => {
    setAttendeeForms((prev) =>
      prev.map((att, i) => (i === index ? { ...att, [field]: value } : att))
    );
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 15-minute countdown progress (15 * 60 = 900 seconds)
  const totalHoldSeconds = 15 * 60;
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / totalHoldSeconds) * 100));

  const handleSubmitCheckout = async (e) => {
    e.preventDefault();
    if (!buyerName || !buyerEmail) {
      setError('Vui lòng cung cấp họ tên và email của người mua vé.');
      return;
    }

    if (!activeOrder?.id) {
      setError('Không tìm thấy phiên giữ vé hợp lệ. Vui lòng quay lại chọn vé.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const attendees = attendeeForms.map((att, i) => ({
        name: att.name?.trim() || `${buyerName} (Người tham dự ${i + 1})`,
        email: att.email?.trim() || buyerEmail,
        ticket_tier_id: att.ticket_tier_id,
        barcode: att.barcode,
      }));

      const res = await finalizeCheckout(
        activeOrder.id,
        { name: buyerName, email: buyerEmail, phone: buyerPhone },
        attendees,
        paymentMethod
      );

      // Save order to localStorage for My Tickets view
      try {
        const orderRecord = {
          order: res.order || { id: activeOrder.id, orderShortId: res.orderShortId || `ORD-${activeOrder.id}`, total },
          attendees: res.attendees || attendees,
          paymentMethod,
          date: new Date().toISOString(),
          status: 'PAID',
        };
        const existing = JSON.parse(localStorage.getItem('tf_my_orders') || '[]');
        localStorage.setItem('tf_my_orders', JSON.stringify([orderRecord, ...existing]));
      } catch {
        // Ignore storage errors
      }

      setCompletedResult({
        ...res,
        attendees: res.attendees || attendees,
        paymentMethod,
      });
    } catch (err) {
      setError(err.message || 'Thanh toán trực tuyến thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Bạn có chắc chắn muốn hủy phiên giữ chỗ và nhả lại vé cho khách khác?')) {
      await cancelActiveOrder();
      navigate('/');
    }
  };

  // SUCCESS / DIGITAL RECEIPT VIEW
  if (completedResult) {
    const { order, attendees } = completedResult;
    const orderCode = order?.orderShortId || `TF-ORD-${order?.id || Date.now().toString().slice(-6)}`;

    return (
      <section className="checkout-success-view">
        <div className="receipt-container">
          <div className="receipt-header">
            <div className="receipt-icon-circle">✓</div>
            <span className="badge badge-success">Thanh toán trực tuyến thành công</span>
            <h1 className="receipt-title">Chúc mừng! Bạn đã sở hữu vé thành công.</h1>
            <p className="receipt-subtitle">
              Mã tra cứu đơn hàng: <strong>{orderCode}</strong> · Đã xác thực bảo chứng Escrow
            </p>
          </div>

          <div className="receipt-notice-bar">
            <span>✉️ Biên lai điện tử và vé đã được gửi tức thì đến email: <strong>{buyerEmail}</strong></span>
          </div>

          <div className="tickets-issued-section">
            <h2 className="section-title">Danh sách Vé điện tử & Mã QR Check-in vào cổng</h2>
            <p className="section-subtitle">
              Mỗi người tham dự sở hữu một mã QR độc nhất kèm vị trí chỗ ngồi cụ thể. Vui lòng xuất trình tại cửa kiểm soát.
            </p>

            <div className="tickets-grid">
              {attendees?.map((att, idx) => (
                <div key={att.id || idx} className="e-ticket-card">
                  <div className="ticket-top-band">
                    <span className="ticket-brand">TICKETFLOW PASS</span>
                    <span className="ticket-tier-badge">{att.tier_name || 'Vé tiêu chuẩn'}</span>
                  </div>

                  <div className="ticket-main-body">
                    <div className="ticket-info-col">
                      <div className="ticket-field">
                        <span className="field-label">NGƯỜI THAM DỰ</span>
                        <span className="field-value">{att.name || buyerName}</span>
                      </div>
                      <div className="ticket-field">
                        <span className="field-label">VỊ TRÍ CHỖ NGỒI</span>
                        <span className="field-value font-bold text-primary">
                          {att.seat || (activeOrder?.seats && activeOrder.seats[idx]) || 'Khu vực tự do'}
                        </span>
                      </div>
                      <div className="ticket-field">
                        <span className="field-label">MÃ VÉ ĐIỆN TỬ</span>
                        <span className="field-value seat-highlight">{att.barcode || `TKF-${orderCode}-${idx + 1}`}</span>
                      </div>
                      <div className="ticket-field">
                        <span className="field-label">TRẠNG THÁI</span>
                        <span className="badge badge-success">Hợp lệ · Sẵn sàng check-in</span>
                      </div>
                    </div>

                    <div className="ticket-qr-col">
                      <QrCodeSvg value={att.barcode || `TKF-${orderCode}-${idx}`} size={130} />
                      <div className="qr-caption">Quét QR tại cổng</div>
                    </div>
                  </div>

                  <div className="ticket-barcode-footer">
                    <BarcodeSvg value={att.barcode || `TKF-${orderCode}-${idx}`} height={42} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="receipt-actions">
            <Link to={`/receipt/${order?.id}`} className="btn btn-secondary">
              🧾 Xem & In Biên lai điện tử
            </Link>
            <Link to="/my-tickets" className="btn btn-primary btn-lg">
              🎟️ Quản lý đơn hàng trong "Vé của tôi"
            </Link>
            <Link to="/" className="btn btn-secondary">
              Quay lại trang sự kiện
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // EMPTY STATE
  if (!activeOrder && cartItems.length === 0) {
    return (
      <section className="card empty-state empty-state-card">
        <div className="empty-icon">🛒</div>
        <h2>{t('checkout.empty_title', 'Giỏ vé của bạn đang trống')}</h2>
        <p className="muted">
          {t('checkout.empty_desc', 'Bạn chưa chọn vé hoặc phiên giữ chỗ đã hết hạn. Hãy chọn vé tại trang chi tiết sự kiện để giữ chỗ.')}
        </p>
        <Link to="/" className="btn btn-primary">{t('checkout.empty_btn', 'Khám phá các sự kiện')}</Link>
      </section>
    );
  }

  return (
    <section className="checkout-layout">
      {/* 15-Minute Countdown Timer & Progress Bar */}
      {remainingSeconds > 0 && (
        <div className={`hold-timer-card ${remainingSeconds < 180 ? 'timer-urgent' : ''}`}>
          <div className="timer-header-flex">
            <div className="timer-status">
              <span className="pulse-indicator" />
              <div>
                <strong>{t('checkout.exclusive_hold', 'Vé & Chỗ ngồi đang được giữ độc quyền cho bạn')}</strong>
                <span className="timer-desc">
                  {t('checkout.exclusive_hold_desc', 'Chỗ ngồi đã được khóa an toàn. Vui lòng hoàn tất thanh toán trước khi hết giờ.')}
                </span>
              </div>
            </div>

            <div className="timer-clock-badge">
              <span className="clock-icon">⏱️</span>
              <span className="clock-digits">{formatTimer(remainingSeconds)}</span>
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
              {t('checkout.cancel_hold', 'Hủy giữ chỗ')}
            </button>
          </div>

          {/* Animated Progress Bar */}
          <div className="timer-progress-track">
            <progress
              className={`timer-progress-bar ${
                remainingSeconds < 180 ? 'progress-red' : remainingSeconds < 360 ? 'progress-amber' : 'progress-green'
              }`}
              value={progressPercent}
              max={100}
              aria-label="Thời gian giữ chỗ còn lại"
            />
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="checkout-split">
        {/* Main Form */}
        <form onSubmit={handleSubmitCheckout} className="card checkout-main-form">
          <h1 className="panel-title">{t('checkout.title', 'Thông tin Người mua & Người tham dự')}</h1>
          <p className="panel-subtitle">
            {t('checkout.subtitle', 'Hệ thống chỉ chấp nhận thanh toán trực tuyến tức thì 100% để đảm bảo giải phóng vé giữ chỗ tự động và chống đầu cơ.')}
          </p>

          <fieldset className="form-fieldset">
            <legend className="fieldset-legend">{t('checkout.step_buyer', '1. Thông tin người đặt vé (Chủ đơn hàng)')}</legend>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="buyerName">{t('checkout.buyer_name', 'Họ và tên *')}</label>
                <input
                  id="buyerName"
                  type="text"
                  className="input"
                  required
                  autoComplete="name"
                  value={buyerName}
                  onChange={(e) => handleBuyerNameChange(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                />
              </div>

              <div className="form-group">
                <label htmlFor="buyerEmail">{t('checkout.buyer_email', 'Email nhận vé & hóa đơn *')}</label>
                <input
                  id="buyerEmail"
                  type="email"
                  className="input"
                  required
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  value={buyerEmail}
                  onChange={(e) => handleBuyerEmailChange(e.target.value)}
                  placeholder="nguyenvana@gmail.com"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="buyerPhone">{t('checkout.buyer_phone', 'Số điện thoại liên hệ *')}</label>
              <input
                id="buyerPhone"
                type="tel"
                className="input"
                required
                autoComplete="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="0912 345 678"
              />
            </div>
          </fieldset>

          {/* Individual Attendee Details */}
          <fieldset className="form-fieldset">
            <legend className="fieldset-legend">
              {t('checkout.step_attendees', '2. Danh sách người tham dự')} ({attendeeForms.length} vé)
            </legend>
            <p className="fieldset-help">
              Mỗi vé sẽ được phát hành mã QR và mã vạch độc nhất cho từng người tham dự.
            </p>

            <div className="attendee-subforms-stack">
              {attendeeForms.map((att, idx) => (
                <div key={idx} className="attendee-subcard">
                  <div className="attendee-subcard-header">
                    <span className="attendee-index-badge">Người tham dự #{idx + 1}</span>
                    <span className="attendee-tier-name">{att.tier_name}</span>
                    {(activeOrder?.seats && activeOrder.seats[idx]) && (
                      <span className="badge badge-primary seat-highlight-badge">
                        💺 Ghế: {activeOrder.seats[idx]}
                      </span>
                    )}
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor={`att-name-${idx}`}>Họ và tên người đi:</label>
                      <input
                        id={`att-name-${idx}`}
                        type="text"
                        className="input input-sm"
                        required
                        autoComplete="name"
                        value={att.name}
                        onChange={(e) => handleAttendeeFieldChange(idx, 'name', e.target.value)}
                        placeholder="Họ và tên"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`att-email-${idx}`}>Email người đi (để nhận vé riêng):</label>
                      <input
                        id={`att-email-${idx}`}
                        type="email"
                        className="input input-sm"
                        required
                        autoComplete="email"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck="false"
                        value={att.email}
                        onChange={(e) => handleAttendeeFieldChange(idx, 'email', e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {/* Payment Method - Online-only Selection */}
          <fieldset className="form-fieldset">
            <legend className="fieldset-legend">
              {t('checkout.step_payment', '3. Phương thức thanh toán trực tuyến (Online-only)')}
            </legend>

            {total === 0 ? (
              <div className="alert alert-success">
                🎉 {t('checkout.complete_free', 'Đơn hàng của bạn có tổng trị giá 0 đ (Vé miễn phí). Bạn sẽ nhận vé ngay lập tức mà không cần thanh toán!')}
              </div>
            ) : (
              <div className="payment-options-grid">
                <label className={`payment-method-card ${paymentMethod === 'CARD' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="CARD"
                    checked={paymentMethod === 'CARD'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <div className="payment-method-body">
                    <div className="payment-title">💳 {t('checkout.pay_card', 'Thẻ Quốc tế (Visa / Master / JCB)')}</div>
                    <div className="payment-desc">Cổng thanh toán bảo mật chuẩn 3D-Secure quốc tế</div>
                  </div>
                </label>

                <label className={`payment-method-card ${paymentMethod === 'VNPAY' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="VNPAY"
                    checked={paymentMethod === 'VNPAY'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <div className="payment-method-body">
                    <div className="payment-title">📱 {t('checkout.pay_vnpay', 'Cổng VNPay QR / Ví VNPay')}</div>
                    <div className="payment-desc">Quét mã QR bằng App 30+ Ngân hàng hàng đầu</div>
                  </div>
                </label>

                <label className={`payment-method-card ${paymentMethod === 'MOMO' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="MOMO"
                    checked={paymentMethod === 'MOMO'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <div className="payment-method-body">
                    <div className="payment-title">👛 {t('checkout.pay_momo', 'Ví điện tử MoMo')}</div>
                    <div className="payment-desc">Thanh toán siêu tốc liên kết ví MoMo</div>
                  </div>
                </label>

                <label className={`payment-method-card ${paymentMethod === 'NAPAS_QR' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="NAPAS_QR"
                    checked={paymentMethod === 'NAPAS_QR'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <div className="payment-method-body">
                    <div className="payment-title">🏦 {t('checkout.pay_napas', 'Chuyển khoản QR Napas 247')}</div>
                    <div className="payment-desc">Tự động khớp lệnh tức thì 24/7 qua mã QR động</div>
                  </div>
                </label>
              </div>
            )}
          </fieldset>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={submitting}
          >
            {submitting ? (
              <span>{t('checkout.pay_connecting', 'Đang kết nối cổng thanh toán an toàn...')}</span>
            ) : total === 0 ? (
              t('checkout.complete_free', 'Hoàn tất đăng ký vé miễn phí (0 đ) ngay')
            ) : (
              `${t('checkout.pay_online_btn', 'Thanh toán trực tuyến & Nhận vé ngay')} (${money(total)})`
            )}
          </button>

          <p className="escrow-safe-guarantee">
            🔒 <strong>Dòng tiền bảo chứng Escrow:</strong> 100% thanh toán được tạm giữ an toàn bởi sàn Ticketflow
            và chỉ giải ngân cho ban tổ chức sau khi sự kiện kết thúc thành công.
          </p>
        </form>

        {/* Sidebar Summary */}
        <aside className="checkout-summary-sidebar">
          <div className="card ticket-stub">
            <h2 className="panel-title">{t('checkout.summary_title', 'Tóm tắt đơn hàng')}</h2>
            <div className="stub-ticket-lines">
              {cartItems.map((it) => (
                <div key={it.tier.id} className="stub-line">
                  <span>{it.quantity}× {it.tier.name || it.tier.title}</span>
                  <strong>{money(it.tier.price * it.quantity)}</strong>
                </div>
              ))}
            </div>

            <div className="stub-rule" />

            <div className="stub-line">
              <span className="muted">{t('checkout.subtotal', 'Tạm tính:')}</span>
              <span>{money(subtotal)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="stub-line note good">
                <span>Ưu đãi giảm giá:</span>
                <span>−{money(discountAmount)}</span>
              </div>
            )}

            <div className="total-due-row">
              <div className="total-label">{t('checkout.total_due', 'Tổng tiền thanh toán:')}</div>
              <div className="total-amount">{money(total)}</div>
            </div>

            <div className="stub-perforated-edge" />

            <div className="security-badges-list">
              <div className="sec-item">🛡️ Bảo đảm giữ chỗ 15 phút</div>
              <div className="sec-item">💺 Tự động xếp ghế liền kề</div>
              <div className="sec-item">📲 QR code độc nhất chống vé trùng</div>
              <div className="sec-item">🔄 Tự phục vụ hoàn tiền theo chính sách</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CheckoutPage;
