import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useFavorites } from '../context/FavoritesContext';
import { eventStart, formatDate, money, plainText, startingPrice, toneClass, eventCoverImage, EVENT_CATEGORIES } from '../utils/display';
import { VIETNAM_PROVINCES } from '../utils/location';
import { Icon } from '../components/ui/Icon';
import { VectorSpinner } from '../components/ui/VectorAnimation';
import { EmptyStateIllustration } from '../components/ui/EmptyStateIllustration';

const CATEGORIES = EVENT_CATEGORIES;

export const EventsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFavorite, toggleFavorite } = useFavorites();

  // Initial state from URL params
  const initialCategory = searchParams.get('category') || 'ALL';
  const initialSearch = searchParams.get('search') || searchParams.get('q') || '';
  const initialProvince = searchParams.get('province') || 'ALL';

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Sorting
  const [search, setSearch] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedProvinceFilter, setSelectedProvinceFilter] = useState(initialProvince);
  const [sortBy, setSortBy] = useState('date_asc'); // 'date_asc' | 'date_desc' | 'price_asc' | 'price_desc' | 'title_asc'
  const [visibleCount, setVisibleCount] = useState(12);

  // Toast feedback
  const [notificationState, setNotificationState] = useState(null);

  const showToast = (message) => {
    setNotificationState(message);
    setTimeout(() => {
      setNotificationState(null);
    }, 3500);
  };

  // UI-17: Sync state when URL params change from external navigation
  useEffect(() => {
    const cat = searchParams.get('category') || 'ALL';
    const q = searchParams.get('search') || searchParams.get('q') || '';
    const prov = searchParams.get('province') || 'ALL';
    setSelectedCategory(cat);
    setSearch(q);
    setSelectedProvinceFilter(prov);
  }, [searchParams]);

  // Toggle favorite
  const handleToggleFav = async (eventId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const isNowFav = await toggleFavorite(eventId);
    showToast(isNowFav ? 'Đã lưu sự kiện vào danh sách yêu thích' : 'Đã bỏ lưu sự kiện');
  };

  // Sync params with URL when filter changes
  const updateUrlParam = (key, value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setVisibleCount(12);
    updateUrlParam('category', catId);
  };

  const handleSearchChange = (val) => {
    setSearch(val);
    setVisibleCount(12);
    updateUrlParam('search', val);
  };

  const handleProvinceChange = (prov) => {
    setSelectedProvinceFilter(prov);
    setVisibleCount(12);
    updateUrlParam('province', prov);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('ALL');
    setSelectedProvinceFilter('ALL');
    setSortBy('date_asc');
    setVisibleCount(12);
    setSearchParams({}, { replace: true });
  };

  // Fetch events
  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const res = await api.events.list();
        if (isMounted) {
          const list = Array.isArray(res) ? res : res?.events || [];
          setEvents(list);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Không thể tải danh sách sự kiện.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter & Sort Logic
  const filteredEvents = useMemo(() => {
    let list = events.filter((ev) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (ev.title && ev.title.toLowerCase().includes(query)) ||
        (ev.description && ev.description.toLowerCase().includes(query)) ||
        (ev.location && ev.location.toLowerCase().includes(query));

      const matchesCategory =
        selectedCategory === 'ALL' ||
        (ev.category && ev.category.toLowerCase() === selectedCategory.toLowerCase());

      const matchesProvince =
        selectedProvinceFilter === 'ALL' ||
        (ev.province_code && ev.province_code.toLowerCase() === selectedProvinceFilter.toLowerCase()) ||
        (ev.province && ev.province.toLowerCase() === selectedProvinceFilter.toLowerCase()) ||
        (ev.location && ev.location.toLowerCase().includes(selectedProvinceFilter.toLowerCase()));

      return matchesSearch && matchesCategory && matchesProvince;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'date_asc') {
        const da = new Date(eventStart(a) || 0).getTime();
        const db = new Date(eventStart(b) || 0).getTime();
        return da - db;
      }
      if (sortBy === 'date_desc') {
        const da = new Date(eventStart(a) || 0).getTime();
        const db = new Date(eventStart(b) || 0).getTime();
        return db - da;
      }
      if (sortBy === 'price_asc') {
        const pa = startingPrice(a.ticket_tiers || a.tiers) ?? 999999999;
        const pb = startingPrice(b.ticket_tiers || b.tiers) ?? 999999999;
        return pa - pb;
      }
      if (sortBy === 'price_desc') {
        const pa = startingPrice(a.ticket_tiers || a.tiers) ?? -1;
        const pb = startingPrice(b.ticket_tiers || b.tiers) ?? -1;
        return pb - pa;
      }
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return list;
  }, [events, search, selectedCategory, selectedProvinceFilter, sortBy]);

  const displayedEvents = filteredEvents.slice(0, visibleCount);

  return (
    <div className="home-container pt-lg pb-4xl">
      {/* Toast Notification (UI-24: Accessible toast) */}
      {notificationState && (
        <div className="toast-floating flex items-center gap-sm" role="status" aria-live="polite">
          <span>{notificationState}</span>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      <nav className="breadcrumb-nav">
        <Link to="/" className="text-muted no-underline">Trang chủ</Link>
        <span>/</span>
        <span className="text-ink font-semibold">Tất cả sự kiện</span>
      </nav>

      {/* Search Bar & Quick Filters */}
      <div className="hero-search-wrapper mb-175">
        <div className="hero-search-field">
          <Icon name="search" size="md" className="search-icon" ariaHidden />
          <label htmlFor="events-search-input" className="sr-only">Tìm kiếm sự kiện</label>
          <input
            id="events-search-input"
            type="search"
            className="hero-search-input"
            placeholder="Tìm theo tên sự kiện, nghệ sĩ, ca sĩ, ban nhạc hoặc địa điểm..."
            aria-label="Tìm theo tên sự kiện, nghệ sĩ, ca sĩ, ban nhạc hoặc địa điểm..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="btn-clear-search flex items-center justify-center"
              title="Xóa tìm kiếm"
              aria-label="Xóa nội dung tìm kiếm"
            >
              <Icon name="x" size="xs" ariaHidden />
            </button>
          )}
        </div>

        <div className="hero-location-picker">
          <Icon name="location" size={18} className="pin-icon" ariaHidden />
          <label htmlFor="events-province-select" className="sr-only">Lọc theo tỉnh thành</label>
          <select
            id="events-province-select"
            value={selectedProvinceFilter}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className="location-select"
            title="Lọc sự kiện theo tỉnh/thành"
            aria-label="Lọc sự kiện theo tỉnh thành"
          >
            <option value="ALL">Toàn quốc (Tất cả tỉnh/thành)</option>
            {VIETNAM_PROVINCES.map((prov) => (
              <option key={prov.code} value={prov.name}>
                {prov.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Pills Navigation */}
      <nav className="category-scroll-nav mb-xl" aria-label="Lọc theo thể loại sự kiện">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`category-pill flex items-center gap-1.5 ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            <Icon name={cat.icon} size="sm" ariaHidden />
            <span>{cat.label}</span>
          </button>
        ))}
      </nav>

      {/* Catalog Header Section Matching Screenshot */}
      <div className="section-header-row section-header-flex">
        <div>
          <h1
            className="section-title catalog-title"
          >
            {selectedCategory === 'ALL'
              ? 'Tất cả sự kiện đang mở bán'
              : `Sự kiện: ${CATEGORIES.find((c) => c.id === selectedCategory)?.label || selectedCategory}`}
          </h1>
          <p
            className="results-count results-count-text"
          >
            Tìm thấy {filteredEvents.length} sự kiện
          </p>
        </div>

        <div className="flex items-center gap-md flex-wrap">
          {/* Sorting Dropdown */}
          <div className="flex items-center gap-xs">
            <label htmlFor="events-sort-select" className="muted text-sm font-semibold">Sắp xếp:</label>
            <select
              id="events-sort-select"
              className="select select-compact"
              aria-label="Sắp xếp danh sách sự kiện"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date_asc">Sắp diễn ra</option>
              <option value="date_desc">Mới cập nhật</option>
              <option value="price_asc">Giá vé: Thấp đến Cao</option>
              <option value="price_desc">Giá vé: Cao đến Thấp</option>
              <option value="title_asc">Tên A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card loading-state flex flex-col items-center justify-center p-6 text-center">
          <VectorSpinner size={36} />
          <p className="muted mt-3">Đang tải danh sách sự kiện...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="alert alert-error">
          Không thể tải danh mục sự kiện: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredEvents.length === 0 && (
        <div className="card empty-state empty-state-dashed text-center p-6">
          <EmptyStateIllustration type="empty-search" size={110} />
          <h2 className="empty-state-card-heading">
            {events.length === 0 ? 'Chưa có sự kiện nào' : 'Không tìm thấy sự kiện phù hợp'}
          </h2>
          <p className="muted empty-state-card-desc">
            {events.length === 0
              ? 'Hệ thống hiện tại chưa có sự kiện nào đang mở bán.'
              : 'Hãy thử thay đổi từ khóa tìm kiếm hoặc chọn thể loại khác.'}
          </p>
          <div className="flex gap-sm justify-center flex-wrap mt-3">
            {events.length === 0 ? (
              <Link to="/organizer" className="btn btn-primary btn-pill">
                Tạo sự kiện
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-pill-sm"
                onClick={handleResetFilters}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid of Event Cards */}
      {!loading && displayedEvents.length > 0 && (
        <div className="grid-cards">
          {displayedEvents.map((event) => {
            const from = startingPrice(event.ticket_tiers || event.tiers);
            const isFav = isFavorite(event.id);

            return (
              <article key={event.id} className="event-card">
                <div className={`event-cover ${toneClass(event.category)}`}>
                  <img
                    src={eventCoverImage(event)}
                    alt={event.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }}
                  />
                  <div className="cover-meta">
                    <span className="status-pill">{event.category || event.status}</span>
                    <span className="price-chip">
                      {from === null ? 'Đang cập nhật' : from === 0 ? 'MIỄN PHÍ' : `Từ ${money(from)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn-favorite flex items-center justify-center ${isFav ? 'active' : ''}`}
                    onClick={(e) => handleToggleFav(event.id, e)}
                    title={isFav ? 'Bỏ lưu' : 'Lưu sự kiện'}
                    aria-label={isFav ? `Bỏ lưu sự kiện ${event.title}` : `Lưu sự kiện ${event.title}`}
                    aria-pressed={isFav}
                  >
                    <Icon name="heart" size="sm" fill={isFav ? 'currentColor' : 'none'} ariaHidden />
                  </button>
                </div>

                <div className="event-card-body">
                  <div className="meta-row">
                    <span className="event-date-chip">{formatDate(eventStart(event))}</span>
                    <span className="location-chip">{event.location ? event.location.split(',')[0] : 'Toàn quốc'}</span>
                  </div>

                  <h2 className="event-title">
                    <Link to={`/events/${event.id}`}>{event.title}</Link>
                  </h2>

                  <p className="event-excerpt">
                    {plainText(event.description).slice(0, 130)}...
                  </p>

                  <div className="card-actions">
                    <Link to={`/events/${event.id}`} className="btn btn-primary btn-sm btn-block">
                      <span>Xem vé & Chi tiết</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination & Load More */}
      {!loading && visibleCount < filteredEvents.length && (
        <div className="pagination-bar text-center mt-2xl">
          <p className="muted text-sm mb-085">
            Đang hiển thị {displayedEvents.length} trên tổng số {filteredEvents.length} sự kiện
          </p>
          <div className="flex justify-center gap-sm flex-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setVisibleCount((prev) => prev + 12)}
            >
              + Xem thêm 12 sự kiện
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setVisibleCount(filteredEvents.length)}
            >
              Xem tất cả ({filteredEvents.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsPage;
