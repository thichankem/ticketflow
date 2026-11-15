import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { formatRange, money, toneClass } from '../utils/display';
import { getDistanceInfo } from '../utils/location';

export const EventDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { cartItems, updateQuantity, applyPromoCode, reserveTickets, promoCode, discountAmount, total } = useCart();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoStatus, setPromoStatus] = useState(null);
  const [reserving, setReserving] = useState(false);

  // PDF viewer modal state with native <dialog> ref
  const [showPdfModal, setShowPdfModal] = useState(false);
  const pdfDialogRef = useRef(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [restockNotice, setRestockNotice] = useState(false);
  const [seatMapImgError, setSeatMapImgError] = useState(false);

  const userProvince = localStorage.getItem('tf_user_province') || 'Hà Nội';

  useEffect(() => {
    const dialog = pdfDialogRef.current;
    if (!dialog) return;
    if (showPdfModal) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [showPdfModal]);

  useEffect(() => {
    let isMounted = true;
    const fetchEvent = async () => {
      try {
        const res = await api.get(`/events/${id}`);
        if (isMounted) {
          const ev = res.event || res;
          setEvent(ev);

          // Check if favorited
          const favs = JSON.parse(localStorage.getItem('tf_favorites') || '[]');
          setIsFavorited(favs.includes(Number(id)) || favs.includes(String(id)));
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchEvent();
    return () => { isMounted = false; };
  }, [id]);

  const handleToggleFavorite = () => {
    const favs = JSON.parse(localStorage.getItem('tf_favorites') || '[]');
    let next;
    if (isFavorited) {
      next = favs.filter((it) => String(it) !== String(id));
      setIsFavorited(false);
    } else {
      next = [...favs, Number(id)];
      setIsFavorited(true);
      setRestockNotice(true);
      setTimeout(() => setRestockNotice(false), 5000);
    }
    localStorage.setItem('tf_favorites', JSON.stringify(next));

    // Persist favorite to backend for restock notifications (Phân hệ 2.6)
    api.post(`/events/${id}/favorite`, {}).catch(() => {});
  };

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    try {
      setPromoStatus('Đang kiểm tra mã ưu đãi...');
      const res = await applyPromoCode(id, promoInput.trim().toUpperCase());
      setPromoStatus(`Áp dụng thành công! Tiết kiệm ${money(res.discount)}`);
    } catch (err) {
      setPromoStatus(`Lỗi: ${err.message || 'Mã ưu đãi không hợp lệ'}`);
    }
  };

  const totalTicketsSelected = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleReserve = async () => {
    if (totalTicketsSelected === 0) return;
    try {
      setReserving(true);
      setError(null);
      await reserveTickets(id);
      navigate('/checkout');
    } catch (err) {
      setError(err.message || 'Không thể giữ chỗ. Vui lòng kiểm tra số lượng vé còn lại.');
    } finally {
      setReserving(false);
    }
  };

  // Distance computation
  const distInfo = useMemo(() => {
    if (!event?.location) return null;
    return getDistanceInfo(userProvince, event.location);
  }, [event?.location, userProvince]);

  // Schedule / timeline blocks from payload
  const scheduleTimeline = useMemo(() => {
    if (event?.blocks?.schedule) return event.blocks.schedule;
    if (event?.schedule && Array.isArray(event.schedule)) return event.schedule;
    if (event?.location_details?.blog_blocks) {
      const sch = event.location_details.blog_blocks.find((b) => b.type === 'schedule');
      if (sch && sch.items) return sch.items.map((it) => ({ time: it.time, title: it.title, desc: it.title }));
    }
    return [];
  }, [event]);

  if (loading) {
    return (
      <div className="card loading-state">
        <div className="spinner" />
        <p className="muted">Đang tải thông tin chi tiết sự kiện và sơ đồ khán phòng...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="alert alert-error">
        Không thể tải sự kiện: {error}. <Link to="/">Quay về trang chủ</Link>
      </div>
    );
  }

  const sanitizedDescription = DOMPurify.sanitize(event.description || '', {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'blockquote', 'img'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'class', 'src', 'alt'],
  });

  return (
    <article className="event-details-layout">
      {/* Hero Header Banner */}
      <header className={`event-banner ${toneClass(event.category)}`}>
        {event.cover && <img src={event.cover} alt={event.title} className="event-banner-img" />}
        <div className="event-banner-copy">
          <div className="banner-badges-row">
            <span className="badge badge-success">{event.status || 'Đang mở bán'}</span>
            <span className="badge badge-category">{event.category || 'Sự kiện'}</span>
            {distInfo && (
              <span className={`badge badge-location ${distInfo.isSameProvince ? 'same' : ''}`}>
                {distInfo.isSameProvince ? '📍 Cùng tỉnh/thành' : `🚗 ${distInfo.label}`}
              </span>
            )}
          </div>

          <h1 className="event-details-headline">{event.title}</h1>

          <div className="banner-facts">
            <span>📅 {formatRange(event)}</span>
            {event.location && <span>📍 {event.location}</span>}
          </div>

          <div className="banner-actions-row">
            <button
              type="button"
              className={`btn ${isFavorited ? 'btn-danger' : 'btn-secondary'} btn-sm`}
              onClick={handleToggleFavorite}
            >
              ♥ {isFavorited ? 'Đã thả tim (Đang theo dõi)' : 'Thả tim & Nhận thông báo mở lại vé'}
            </button>

            {/* PDF Brochure Download/Viewer Button */}
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-xs"
              onClick={() => setShowPdfModal(true)}
            >
              <span>📄 Xem & Tải Brochure / Cẩm nang (PDF)</span>
            </button>
          </div>

          {restockNotice && (
            <div className="restock-floating-alert">
              🔔 Bạn sẽ nhận thông báo tự động ngay khi có vé nhả lại vào kho (từ các đơn hủy hoặc quá hạn 15 phút)!
            </div>
          )}
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="event-content-split">
        {/* Main Content Area (Dynamic Blog Style Presentation) */}
        <div className="event-main-prose">
          {/* About Event - Blog Style Article */}
          <section className="card blog-article-card">
            <h2 className="section-title">{t('event.about_title', 'Giới thiệu chi tiết sự kiện')}</h2>
            <div className="prose blog-body" dangerouslySetInnerHTML={{ __html: sanitizedDescription }} />
          </section>

          {/* Schedule / Timeline Blocks */}
          {scheduleTimeline && scheduleTimeline.length > 0 && (
            <section className="card timeline-card">
              <h2 className="section-title">{t('event.agenda_title', 'Lịch trình chi tiết (Agenda)')}</h2>
              <div className="timeline-flow">
                {scheduleTimeline.map((item, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-time-badge">{item.time}</div>
                    <div className="timeline-body">
                      <h4>{item.title}</h4>
                      <p>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Seating Layout & Auto-allocation Map (Phân hệ 2.3) */}
          <section className="card seatmap-card">
            <h2 className="section-title">{t('event.seatmap_title', 'Sơ đồ chỗ ngồi & Khán phòng')}</h2>
            <p className="muted">
              {t('event.seatmap_desc', 'Sơ đồ bố trí chỗ ngồi trực quan. Hệ thống sẽ tự động gán vị trí ghế liên tiếp (Contiguous Seating) tối ưu nhất cho bạn khi chọn từ 2 vé trở lên.')}
            </p>
            <div className="seat-map-preview-box">
              {event.seat_map_url && !seatMapImgError ? (
                <img
                  src={event.seat_map_url}
                  alt="Sơ đồ khán phòng"
                  className="seat-map-custom-img"
                  onError={() => setSeatMapImgError(true)}
                />
              ) : (
                <div className="seat-map-stage-diagram">
                  <div className="seat-map-stage-banner">
                    {t('event.seatmap_stage', 'SÂN KHẤU CHÍNH (MAIN STAGE)')}
                  </div>
                  <div className="seat-map-grid">
                    {['A', 'B', 'C', 'D'].map((row) =>
                      Array.from({ length: 10 }, (_, i) => (
                        <div
                          key={`${row}-${i + 1}`}
                          className={`seat-map-cell ${row === 'A' ? 'vip' : 'available'}`}
                        >
                          {row}{i + 1}
                        </div>
                      ))
                    )}
                  </div>
                  <p className="seat-map-legend-text">
                    {t('event.seatmap_legend', 'Ghế màu vàng: Hạng VIP · Ghế màu xanh: Hạng Tiêu chuẩn · Hệ thống tự động xếp chỗ liền kề')}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Refund Policy Information */}
          <section className="card policy-card">
            <h3 className="policy-title">🛡️ {t('event.policy_title', 'Chính sách hủy vé & Hoàn tiền minh bạch')}</h3>
            <div className="policy-details">
              <p>
                • <strong>{t('event.policy_self_service', 'Tự phục vụ trực tuyến:')}</strong> Bạn có thể chủ động hủy vé và nhận hoàn tiền trực tiếp
                tại trang <em>"Vé của tôi"</em> nếu đáp ứng điều kiện hoàn hủy của sự kiện.
              </p>
              <p>
                • <strong>{t('event.policy_escrow', 'Bảo vệ dòng tiền Escrow:')}</strong> 100% dòng tiền giao dịch được sàn bảo chứng an toàn,
                đảm bảo hoàn tiền 100% tức thì nếu sự kiện bị dời lịch hoặc hủy bỏ.
              </p>
            </div>
          </section>
        </div>

        {/* Sidebar: Multi-tier Ticket Selector & Cart Summary */}
        <aside className="event-sidebar">
          <div className="card ticket-panel sticky-panel">
            <div className="panel-header">
              <h2 className="panel-title">{t('event.sidebar_title', 'Chọn hạng vé & Số lượng')}</h2>
              <span className="badge badge-live">{t('event.hold_15m_badge', 'Giữ chỗ 15 phút')}</span>
            </div>

            <div className="tier-selection-stack">
              {(!event.ticket_tiers || event.ticket_tiers.length === 0) && (
                <p className="muted">{t('event.no_tiers', 'Hiện chưa có hạng vé nào được mở bán.')}</p>
              )}

              {event.ticket_tiers?.map((tier) => {
                const selectedItem = cartItems.find((it) => it.tier.id === tier.id);
                const currentQty = selectedItem ? selectedItem.quantity : 0;
                const isSoldOut = tier.remaining_quantity <= 0;

                return (
                  <div key={tier.id} className={`tier-card ${isSoldOut ? 'tier-sold-out' : ''}`}>
                    <div className="tier-header-row">
                      <div>
                        <div className="tier-name">{tier.name || tier.title}</div>
                        <div className="tier-stock-status">
                          {isSoldOut ? (
                            <span className="sold-tag">{t('event.sold_out', 'Đã hết vé')}</span>
                          ) : (
                            <span className="stock-count">{tier.remaining_quantity} vé</span>
                          )}
                        </div>
                      </div>
                      <div className="tier-price-tag">
                        {tier.price === 0 ? t('event.free_ticket', 'MIỄN PHÍ') : money(tier.price)}
                      </div>
                    </div>

                    {!isSoldOut && (
                      <div className="tier-qty-controls">
                        <label className="qty-label" htmlFor={`tier-select-${tier.id}`}>
                          {t('checkout.step_attendees', 'Số lượng vé:')}
                        </label>
                        <select
                          id={`tier-select-${tier.id}`}
                          className="select select-compact"
                          value={currentQty}
                          onChange={(e) => updateQuantity(tier, e.target.value)}
                        >
                          <option value="0">0 vé</option>
                          {Array.from(
                            { length: Math.min(tier.max_per_order || 10, tier.remaining_quantity || 10) },
                            (_, i) => i + 1
                          ).map((num) => (
                            <option key={num} value={num}>
                              {num} vé {tier.price > 0 && `(${money(tier.price * num)})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input */}
            <form onSubmit={handleApplyPromo} className="promo-form-box">
              <label htmlFor="promoCodeInput" className="promo-label">{t('event.promo_label', 'Mã giảm giá ưu đãi:')}</label>
              <div className="promo-input-group">
                <input
                  id="promoCodeInput"
                  type="text"
                  className="input promo-input"
                  placeholder={t('event.promo_placeholder', 'Nhập mã (ví dụ: SAVE20)')}
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-sm">
                  {t('action.apply', 'Áp dụng')}
                </button>
              </div>
              {promoStatus && (
                <div className={`promo-status-msg ${promoStatus.includes('Lỗi') ? 'error' : 'success'}`}>
                  {promoStatus}
                </div>
              )}
            </form>

            {/* Real-time Order Summary */}
            <div className="cart-summary-block">
              {discountAmount > 0 && (
                <div className="summary-line discount-line">
                  <span>Mã giảm giá ({promoCode}):</span>
                  <strong>−{money(discountAmount)}</strong>
                </div>
              )}
              <div className="summary-line total-line">
                <span>{t('event.total_label', 'Tổng cộng')} ({totalTicketsSelected} vé):</span>
                <span className="grand-total">{money(total)}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={totalTicketsSelected === 0 || reserving}
              onClick={handleReserve}
            >
              {reserving ? (
                <span>{t('event.lock_tickets_loading', 'Đang khóa vé & phân bổ ghế...')}</span>
              ) : totalTicketsSelected === 0 ? (
                t('event.please_select_ticket', 'Vui lòng chọn vé')
              ) : (
                `Giữ ${totalTicketsSelected} vé trong 15 phút`
              )}
            </button>

            <p className="atomic-guarantee-note">
              🔒 <strong>Bảo đảm giữ vé:</strong> {t('event.guarantee_note', 'Sau khi nhấn chọn vé, hệ thống sẽ giữ chỗ an toàn cho bạn trong 15 phút để hoàn tất thanh toán.')}
            </p>
          </div>
        </aside>
      </div>

      {/* PDF Brochure Viewer Modal using native <dialog> per modern-web-guidance */}
      <dialog
        ref={pdfDialogRef}
        className="native-modal"
        aria-labelledby="pdf-modal-title"
        onClose={() => setShowPdfModal(false)}
        onClick={(e) => {
          if (e.target === pdfDialogRef.current) setShowPdfModal(false);
        }}
      >
        <div className="modal-dialog brochure-modal">
          <div className="modal-header">
            <h3 id="pdf-modal-title">📄 Brochure & Cẩm nang sự kiện (PDF)</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowPdfModal(false)}
              aria-label="Đóng cửa sổ"
            >
              ✕
            </button>
          </div>
          <div className="modal-body pdf-preview-body">
            <div className="pdf-doc-frame">
              <div className="pdf-doc-header">
                <div className="pdf-doc-title">TÀI LIỆU CHÍNH THỨC: {event.title}</div>
                <div className="pdf-doc-sub">Định dạng: Adobe Portable Document Format (.pdf)</div>
              </div>
              <div className="pdf-doc-content-preview">
                <h4>Mục lục tài liệu:</h4>
                <ul>
                  <li>1. Giới thiệu tổng quan và sơ đồ lối vào hội trường</li>
                  <li>2. Lịch trình chi tiết các phiên tham luận và diễn giả</li>
                  <li>3. Quy định trang phục, cổng soát vé QR và gửi xe</li>
                  <li>4. Hướng dẫn kết nối Wi-Fi tốc độ cao và tài liệu diễn giả</li>
                </ul>
                <div className="pdf-notice">
                  Tài liệu đã được quét và làm sạch nội dung, an toàn 100% không chứa mã độc.
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const title = event?.title || 'TicketFlow-Event';
                const date = formatDate(event?.start_date || event?.date);
                const loc = event?.location_name || event?.location || 'Việt Nam';
                const pdfContent = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 120>>stream\nBT /F1 16 Tf 50 780 Td (TICKETFLOW EVENT BROCHURE) Tj /F1 12 Tf 50 750 Td (${title}) Tj 50 720 Td (Date: ${date} - Location: ${loc}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n382\n%%EOF`;
                const blob = new Blob([pdfContent], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-brochure.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                setShowPdfModal(false);
              }}
            >
              ⬇️ Tải tệp PDF về máy
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPdfModal(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      </dialog>

    </article>
  );
};

export default EventDetailsPage;
