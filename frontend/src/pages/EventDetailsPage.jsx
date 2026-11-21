import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../context/FavoritesContext';
import { formatRange, money, toneClass, eventCoverImage } from '../utils/display';
import { getDistanceInfo } from '../utils/location';
import { Icon } from '../components/ui/Icon';
import { VectorSpinner } from '../components/ui/VectorAnimation';

export const EventDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { cartItems, updateQuantity, applyPromoCode, reserveTickets, promoCode, discountAmount, total } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoStatus, setPromoStatus] = useState(null);
  const [reserving, setReserving] = useState(false);

  const isFavorited = isFavorite(id);
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

  const handleToggleFavorite = async () => {
    const isNowFav = await toggleFavorite(id);
    if (isNowFav) {
      setRestockNotice(true);
      setTimeout(() => setRestockNotice(false), 5000);
    }
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

  // Dynamic content blocks from payload
  const contentBlocks = useMemo(() => {
    const raw = event?.blocks || event?.blog_blocks || event?.location_details?.blog_blocks;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [event]);

  // Schedule / timeline blocks from payload
  const scheduleTimeline = useMemo(() => {
    if (event?.blocks?.schedule) return event.blocks.schedule;
    if (event?.schedule && Array.isArray(event.schedule)) return event.schedule;
    const sch = contentBlocks.find((b) => b && (b.type === 'schedule' || b.type === 'timeline'));
    if (sch && Array.isArray(sch.items)) {
      return sch.items.map((it) => ({
        time: it.time || '',
        title: it.title || '',
        desc: it.desc || it.description || '',
      }));
    }
    return [];
  }, [event, contentBlocks]);

  // Media / image blocks from blog content
  const blogMediaBlocks = useMemo(() => {
    return contentBlocks.filter(
      (b) => b && (b.type === 'media' || b.type === 'image' || b.media_url || b.url) && (b.media_url || b.url)
    );
  }, [contentBlocks]);

  if (loading) {
    return (
      <div className="card loading-state flex flex-col items-center justify-center p-8 text-center">
        <VectorSpinner size={36} />
        <p className="muted mt-3">Đang tải thông tin chi tiết sự kiện và sơ đồ khán phòng...</p>
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
        <img
          src={eventCoverImage(event)}
          alt={event.title}
          className="event-banner-img"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
        />
        <div className="event-banner-copy">
          <div className="banner-badges-row">
            <span className={`badge ${
              String(event.status).toUpperCase() === 'UPCOMING' || String(event.status).toUpperCase() === 'SCHEDULED'
                ? 'badge-warning'
                : 'badge-success'
            }`}>
              {String(event.status).toUpperCase() === 'UPCOMING' || String(event.status).toUpperCase() === 'SCHEDULED'
                ? 'Sắp diễn ra'
                : event.status === 'LIVE' || event.status === 'PUBLISHED'
                ? 'Đang mở bán'
                : event.status || 'Đang mở bán'}
            </span>
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
          {sanitizedDescription && (
            <section className="card blog-article-card mb-md">
              <h2 className="section-title">{t('event.about_title', 'Giới thiệu chi tiết sự kiện')}</h2>
              <div className="prose blog-body" dangerouslySetInnerHTML={{ __html: sanitizedDescription }} />
            </section>
          )}

          {/* Dynamic Content Blocks (Đoạn văn bản, Đoạn lịch trình, Đoạn ảnh) */}
          {contentBlocks.length > 0 ? (
            contentBlocks.map((b, idx) => {
              if (b.type === 'paragraph' || b.type === 'text') {
                const textContent = b.content || b.text || '';
                // Avoid duplicating if identical to main description
                if (!textContent.trim() || textContent.trim() === event?.description?.trim()) return null;
                return (
                  <section key={b.id || idx} className="card blog-article-card mb-md">
                    {b.title && <h2 className="section-title">{b.title}</h2>}
                    <div className="prose blog-body whitespace-pre-line text-sm leading-relaxed">
                      {textContent}
                    </div>
                  </section>
                );
              }

              if (b.type === 'schedule' || b.type === 'timeline') {
                const items = b.items || [];
                if (items.length === 0) return null;
                return (
                  <section key={b.id || idx} className="card timeline-card mb-md">
                    <h2 className="section-title">{b.title || t('event.agenda_title', 'Lịch trình chi tiết (Agenda)')}</h2>
                    <div className="timeline-flow">
                      {items.map((item, itemIdx) => (
                        <div key={item.id || itemIdx} className="timeline-item">
                          <div className="timeline-time-badge">{item.time}</div>
                          <div className="timeline-body">
                            <h4>{item.title}</h4>
                            {(item.desc || item.description) && (
                              <p>{item.desc || item.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              }

              if (b.type === 'media' || b.type === 'image') {
                const mediaSrc = b.url || b.media_url;
                if (!mediaSrc) return null;
                return (
                  <section key={b.id || idx} className="card blog-media-section mb-md">
                    {b.title && <h2 className="section-title">{b.title}</h2>}
                    <figure className="blog-media-item m-0 rounded overflow-hidden border">
                      <img
                        src={mediaSrc}
                        alt={b.caption || b.title || `${event.title} - ảnh ${idx + 1}`}
                        className="w-full object-cover rounded-lg"
                        style={{ maxHeight: '480px', width: '100%', objectFit: 'cover' }}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/images/events/summit.svg';
                        }}
                      />
                      {b.caption && (
                        <figcaption className="p-xs text-xs text-center muted italic bg-slate-50 dark:bg-slate-900">
                          {b.caption}
                        </figcaption>
                      )}
                    </figure>
                  </section>
                );
              }

              return null;
            })
          ) : (
            <>
              {/* Fallback Blog Media Gallery */}
              {blogMediaBlocks && blogMediaBlocks.length > 0 && (
                <section className="card blog-media-section mb-md">
                  <h2 className="section-title">{t('event.gallery_title', 'Hình ảnh sự kiện')}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-sm my-2">
                    {blogMediaBlocks.map((b, idx) => {
                      const mediaSrc = b.media_url || b.url;
                      return (
                        <figure key={idx} className="blog-media-item m-0 rounded overflow-hidden border">
                          <img
                            src={mediaSrc}
                            alt={b.caption || `${event.title} - ảnh ${idx + 1}`}
                            className="w-full h-48 object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = '/images/events/summit.svg';
                            }}
                          />
                          {b.caption && (
                            <figcaption className="p-xs text-xs text-center muted italic bg-slate-50 dark:bg-slate-900">
                              {b.caption}
                            </figcaption>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Fallback Schedule / Timeline Blocks */}
              {scheduleTimeline && scheduleTimeline.length > 0 && (
                <section className="card timeline-card mb-md">
                  <h2 className="section-title">{t('event.agenda_title', 'Lịch trình chi tiết (Agenda)')}</h2>
                  <div className="timeline-flow">
                    {scheduleTimeline.map((item, idx) => (
                      <div key={idx} className="timeline-item">
                        <div className="timeline-time-badge">{item.time}</div>
                        <div className="timeline-body">
                          <h4>{item.title}</h4>
                          <p>{item.desc || item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Open Seating & Venue Layout */}
          <section className="card seatmap-card">
            <h2 className="section-title">{t('event.seatmap_title', 'Sơ đồ phân khu & Không gian')}</h2>
            <div className="open-seating-alert p-3 mb-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-900 dark:text-blue-200 flex items-start gap-2">
              <Icon name="info" size="sm" ariaHidden className="text-primary mt-0.5" />
              <div>
                <span className="font-semibold">Nguyên tắc Open Seating:</span> Sự kiện áp dụng quy chế ngồi/đứng tự do theo khu vực hạng vé đã mua. Vui lòng có mặt sớm trước giờ mở cửa để có vị trí quan sát tốt nhất trong phân khu của bạn.
              </div>
            </div>
            <div className="seat-map-preview-box">
              {event.seat_map_url && !seatMapImgError ? (
                <img
                  src={event.seat_map_url}
                  alt="Sơ đồ phân khu sự kiện"
                  className="seat-map-custom-img rounded-lg max-h-80 mx-auto object-contain"
                  onError={() => setSeatMapImgError(true)}
                />
              ) : (
                <div className="seat-map-stage-diagram p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-center">
                  <div className="seat-map-stage-banner font-bold py-2 px-6 bg-slate-800 text-white rounded mb-4 inline-block">
                    {t('event.seatmap_stage', 'SÂN KHẤU CHÍNH')}
                  </div>
                  <div className="flex flex-col gap-3 max-w-md mx-auto my-4">
                    <div className="p-3 bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded text-amber-900 dark:text-amber-200 font-medium flex items-center justify-center gap-1.5">
                      <Icon name="crown" size="sm" ariaHidden className="text-amber-600 dark:text-amber-400" />
                      <span>Khu vực Hạng Vé VIP</span>
                    </div>
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-950/50 border border-indigo-300 dark:border-indigo-700 rounded text-indigo-900 dark:text-indigo-200 font-medium flex items-center justify-center gap-1.5">
                      <Icon name="ticket" size="sm" ariaHidden className="text-indigo-600 dark:text-indigo-400" />
                      <span>Khu vực Hạng Vé Tiêu Chuẩn / Phổ Thông</span>
                    </div>
                  </div>
                  <p className="seat-map-legend-text text-xs text-slate-500">
                    * Sơ đồ mang tính chất minh họa phân khu không gian tham khảo; vị trí cụ thể do Ban tổ chức bố trí tại địa điểm sự kiện. Phân khu mở · Ghế tự do theo hạng vé · Nhận chỗ theo thứ tự vào cửa.
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
