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

  const [isFavorited, setIsFavorited] = useState(false);
  const [restockNotice, setRestockNotice] = useState(false);
  const [seatMapImgError, setSeatMapImgError] = useState(false);

  const userProvince = localStorage.getItem('tf_user_province') || 'Hà Nội';

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
        {(event.banner || event.cover) && (
          <img
            src={event.banner || event.cover}
            alt={event.title}
            className="event-banner-img"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
          />
        )}
        <div className="event-banner-copy">
          <div className="banner-badges-row">
            <span className="badge badge-success">{event.status || 'Đang mở bán'}</span>
            <span className="badge badge-category">{event.category || 'Sự kiện'}</span>
            {distInfo && (
              <span className={`badge badge-location ${distInfo.isSameProvince ? 'same' : ''}`}>
                {distInfo.isSameProvince ? 'Cùng khu vực' : distInfo.label}
              </span>
            )}
          </div>

          <h1 className="event-details-headline">{event.title}</h1>

          <div className="banner-facts">
            <span>{formatRange(event)}</span>
            {event.location && <span>{event.location}</span>}
          </div>

          <div className="banner-actions-row">
            <button
              type="button"
              className={`btn ${isFavorited ? 'btn-danger' : 'btn-secondary'} btn-sm`}
              onClick={handleToggleFavorite}
            >
              {isFavorited ? 'Đã lưu' : 'Lưu sự kiện'}
            </button>
          </div>

          {restockNotice && (
            <div className="restock-floating-alert">
              Hệ thống sẽ thông báo khi có vé mở bán.
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
                      <h3>{item.title}</h3>
                      <p>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Seating Layout Map */}
          <section className="card seatmap-card">
            <h2 className="section-title">{t('event.seatmap_title', 'Sơ đồ chỗ ngồi')}</h2>
            <p className="muted">
              {t('event.seatmap_desc', 'Sơ đồ chỗ ngồi. Hệ thống tự động xếp ghế liền kề khi chọn từ 2 vé trở lên.')}
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
                    {t('event.seatmap_stage', 'SÂN KHẤU CHÍNH')}
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
                    {t('event.seatmap_legend', 'Ghế VIP · Ghế Tiêu chuẩn · Tự động xếp chỗ liền kề')}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Refund Policy Information */}
          <section className="card policy-card">
            <h3 className="policy-title">{t('event.policy_title', 'Chính sách hoàn hủy vé')}</h3>
            <div className="policy-details">
              <p>
                • {t('event.policy_self_service', 'Bạn có thể gửi yêu cầu hủy vé tại trang Vé của tôi nếu đáp ứng điều kiện hoàn vé của sự kiện.')}
              </p>
              <p>
                • {t('event.policy_refund', 'Hoàn tiền 100% nếu sự kiện bị hoãn hoặc hủy bỏ.')}
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
                          aria-label={`Số lượng vé cho hạng vé ${tier.name || tier.title}`}
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
                <span>{t('event.reserve_btn_submitting', 'Đang xử lý...')}</span>
              ) : totalTicketsSelected === 0 ? (
                t('event.reserve_btn_empty', 'Vui lòng chọn vé')
              ) : (
                `Đặt ${totalTicketsSelected} vé`
              )}
            </button>
          </div>
        </aside>
      </div>
    </article>
  );
};

export default EventDetailsPage;
