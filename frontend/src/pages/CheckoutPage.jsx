import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money } from '../utils/display';
import { QrCodeSvg } from '../utils/qr';

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
          ticket_code: `TKF-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`,
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
        ticket_code: att.ticket_code || att.barcode,
        barcode: att.barcode || att.ticket_code,
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
            <span className="badge badge-success">Thanh toán thành công</span>
            <h1 className="receipt-title">Đặt vé thành công</h1>
            <p className="receipt-subtitle">
              Mã đơn hàng: <strong>{orderCode}</strong>
            </p>
          </div>

          <div className="receipt-notice-bar">
            <span>Vé đã được gửi đến email: <strong>{buyerEmail}</strong></span>
          </div>

          <div className="tickets-issued-section">
            <h2 className="section-title">Vé điện tử</h2>

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
                        <span className="field-label">QUY CHẾ CHỖ NGỒI</span>
                        <span className="field-value font-bold text-primary">
                          Ghế tự do theo hạng vé (Open Seating)
                        </span>
                      </div>
                      <div className="ticket-field">
                        <span className="field-label">MÃ VÉ</span>
                        <span className="field-value seat-highlight">{att.ticket_code || att.barcode || `TKF-${orderCode}-${idx + 1}`}</span>
                      </div>
                      <div className="ticket-field">
                        <span className="field-label">TRẠNG THÁI</span>
                        <span className="badge badge-success">Vé hợp lệ</span>
                      </div>
                    </div>

                    <div className="ticket-qr-col">
                      <QrCodeSvg value={att.ticket_code || att.barcode || `TKF-${orderCode}-${idx}`} size={130} />
                      <div className="qr-caption">Quét QR tại cổng</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="receipt-actions">
            <Link to={`/receipt/${order?.id}`} className="btn btn-secondary">
              Xem biên lai
            </Link>
            <Link to="/my-tickets" className="btn btn-primary btn-lg">
              Vé của tôi
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
        <h2>{t('checkout.empty_title', 'Giỏ vé đang trống')}</h2>
        <p className="muted">
          {t('checkout.empty_desc', 'Bạn chưa chọn vé hoặc phiên đặt vé đã hết hạn.')}
        </p>
        <Link to="/" className="btn btn-primary">{t('checkout.empty_btn', 'Khám phá sự kiện')}</Link>
      </section>
    );
  }

  return (
    <section className="checkout-layout">
      {/* Countdown Timer & Progress Bar */}
      {remainingSeconds > 0 && (
        <div className={`hold-timer-card ${remainingSeconds < 180 ? 'timer-urgent' : ''}`}>
          <div className="timer-header-flex">
            <div className="timer-status">
              <span className="pulse-indicator" />
              <div>
                <strong>Thời gian thanh toán còn lại: <span className="clock-digits">{formatTimer(remainingSeconds)}</span></strong>
              </div>
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
              {t('checkout.cancel_hold', 'Hủy giữ chỗ')}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="timer-progress-track">
            <progress
              className={`timer-progress-bar ${
                remainingSeconds < 180 ? 'progress-red' : remainingSeconds < 360 ? 'progress-amber' : 'progress-green'
              }`}
              value={progressPercent}
              max={100}
              aria-label="Thời gian thanh toán còn lại"
            />
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="checkout-split">
        {/* Main Form */}
        <form onSubmit={handleSubmitCheckout} className="card checkout-main-form">
          <h1 className="panel-title">{t('checkout.title', 'Thông tin đặt vé')}</h1>

          <fieldset className="form-fieldset">
            <legend className="fieldset-legend">{t('checkout.step_buyer', '1. Thông tin người đặt vé')}</legend>
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
                <label htmlFor="buyerEmail">{t('checkout.buyer_email', 'Email nhận vé *')}</label>
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
              <label htmlFor="buyerPhone">{t('checkout.buyer_phone', 'Số điện thoại *')}</label>
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

            <div className="attendee-subforms-stack">
              {attendeeForms.map((att, idx) => (
                <div key={idx} className="attendee-subcard">
                  <div className="attendee-subcard-header">
                    <span className="attendee-index-badge">Người tham dự #{idx + 1}</span>
                    <span className="attendee-tier-name">{att.tier_name}</span>
                    <span className="badge badge-info seat-highlight-badge">
                      Open Seating
                    </span>
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
                      <label htmlFor={`att-email-${idx}`}>Email người đi:</label>
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

          {/* Payment Method Selection */}
          <fieldset className="form-fieldset">
            <legend className="fieldset-legend">
              {t('checkout.step_payment', '3. Phương thức thanh toán')}
            </legend>

            {total === 0 ? (
              <div className="alert alert-success">
                {t('checkout.free_alert', 'Đơn hàng của bạn có tổng trị giá 0 đ (Vé miễn phí). Bạn sẽ nhận vé ngay lập tức mà không cần thanh toán!')}
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
                    <div className="payment-title">{t('checkout.card_title', 'Thẻ quốc tế (Visa / MasterCard / JCB)')}</div>
                    <div className="payment-desc">{t('checkout.card_desc', 'Thanh toán qua thẻ tín dụng hoặc ghi nợ')}</div>
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
                    <div className="payment-title">{t('checkout.vnpay_title', 'VNPay')}</div>
                    <div className="payment-desc">{t('checkout.vnpay_desc', 'Quét mã QR hoặc ví VNPay')}</div>
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
                    <div className="payment-title">{t('checkout.momo_title', 'Ví MoMo')}</div>
                    <div className="payment-desc">{t('checkout.momo_desc', 'Thanh toán qua ứng dụng MoMo')}</div>
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
                    <div className="payment-title">{t('checkout.napas_title', 'Chuyển khoản Napas 247')}</div>
                    <div className="payment-desc">{t('checkout.napas_desc', 'Quét mã QR chuyển khoản')}</div>
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
              <span>{t('checkout.submit_processing', 'Đang xử lý thanh toán...')}</span>
            ) : total === 0 ? (
              t('checkout.submit_free', 'Xác nhận đăng ký vé miễn phí')
            ) : (
              `${t('checkout.submit_pay', 'Thanh toán')} (${money(total)})`
            )}
          </button>
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
                <span>{t('event.summary_discount', 'Mã giảm giá')}:</span>
                <span>−{money(discountAmount)}</span>
              </div>
            )}

            <div className="total-due-row">
              <div className="total-label">{t('checkout.total_due', 'Tổng thanh toán:')}</div>
              <div className="total-amount">{money(total)}</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CheckoutPage;
