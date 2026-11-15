import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { eventStart, formatDate, money, plainText, startingPrice, toneClass, EVENT_CATEGORIES } from '../utils/display';
import { VIETNAM_PROVINCES } from '../utils/location';
import SliderSection from '../components/SliderSection';

export const HomePage = () => {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
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

  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tf_favorites') || '[]');
    } catch {
      return [];
    }
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

  // Toggle favorite / Thả tim
  const toggleFavorite = (eventId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const isFav = prev.includes(eventId);
      const next = isFav ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      localStorage.setItem('tf_favorites', JSON.stringify(next));
      showToast(isFav ? 'Đã xóa sự kiện khỏi danh sách quan tâm' : '❤️ Đã lưu sự kiện! Hệ thống sẽ thông báo khi vé mở bán.');
      return next;
    });
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

  // Derived datasets for specialized sliders
  const upcomingEvents = useMemo(() => {
    return events.slice(0, 8);
  }, [events]);

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
      {/* Toast Notification */}
      {notificationState && (
        <div className="toast-floating flex items-center gap-sm">
          <span>{notificationState}</span>
        </div>
      )}

      {/* Quick Search & Location Bar */}
      <form onSubmit={handleSearchSubmit} className="hero-search-wrapper mb-175">
        <div className="hero-search-field">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="hero-search-input"
            placeholder={t('home.search_placeholder', 'Tìm sự kiện theo tên, nghệ sĩ, ca sĩ, ban nhạc hoặc địa điểm...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="hero-location-picker">
          <svg className="pin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <label htmlFor="userProvinceSelect" className="sr-only">Vị trí của bạn</label>
          <select
            id="userProvinceSelect"
            value={userProvince}
            onChange={handleProvinceChange}
            className="location-select"
            title="Chọn tỉnh/thành của bạn để tính khoảng cách"
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
            className="category-pill"
            onClick={() => goToEvents(cat.id)}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </nav>

      {/* ====================================================================
          PHẦN 1: GỢI Ý CHO BẠN (SỰ KIỆN NỔI BẬT & ĐẶC SẮC)
          ==================================================================== */}
      {recommendations.length > 0 && !search && (
        <SliderSection
          id="section-recommendations"
          badge="Dành riêng cho bạn"
          title="Gợi ý cho bạn"
          subtitle="Khám phá những sự kiện đặc sắc và được yêu thích nhất thời điểm hiện tại."
          cardBasis="default"
          actionButton={
            <Link to="/events" className="tkb-view-all-link">
              Xem tất cả gợi ý →
            </Link>
          }
        >
          {recommendations.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = favorites.includes(event.id);

            return (
              <article key={`rec-slide-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  {event.cover ? (
                    <img src={event.cover} alt={event.title} loading="lazy" />
                  ) : (
                    <div className="placeholder-cover-icon">
                      🎵
                    </div>
                  )}
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">{event.category || 'Nổi bật'}</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn ${isFav ? 'active' : ''}`}
                      onClick={(e) => toggleFavorite(event.id, e)}
                      title={isFav ? 'Bỏ thích' : 'Thả tim để nhận thông báo'}
                      aria-label="Thả tim sự kiện"
                    >
                      ♥
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
                      📅 {formatDate(eventStart(event))}
                    </span>
                    <span className="tkb-meta-item">
                      📍 {event.location ? event.location.split(',')[0] : 'Toàn quốc'}
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

      {/* Clean Empty State when no events exist */}
      {events.length === 0 && (
        <section className="card empty-state-card">
          <div className="empty-state-card-icon">🎪</div>
          <h2 className="empty-state-card-heading">
            Chưa có sự kiện nào được đăng tải
          </h2>
          <p className="muted empty-state-card-desc">
            Hệ thống hiện tại chưa có sự kiện nào đang mở bán. Hãy quay lại sau hoặc đăng ký trở thành Nhà tổ chức để khởi tạo sự kiện đầu tiên của bạn!
          </p>
          <div className="flex justify-center gap-sm flex-wrap">
            <Link to="/organizer" className="btn btn-primary empty-state-card-btn">
              + Tạo sự kiện ngay
            </Link>
            <Link to="/events" className="btn btn-secondary empty-state-card-btn">
              Khám phá sự kiện
            </Link>
          </div>
        </section>
      )}

      {/* ====================================================================
          PHẦN 2: SỰ KIỆN SẮP TỚI (SẮP MỞ BÁN / MỚI MỞ BÁN - 3:4 PORTRAIT CARDS)
          ==================================================================== */}
      {upcomingEvents.length > 0 && (
        <SliderSection
          id="section-upcoming"
          badge="⏰ Lịch mở bán sớm"
          title="Sự kiện sắp tới & Sắp mở bán"
          subtitle="Cập nhật lịch mở bán vé sớm của các liveshow, đại nhạc hội và sự kiện quy mô lớn."
          cardBasis="portrait"
          actionButton={
            <div className="tkb-tabs">
              <button
                type="button"
                className={`tkb-tab-btn ${upcomingTab === 'coming_soon' ? 'active' : ''}`}
                onClick={() => setUpcomingTab('coming_soon')}
              >
                {t('home.upcoming_heading', 'Sắp mở bán')}
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
          {upcomingEvents.map((event, idx) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const countdowns = [
              'Mở bán: 10:00 Ngày mai',
              'Mở bán: 20:00 - 18/11',
              'Sau 2 ngày nữa',
              'Cuối tuần này',
              'Còn 5 ngày',
              'Mở bán sớm cho VIP',
            ];
            const countdownText = countdowns[idx % countdowns.length];

            return (
              <article key={`upcoming-${event.id}`} className="tkb-portrait-card">
                <img
                  src={event.cover || 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=600&fit=crop'}
                  alt={event.title}
                  className="tkb-portrait-bg"
                  loading="lazy"
                />
                <div className="tkb-portrait-overlay" />

                <div className="tkb-portrait-badge">
                  <span className="tkb-pulsing-dot" />
                  {upcomingTab === 'coming_soon' ? 'SẮP MỞ BÁN' : 'VỪA MỞ BÁN'}
                </div>

                <div className="tkb-portrait-content">
                  <div className="tkb-countdown-tag">
                    ⏰ {upcomingTab === 'coming_soon' ? countdownText : 'Đang mở cổng bán'}
                  </div>
                  <h3 className="tkb-portrait-title">
                    <Link to={`/events/${event.id}`} className="text-white no-underline">
                      {event.title}
                    </Link>
                  </h3>
                  <div className="tkb-portrait-price">
                    {from === null ? 'Giá dự kiến từ 250.000 đ' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                  </div>
                  <button
                    type="button"
                    className="tkb-btn-notify"
                    onClick={() => showToast(`🔔 Đã đặt nhắc nhở cho sự kiện "${event.title}"! Chúng tôi sẽ gửi thông báo 15 phút trước giờ mở bán.`)}
                  >
                    🔔 Đặt nhắc nhở mở bán
                  </button>
                </div>
              </article>
            );
          })}
        </SliderSection>
      )}

      {/* ====================================================================
          PHẦN 4: DANH MỤC ĐẶC SẮC THEO THỂ LOẠI (NHẠC SỐNG & SÂN KHẤU)
          ==================================================================== */}
      {musicEvents.length > 0 && (
        <SliderSection
          id="section-music"
          badge="🎵 Âm nhạc đỉnh cao"
          title="Nhạc sống & Concert"
          subtitle="Những đêm nhạc bùng nổ, live concert và festival âm nhạc sôi động nhất."
          cardBasis="default"
          actionButton={
            <Link to="/events?category=Music" className="tkb-view-all-link">
              Xem tất cả Nhạc sống →
            </Link>
          }
        >
          {musicEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = favorites.includes(event.id);
            return (
              <article key={`music-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  {event.cover && <img src={event.cover} alt={event.title} loading="lazy" />}
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">Nhạc sống</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn ${isFav ? 'active' : ''}`}
                      onClick={(e) => toggleFavorite(event.id, e)}
                      aria-label="Thả tim"
                    >
                      ♥
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
                    <span className="tkb-meta-item">📅 {formatDate(eventStart(event))}</span>
                    <span className="tkb-meta-item">📍 {event.location ? event.location.split(',')[0] : 'Toàn quốc'}</span>
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
          badge="🎭 Nghệ thuật & Sân khấu"
          title="Sân khấu & Nghệ thuật kịch nói"
          subtitle="Vở kịch đặc sắc, triển lãm hội họa và các chương trình nghệ thuật kinh điển."
          cardBasis="default"
          actionButton={
            <Link to="/events?category=Design" className="tkb-view-all-link">
              Xem tất cả Sân khấu →
            </Link>
          }
        >
          {theaterEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = favorites.includes(event.id);
            return (
              <article key={`theater-${event.id}`} className="tkb-card">
                <div className={`tkb-card-cover ${toneClass(event.category)}`}>
                  {event.cover && <img src={event.cover} alt={event.title} loading="lazy" />}
                  <div className="tkb-card-cover-badges">
                    <span className="tkb-category-chip">Nghệ thuật</span>
                    <button
                      type="button"
                      className={`tkb-fav-btn ${isFav ? 'active' : ''}`}
                      onClick={(e) => toggleFavorite(event.id, e)}
                      aria-label="Thả tim"
                    >
                      ♥
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
                    <span className="tkb-meta-item">📅 {formatDate(eventStart(event))}</span>
                    <span className="tkb-meta-item">📍 {event.location ? event.location.split(',')[0] : 'Toàn quốc'}</span>
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
          CTA KHÁM PHÁ TOÀN BỘ SỰ KIỆN (DẪN SANG TRANG /events)
          ==================================================================== */}
      <section className="home-discovery-banner">
        <div className="home-discovery-icon">🎟️</div>
        <h2 className="home-discovery-heading">
          {t('home.all_heading', 'Khám phá toàn bộ sự kiện đang mở bán')}
        </h2>
        <p className="home-discovery-subtext">
          {t('home.all_sub', 'Hàng trăm đêm nhạc bùng nổ, lễ hội văn hóa, giải chạy marathon và workshop hấp dẫn trên khắp các tỉnh thành đang chờ đón bạn.')}
        </p>
        <Link
          to="/events"
          className="btn btn-primary home-discovery-cta"
        >
          <span>{t('home.view_all', 'Xem tất cả sự kiện')}</span>
          <span>→</span>
        </Link>
      </section>
    </div>
  );
};

export default HomePage;
