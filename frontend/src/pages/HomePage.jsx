import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../context/FavoritesContext';
import { eventStart, formatDate, money, plainText, startingPrice, toneClass, eventCoverImage, EVENT_CATEGORIES } from '../utils/display';
import { VIETNAM_PROVINCES } from '../utils/location';
import SliderSection from '../components/SliderSection';
import { Icon } from '../components/ui/Icon';

/**
 * UI-05: Real countdown calculation from actual event start date
 */
export const computeEventCountdown = (startDateStr, endDateStr) => {
  if (!startDateStr) return 'Sắp mở bán';
  const target = new Date(startDateStr);
  if (isNaN(target.getTime())) return 'Sắp mở bán';
  const now = Date.now();

  if (endDateStr) {
    const endTarget = new Date(endDateStr);
    if (!isNaN(endTarget.getTime()) && endTarget.getTime() <= now) {
      return 'Đã kết thúc';
    }
  }

  const diffMs = target.getTime() - now;
  if (diffMs <= 0) return 'Đang diễn ra';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `Còn ${Math.max(1, diffMins)} phút`;
    }
    const targetHours = String(target.getHours()).padStart(2, '0');
    const targetMins = String(target.getMinutes()).padStart(2, '0');
    return `${targetHours}:${targetMins} Hôm nay`;
  }
  if (diffDays === 1) {
    const targetHours = String(target.getHours()).padStart(2, '0');
    const targetMins = String(target.getMinutes()).padStart(2, '0');
    return `${targetHours}:${targetMins} Ngày mai`;
  }
  if (diffDays < 7) {
    return `Còn ${diffDays} ngày`;
  }
  return `Còn ${diffDays} ngày (${target.getDate()}/${target.getMonth() + 1})`;
};

export const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isFavorite, toggleFavorite, subscribeRestock } = useFavorites();
  const [events, setEvents] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & State
  const [search, setSearch] = useState('');
  const [upcomingTab, setUpcomingTab] = useState('coming_soon'); // 'coming_soon' | 'newly_opened'

  const [userProvince, setUserProvince] = useState(() => {
    return localStorage.getItem('tf_user_province') || 'Hà Nội';
  });

  const [notificationState, setNotificationState] = useState(null); // toast message

  const showToast = (message) => {
    setNotificationState(message);
    setTimeout(() => {
      setNotificationState(null);
    }, 4000);
  };

  // Save selected province to localStorage
  const handleProvinceChange = (e) => {
    const prov = e.target.value;
    setUserProvince(prov);
    localStorage.setItem('tf_user_province', prov);
  };

  const handleToggleFav = async (eventId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const isNowFav = await toggleFavorite(eventId);
    showToast(isNowFav ? 'Đã lưu sự kiện vào danh sách yêu thích' : 'Đã bỏ lưu sự kiện');
  };

  const handleNotifyMe = async (event) => {
    const res = await subscribeRestock(event.id, event.title);
    showToast(res.message);
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [eventsRes, recsRes] = await Promise.allSettled([
          api.events.list(),
          api.events.getRecommendations ? api.events.getRecommendations() : api.get('/events/recommendations'),
        ]);

        if (isMounted) {
          const loadedEvents = eventsRes.status === 'fulfilled' ? (eventsRes.value?.events || eventsRes.value || []) : [];
          setEvents(loadedEvents);

          if (recsRes.status === 'fulfilled' && recsRes.value?.recommendations?.length > 0) {
            setRecommendations(recsRes.value.recommendations);
          } else if (loadedEvents.length > 0) {
            // Intelligent hybrid fallback: pick featured / top rated events
            setRecommendations(loadedEvents.slice(0, 6));
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, []);

  const categories = EVENT_CATEGORIES;

  // Derived datasets for specialized sliders (UI-05: real sorting & time-based filtering)
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    if (upcomingTab === 'coming_soon') {
      return events
        .filter((e) => {
          const st = new Date(e.start_date || e.starts_at || 0).getTime();
          const et = new Date(e.end_date || e.ends_at || 0).getTime();
          // Exclude ended events
          if (!isNaN(et) && et > 0 && et <= now) return false;
          return !isNaN(st) && st >= now;
        })
        .sort((a, b) => {
          const da = new Date(a.start_date || a.starts_at || 0).getTime();
          const db = new Date(b.start_date || b.starts_at || 0).getTime();
          return da - db;
        })
        .slice(0, 8);
    } else {
      return events
        .filter((e) => {
          const et = new Date(e.end_date || e.ends_at || 0).getTime();
          if (!isNaN(et) && et > 0 && et <= now) return false;
          return e.status === 'PUBLISHED' || !e.status;
        })
        .sort((a, b) => {
          const da = new Date(a.sale_start_date || a.created_at || a.start_date || 0).getTime();
          const db = new Date(b.sale_start_date || b.created_at || b.start_date || 0).getTime();
          return db - da;
        })
        .slice(0, 8);
    }
  }, [events, upcomingTab]);

  const musicEvents = useMemo(() => {
    return events.filter((e) => e.category && e.category.toLowerCase().includes('music')).slice(0, 6);
  }, [events]);

  const theaterEvents = useMemo(() => {
    return events.filter((e) => e.category && (e.category.toLowerCase().includes('design') || e.category.toLowerCase().includes('film') || e.category.toLowerCase().includes('community'))).slice(0, 6);
  }, [events]);

  const workshopEvents = useMemo(() => {
    return events.filter((e) => e.category && (e.category.toLowerCase().includes('tech') || e.category.toLowerCase().includes('business'))).slice(0, 6);
  }, [events]);

  const goToEvents = (catId = 'ALL') => {
    if (catId && catId !== 'ALL') {
      navigate(`/events?category=${encodeURIComponent(catId)}`);
    } else {
      navigate('/events');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/events?search=${encodeURIComponent(search.trim())}`);
    } else {
      navigate('/events');
    }
  };

  return (
    <div className="home-container">
      {/* Accessible Document Heading Level 1 (UI-003) */}
      <h1 className="sr-only">Ticketflow — Nền Tảng Đặt Vé &amp; Quản Lý Sự Kiện Trực Tuyến</h1>

      {/* Toast Notification (UI-24: Accessible toast with status role & aria-live) */}
      {notificationState && (
        <div className="toast-floating flex items-center gap-sm" role="status" aria-live="polite">
          <span>{notificationState}</span>
        </div>
      )}

      {/* Quick Search & Location Bar */}
      <form onSubmit={handleSearchSubmit} className="hero-search-wrapper mb-175" role="search" aria-label="Tìm kiếm sự kiện">
        <div className="hero-search-field">
          <Icon name="search" size="md" className="search-icon" ariaHidden />
          <label htmlFor="home-search-input" className="sr-only">Tìm kiếm sự kiện</label>
          <input
            id="home-search-input"
            type="search"
            className="hero-search-input"
            placeholder={t('home.search_placeholder', 'Tìm sự kiện theo tên, nghệ sĩ, ca sĩ, ban nhạc hoặc địa điểm...')}
            aria-label={t('home.search_placeholder', 'Tìm sự kiện theo tên, nghệ sĩ, ca sĩ, ban nhạc hoặc địa điểm...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="hero-location-picker">
          <Icon name="location" size={18} className="pin-icon" ariaHidden />
          <label htmlFor="userProvinceSelect" className="sr-only">Vị trí của bạn</label>
          <select
            id="userProvinceSelect"
            value={userProvince}
            onChange={handleProvinceChange}
            className="location-select"
            title="Chọn tỉnh/thành của bạn để tính khoảng cách"
            aria-label="Chọn tỉnh thành của bạn để tính khoảng cách"
          >
            {VIETNAM_PROVINCES.map((prov) => (
              <option key={prov.code} value={prov.name}>
                {prov.name}
              </option>
            ))}
          </select>
        </div>
      </form>

      {/* Category Ribbon Pills */}
      <nav className="category-scroll-nav mb-2xl" aria-label="Danh mục sự kiện">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="category-pill flex items-center gap-1.5"
            onClick={() => goToEvents(cat.id)}
          >
            <Icon name={cat.icon} size="sm" ariaHidden />
            <span>{cat.label}</span>
          </button>
        ))}
      </nav>

      {/* ====================================================================
          PHẦN 1: GỢI Ý (SỰ KIỆN NỔI BẬT)
          ==================================================================== */}
      {recommendations.length > 0 && !search && (
        <SliderSection
          id="section-recommendations"
          title="Gợi ý sự kiện"
          cardBasis="default"
          actionButton={
            <Link to="/events" className="tkb-view-all-link flex items-center gap-1">
              <span>Xem tất cả</span>
              <Icon name="arrow-right" size="xs" ariaHidden />
            </Link>
          }
        >
          {recommendations.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = isFavorite(event.id);

            return (
              <article key={`rec-slide-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  <img
                    src={eventCoverImage(event)}
                    alt={event.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
                  />
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">{event.category || 'Nổi bật'}</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn flex items-center justify-center ${isFav ? 'active' : ''}`}
                      onClick={(e) => handleToggleFav(event.id, e)}
                      title={isFav ? 'Bỏ lưu' : 'Lưu sự kiện'}
                      aria-label={isFav ? `Bỏ lưu sự kiện ${event.title}` : `Lưu sự kiện ${event.title}`}
                      aria-pressed={isFav}
                    >
                      <Icon name="heart" size="sm" fill={isFav ? 'currentColor' : 'none'} ariaHidden />
                    </button>
                  </div>
                </div>

                <div className="tkb-card-body">
                  <span className="tkb-card-price">
                    {from === null ? 'Đang cập nhật' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                  </span>

                  <h3 className="tkb-card-title">
                    <Link to={`/events/${event.id}`}>{event.title}</Link>
                  </h3>

                  <div className="tkb-card-meta">
                    <span className="tkb-meta-item">
                      {formatDate(eventStart(event))}
                    </span>
                    <span className="tkb-meta-item">
                      {event.location ? event.location.split(',')[0] : 'Toàn quốc'}
                    </span>
                  </div>

                  <div className="tkb-card-action">
                    <Link to={`/events/${event.id}`} className="tkb-btn-book">
                      Đặt vé ngay
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </SliderSection>
      )}

      {/* Clean Empty State when no events exist (UI-20: Contextual CTA based on user role) */}
      {events.length === 0 && (
        <section className="card empty-state-card">
          <h2 className="empty-state-card-heading">
            Chưa có sự kiện nào
          </h2>
          <div className="flex justify-center gap-sm flex-wrap mt-md">
            {user?.role === 'ORGANIZER' && (
              <Link to="/organizer" className="btn btn-primary empty-state-card-btn">
                Tạo sự kiện
              </Link>
            )}
            <Link to="/events" className="btn btn-secondary empty-state-card-btn">
              Khám phá sự kiện
            </Link>
          </div>
        </section>
      )}

      {/* ====================================================================
          PHẦN 2: SỰ KIỆN SẮP TỚI
          ==================================================================== */}
      {upcomingEvents.length > 0 && (
        <SliderSection
          id="section-upcoming"
          title="Sự kiện sắp diễn ra"
          cardBasis="portrait"
          actionButton={
            <div className="tkb-tabs">
              <button
                type="button"
                className={`tkb-tab-btn ${upcomingTab === 'coming_soon' ? 'active' : ''}`}
                onClick={() => setUpcomingTab('coming_soon')}
              >
                {t('home.upcoming_heading', 'Sắp diễn ra')}
              </button>
              <button
                type="button"
                className={`tkb-tab-btn ${upcomingTab === 'newly_opened' ? 'active' : ''}`}
                onClick={() => setUpcomingTab('newly_opened')}
              >
                {t('home.featured_heading', 'Mới mở bán')}
              </button>
            </div>
          }
        >
          {upcomingEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const countdownText = computeEventCountdown(event.start_date || event.starts_at, event.end_date || event.ends_at);

            return (
              <article
                key={`upcoming-${event.id}`}
                className="tkb-portrait-card"
                onClick={() => navigate(`/events/${event.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/events/${event.id}`);
                  }
                }}
                aria-label={`Xem thông tin sự kiện ${event.title}`}
              >
                <img
                  src={eventCoverImage(event)}
                  alt={event.title}
                  className="tkb-portrait-bg"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
                />
                <div className="tkb-portrait-overlay" />

                <div className="tkb-portrait-badge">
                  <span className="tkb-pulsing-dot" />
                  {upcomingTab === 'coming_soon' ? 'SẮP DIỄN RA' : 'ĐANG MỞ BÁN'}
                </div>

                <div className="tkb-portrait-content">
                  <div className="tkb-countdown-tag">
                    {upcomingTab === 'coming_soon' ? countdownText : 'Đang mở bán'}
                  </div>
                  <h3 className="tkb-portrait-title">
                    <span className="text-white">
                      {event.title}
                    </span>
                  </h3>
                  <div className="tkb-portrait-price">
                    {from === null ? 'Đang cập nhật' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                  </div>

                  <div className="tkb-portrait-actions">
                    <button
                      type="button"
                      className="tkb-btn-view-details"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/events/${event.id}`);
                      }}
                      title="Xem thông tin chi tiết sự kiện"
                    >
                      <span>Xem thông tin</span>
                      <Icon name="arrow-right" size="xs" ariaHidden />
                    </button>
                    <button
                      type="button"
                      className="tkb-btn-bell-notify"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotifyMe(event);
                      }}
                      title="Nhận thông báo khi mở bán vé"
                      aria-label="Nhận thông báo khi mở bán vé"
                    >
                      <Icon name="bell" size="sm" ariaHidden />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </SliderSection>
      )}

      {/* ====================================================================
          PHẦN 3: NHẠC SỐNG & CONCERT
          ==================================================================== */}
      {musicEvents.length > 0 && (
        <SliderSection
          id="section-music"
          title="Nhạc sống & Concert"
          cardBasis="default"
          actionButton={
            <Link to="/events?category=Music" className="tkb-view-all-link flex items-center gap-1">
              <span>Xem tất cả</span>
              <Icon name="arrow-right" size="xs" ariaHidden />
            </Link>
          }
        >
          {musicEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = isFavorite(event.id);
            return (
              <article key={`music-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  <img
                    src={eventCoverImage(event)}
                    alt={event.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
                  />
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">Nhạc sống</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn flex items-center justify-center ${isFav ? 'active' : ''}`}
                      onClick={(e) => handleToggleFav(event.id, e)}
                      title={isFav ? 'Bỏ lưu' : 'Lưu sự kiện'}
                      aria-label={isFav ? `Bỏ lưu sự kiện ${event.title}` : `Lưu sự kiện ${event.title}`}
                      aria-pressed={isFav}
                    >
                      <Icon name="heart" size="sm" fill={isFav ? 'currentColor' : 'none'} ariaHidden />
                    </button>
                  </div>
                </div>
                <div className="tkb-card-body">
                  <span className="tkb-card-price">
                    {from === null ? 'Đang cập nhật' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                  </span>
                  <h3 className="tkb-card-title">
                    <Link to={`/events/${event.id}`}>{event.title}</Link>
                  </h3>
                  <div className="tkb-card-meta">
                    <span className="tkb-meta-item">{formatDate(eventStart(event))}</span>
                    <span className="tkb-meta-item">{event.location ? event.location.split(',')[0] : 'Toàn quốc'}</span>
                  </div>
                  <div className="tkb-card-action">
                    <Link to={`/events/${event.id}`} className="tkb-btn-book">
                      Xem vé & Chi tiết
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </SliderSection>
      )}

      {theaterEvents.length > 0 && (
        <SliderSection
          id="section-theater"
          title="Sân khấu & Nghệ thuật"
          cardBasis="default"
          actionButton={
            <Link to="/events?category=Design" className="tkb-view-all-link flex items-center gap-1">
              <span>Xem tất cả</span>
              <Icon name="arrow-right" size="xs" ariaHidden />
            </Link>
          }
        >
          {theaterEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = isFavorite(event.id);
            return (
              <article key={`theater-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  <img
                    src={eventCoverImage(event)}
                    alt={event.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
                  />
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">Nghệ thuật</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn flex items-center justify-center ${isFav ? 'active' : ''}`}
                      onClick={(e) => handleToggleFav(event.id, e)}
                      title={isFav ? 'Bỏ lưu' : 'Lưu sự kiện'}
                      aria-label={isFav ? `Bỏ lưu sự kiện ${event.title}` : `Lưu sự kiện ${event.title}`}
                      aria-pressed={isFav}
                    >
                      <Icon name="heart" size="sm" fill={isFav ? 'currentColor' : 'none'} ariaHidden />
                    </button>
                  </div>
                </div>
                <div className="tkb-card-body">
                  <span className="tkb-card-price">
                    {from === null ? 'Đang cập nhật' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                  </span>
                  <h3 className="tkb-card-title">
                    <Link to={`/events/${event.id}`}>{event.title}</Link>
                  </h3>
                  <div className="tkb-card-meta">
                    <span className="tkb-meta-item">{formatDate(eventStart(event))}</span>
                    <span className="tkb-meta-item">{event.location ? event.location.split(',')[0] : 'Toàn quốc'}</span>
                  </div>
                  <div className="tkb-card-action">
                    <Link to={`/events/${event.id}`} className="tkb-btn-book">
                      Xem vé & Chi tiết
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </SliderSection>
      )}

      {/* ====================================================================
          CTA KHÁM PHÁ TOÀN BỘ SỰ KIỆN
          ==================================================================== */}
      <section className="home-discovery-banner">
        <h2 className="home-discovery-heading">
          Tất cả sự kiện đang mở bán
        </h2>
        <Link
          to="/events"
          className="btn btn-primary home-discovery-cta"
        >
          <span>Xem tất cả sự kiện</span>
          <span>→</span>
        </Link>
      </section>
    </div>
  );
};

export default HomePage;
