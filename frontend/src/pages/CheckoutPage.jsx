import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { money } from '../utils/display';
import { QrCodeSvg } from '../utils/qr';
import { Icon } from '../components/ui/Icon';
import { SuccessVectorAnimation, PendingPaymentAnimation } from '../components/ui/VectorAnimation';
import { EmptyStateIllustration } from '../components/ui/EmptyStateIllustration';
import { ConfirmModal } from '../components/common/ConfirmModal';

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
    initiatePayment,
    guestToken,
  } = useCart();

  const [buyerName, setBuyerName] = useState(user?.name || '');
  const [buyerEmail, setBuyerEmail] = useState(user?.email || '');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [phoneError, setPhoneError] = useState(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  // UI-01: Only offer supported gateways (VNPAY, and FREE for zero-total orders)
  const [paymentMethod, setPaymentMethod] = useState(total === 0 ? 'FREE' : 'VNPAY');
  const [submitting, setSubmitting] = useState(false);
  const processing = submitting;
  const [error, setError] = useState(null);
  const [completedResult, setCompletedResult] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (total === 0) {
      setPaymentMethod('FREE');
    } else if (paymentMethod === 'FREE') {
      setPaymentMethod('VNPAY');
    }
  }, [total]);

  const VN_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;

  const validatePhone = (val) => {
    const cleaned = (val || '').trim().replace(/[\s.-]+/g, '');
    if (!cleaned) {
      setPhoneError('Vui lòng nhập số điện thoại nhận vé.');
      return false;
    }
    if (!VN_PHONE_REGEX.test(cleaned)) {
      setPhoneError('Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (ví dụ: 0912345678 hoặc +84912345678).');
      return false;
    }
    setPhoneError(null);
    return true;
  };

  const handlePhoneChange = (val) => {
    setBuyerPhone(val);
    if (phoneTouched) {
      validatePhone(val);
    }
  };

  const handlePhoneBlur = () => {
    setPhoneTouched(true);
    validatePhone(buyerPhone);
  };

  // Dynamic individual attendee information list
  const [attendeeForms, setAttendeeForms] = useState([]);

  // Initialize attendee forms based on cartItems (UI-23 & V12-14: Key by stable {tierId, unitIndex})
  useEffect(() => {
    setAttendeeForms((prev) => {
      const existingByKey = new Map();
      const countByTier = new Map();
      prev.forEach((att) => {
        const tierId = att.ticket_tier_id;
        const currentCount = countByTier.get(tierId) || 0;
        existingByKey.set(`${tierId}_${currentCount}`, att);
        countByTier.set(tierId, currentCount + 1);
      });

      const list = [];
      let globalIndex = 0;
      cartItems.forEach((item) => {
        const tierId = item.tier.id;
        for (let i = 0; i < item.quantity; i++) {
          const key = `${tierId}_${i}`;
          const existing = existingByKey.get(key);
          const defaultName = globalIndex === 0 ? (buyerName || '') : '';
          const defaultEmail = globalIndex === 0 ? (buyerEmail || '') : '';
          list.push({
            slot_id: key,
            unit_index: i,
            ticket_tier_id: tierId,
            tier_name: item.tier.name || item.tier.title || 'Vé tiêu chuẩn',
            price: item.tier.price,
            name: existing && existing.name ? existing.name : defaultName,
            email: existing && existing.email ? existing.email : defaultEmail,
          });
          globalIndex++;
        }
      });
      return list;
    });
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

  const checkOrderStatus = async (orderId) => {
    if (!orderId || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const token =
        completedResult?.session_token ||
        guestToken ||
        (typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(`tf_guest_token_${orderId}`) || sessionStorage.getItem('tf_active_guest_token')
          : null);
      const orderRes = await api.orders.getById(orderId, token);
      const updatedStatus = orderRes?.status || orderRes?.order?.status;
      if (updatedStatus === 'PAID' || updatedStatus === 'COMPLETED' || updatedStatus === 'CONFIRMED') {
        setCompletedResult((prev) => ({
          ...prev,
          order: orderRes.order || orderRes,
          attendees: orderRes.attendees || prev.attendees,
          isPendingPayment: false,
          status: 'PAID',
        }));
      }
    } catch (err) {
      console.warn('[CheckoutPage] Status check error:', err.message);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Auto-polling for pending payments (UI-11)
  useEffect(() => {
    if (!completedResult?.isPendingPayment || !completedResult?.order?.id) return;
    const orderId = completedResult.order.id;
    let pollCount = 0;
    const maxPolls = 15; // 45 seconds total
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(interval);
        return;
      }
      try {
        const token =
          completedResult?.session_token ||
          guestToken ||
          (typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(`tf_guest_token_${orderId}`) || sessionStorage.getItem('tf_active_guest_token')
            : null);
        const orderRes = await api.orders.getById(orderId, token);
        const st = orderRes?.status || orderRes?.order?.status;
        if (st === 'PAID' || st === 'COMPLETED' || st === 'CONFIRMED') {
          clearInterval(interval);
          setCompletedResult((prev) => ({
            ...prev,
            order: orderRes.order || orderRes,
            attendees: orderRes.attendees || prev.attendees,
            isPendingPayment: false,
            status: 'PAID',
          }));
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [completedResult?.isPendingPayment, completedResult?.order?.id, completedResult?.session_token, guestToken]);

  const handleSubmitCheckout = async (e) => {
    e.preventDefault();
    if (submitting || processing) return;

    if (!buyerName?.trim() || !buyerEmail?.trim()) {
      setError('Vui lòng cung cấp họ tên và email của người mua vé.');
      return;
    }

    setPhoneTouched(true);
    const isPhoneValid = validatePhone(buyerPhone);
    if (!isPhoneValid) {
      setError('Vui lòng kiểm tra lại số điện thoại người mua vé.');
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

      const sessionToken = res.session_token || res.order?.session_token || guestToken || null;
      let paymentUrl = null;

      const isPending = res.status === 'PENDING_PAYMENT' || res.order?.status === 'PENDING_PAYMENT' || (total > 0 && paymentMethod !== 'FREE');
      if (isPending && paymentMethod !== 'FREE') {
        try {
          const payRes = await initiatePayment(activeOrder.id, paymentMethod);
          if (payRes?.payment_url) {
            paymentUrl = payRes.payment_url;
          }
        } catch (payErr) {
          console.warn('[CheckoutPage] initiatePayment error:', payErr.message);
        }
      }

      // Save order to localStorage for My Tickets view (UI-22)
      try {
        const orderStatus = res.order?.status === 'COMPLETED' ? 'PAID' : (res.status || res.order?.status || (isPending ? 'PENDING_PAYMENT' : 'PAID'));
        const orderRecord = {
          id: activeOrder.id,
          orderShortId: res.orderShortId || res.order?.orderShortId || `TF-ORD-${activeOrder.id}`,
          event_id: activeOrder.event_id || activeOrder.eventId,
          event_title: activeOrder.event_title || activeOrder.title || 'Sự kiện Ticketflow',
          event_location: activeOrder.event_location || activeOrder.location || '',
          event_date: activeOrder.event_date || activeOrder.starts_at || null,
          subtotal: activeOrder.subtotal || total,
          discount: activeOrder.discount || 0,
          total: total,
          attendees: res.attendees || attendees,
          paymentMethod: paymentMethod || 'VNPAY',
          payment_method: paymentMethod || 'VNPAY',
          created_at: new Date().toISOString(),
          status: orderStatus,
          session_token: sessionToken,
          order: res.order || { id: activeOrder.id, orderShortId: res.orderShortId || `TF-ORD-${activeOrder.id}`, total },
        };
        const existing = JSON.parse(localStorage.getItem('tf_my_orders') || '[]');
        const filtered = existing.filter((it) => String(it.id || it.order?.id) !== String(activeOrder.id));
        localStorage.setItem('tf_my_orders', JSON.stringify([orderRecord, ...filtered]));
      } catch {
        // Ignore storage errors
      }

      setCompletedResult({
        ...res,
        payment_url: paymentUrl,
        session_token: sessionToken,
        attendees: res.attendees || attendees,
        paymentMethod,
        isPendingPayment: isPending,
      });
    } catch (err) {
      setError(err.message || 'Thanh toán trực tuyến thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelClick = () => {
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    setShowCancelModal(false);
    await cancelActiveOrder();
    navigate('/');
  };

  // SUCCESS / DIGITAL RECEIPT VIEW
  if (completedResult) {
    const { order, attendees } = completedResult;
    const orderCode = order?.orderShortId || `TF-ORD-${order?.id || Date.now().toString().slice(-6)}`;

    return (
      <section className="checkout-success-view">
        <div className="receipt-container">
          <div className="receipt-header">
            <div className="receipt-icon-circle flex items-center justify-center mb-2" style={{ background: 'none', border: 'none', width: 'auto', height: 'auto' }}>
              {completedResult.isPendingPayment ? (
                <PendingPaymentAnimation size={56} />
              ) : (
                <SuccessVectorAnimation size={56} />
              )}
            </div>
            {completedResult.isPendingPayment ? (
              <>
                <span className="badge badge-warning">Đang chờ thanh toán trực tuyến</span>
                <h1 className="receipt-title">Đơn hàng đã được ghi nhận</h1>
              </>
            ) : (
              <>
                <span className="badge badge-success">Thanh toán thành công</span>
                <h1 className="receipt-title">Đặt vé thành công</h1>
              </>
            )}
            <p className="receipt-subtitle">
              Mã đơn hàng: <strong>{orderCode}</strong>
            </p>
          </div>

          {completedResult.isPendingPayment ? (
            <div className="pending-payment-box text-center p-6 bg-base-200 rounded-xl my-4">
              <div className="alert alert-warning mb-4">
                <span>
                  Đơn hàng của bạn đã được ghi nhận và giữ chỗ trong <strong>15 phút</strong>.
                  Vui lòng hoàn tất thanh toán trực tuyến để nhận vé điện tử chính thức.
                </span>
              </div>
              <div className="order-summary-card bg-base-100 p-4 rounded-lg shadow-sm max-w-md mx-auto mb-6 text-left border">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted">Mã đơn hàng:</span>
                  <strong>{orderCode}</strong>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted">Tổng tiền thanh toán:</span>
                  <strong className="text-primary">{money(order?.total_gross || order?.total || 0)}</strong>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted">Trạng thái:</span>
                  <span className="badge badge-warning">Đang chờ cổng thanh toán xác nhận</span>
                </div>
              </div>
              <p className="text-sm text-muted mb-4">
                Vé điện tử chính thức và mã QR vé sẽ được kích hoạt ngay khi hệ thống nhận được thông báo thanh toán thành công.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                {completedResult.payment_url ? (
                  <a
                    href={completedResult.payment_url}
                    className="btn btn-primary btn-lg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở cổng thanh toán VNPay
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={async () => {
                      try {
                        const payRes = await initiatePayment(order?.id, completedResult.paymentMethod || 'VNPAY');
                        if (payRes?.payment_url) {
                          setCompletedResult((prev) => ({ ...prev, payment_url: payRes.payment_url }));
                          window.open(payRes.payment_url, '_blank', 'noopener,noreferrer');
                        }
                      } catch (err) {
                        setError('Không thể mở cổng thanh toán: ' + (err.message || 'Lỗi kết nối'));
                      }
                    }}
                  >
                    Mở cổng thanh toán VNPay
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-lg"
                  onClick={() => checkOrderStatus(order?.id)}
                  disabled={checkingStatus}
                >
                  {checkingStatus ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}
                </button>
                <Link to="/" className="btn btn-secondary">
                  Trang chủ
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="receipt-notice-bar">
                <span>Vé đã được gửi đến email: <strong>{buyerEmail}</strong></span>
              </div>

              <div className="tickets-issued-section">
                <h2 className="section-title">Vé điện tử chính thức</h2>

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
            </>
          )}
        </div>
      </section>
    );
  }

  // EMPTY STATE
  if (!activeOrder && cartItems.length === 0) {
    return (
      <section className="card empty-state empty-state-card text-center p-8">
        <EmptyStateIllustration type="empty-cart" size={120} />
        <h1>{t('checkout.empty_title', 'Giỏ vé đang trống')}</h1>
        <p className="muted">
          {t('checkout.empty_desc', 'Bạn chưa chọn vé hoặc phiên đặt vé đã hết hạn.')}
        </p>
        <Link to="/" className="btn btn-primary mt-3">{t('checkout.empty_btn', 'Khám phá sự kiện')}</Link>
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

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancelClick}>
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
                className={`input ${phoneError ? 'input-error' : ''}`}
                required
                autoComplete="tel"
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? 'buyer-phone-error' : undefined}
                value={buyerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="0912 345 678"
              />
              {phoneError && (
                <span id="buyer-phone-error" className="form-error text-danger" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.85rem' }}>
                  {phoneError}
                </span>
              )}
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

          {/* Payment Method Selection (UI-01: Supported online gateways only) */}
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
                <label className="payment-method-card selected">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="VNPAY"
                    checked={paymentMethod === 'VNPAY'}
                    onChange={() => setPaymentMethod('VNPAY')}
                  />
                  <div className="payment-method-body">
                    <div className="payment-title font-bold flex items-center gap-2">
                      <span>Cổng Thanh Toán Trực Tuyến VNPay</span>
                      <span className="badge badge-primary text-xs">Chính thức</span>
                    </div>
                    <div className="payment-desc text-sm text-muted mt-1">
                      Hỗ trợ Thẻ ATM nội địa, Thẻ quốc tế (Visa / MasterCard / JCB) và ứng dụng ngân hàng quét VNPay-QR.
                    </div>
                  </div>
                </label>
              </div>
            )}
          </fieldset>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={submitting || processing}
          >
            {submitting || processing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-sm" aria-hidden="true" style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                <span>{t('checkout.submit_processing', 'Đang xử lý thanh toán...')}</span>
              </span>
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
                  <span>{it.quantity}x {it.tier.name || it.tier.title}</span>
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

      <ConfirmModal
        isOpen={showCancelModal}
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelModal(false)}
        title={t('checkout.cancel_modal_title', 'Hủy Giữ Chỗ')}
        message={t('checkout.cancel_modal_msg', 'Bạn có chắc chắn muốn hủy phiên giữ chỗ và nhả lại vé cho khách khác? Toàn bộ vé trong giỏ sẽ được hoàn trả lại hệ thống.')}
        confirmText={t('checkout.confirm_cancel', 'Đồng ý hủy')}
        cancelText={t('checkout.keep_holding', 'Tiếp tục giữ vé')}
        variant="danger"
      />
    </section>
  );
};

export default CheckoutPage;
