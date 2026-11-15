import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Modern Accessible Slider / Carousel Section
 * Compliant with modern-web-guidance / carousel
 * - Native CSS scroll snap with x mandatory
 * - Accessible HTML buttons with aria-label & pointer-events isolation
 * - touch-action: manipulation to eliminate double-tap delays
 * - prefers-reduced-motion respected for smooth scrolling
 * - State synchronization on scroll and scrollend
 */
export const SliderSection = ({
  id,
  badge,
  title,
  subtitle,
  actionButton,
  children,
  className = '',
  cardBasis = 'default', // 'portrait' | 'wide' | 'member' | 'star' | 'default'
}) => {
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Sync arrow buttons disabled state based on track scroll position
  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    // Allow small epsilon tolerance for float rounding
    const atStart = scrollLeft <= 4;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 6;

    setCanScrollLeft(!atStart);
    setCanScrollRight(!atEnd);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateScrollState();

    let scrollTimeout;
    const handleScroll = () => {
      // Immediate rough check
      updateScrollState();
      // Debounced settle check for browsers without scrollend
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateScrollState, 120);
    };

    // Native scrollend listener when supported
    track.addEventListener('scroll', handleScroll, { passive: true });
    if ('onscrollend' in window) {
      track.addEventListener('scrollend', updateScrollState, { passive: true });
    }

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });
    resizeObserver.observe(track);

    return () => {
      track.removeEventListener('scroll', handleScroll);
      if ('onscrollend' in window) {
        track.removeEventListener('scrollend', updateScrollState);
      }
      resizeObserver.disconnect();
      clearTimeout(scrollTimeout);
    };
  }, [updateScrollState, children]);

  // Scroll by one view segment or standard distance
  const scroll = (direction) => {
    const track = trackRef.current;
    if (!track) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollAmount = track.clientWidth * 0.75; // scroll 75% of visible view for natural peek
    const delta = direction === 'next' ? scrollAmount : -scrollAmount;

    track.scrollBy({
      left: delta,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  const carouselId = id || `carousel-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <section
      id={carouselId}
      className={`tkb-slider-section ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={typeof title === 'string' ? title : 'Danh sách sự kiện'}
    >
      {/* Header Row */}
      <div className="tkb-slider-header">
        <div className="tkb-slider-title-col">
          {badge && <div className="tkb-section-badge">{badge}</div>}
          <div className="tkb-title-row">
            <h2 className="tkb-section-title">{title}</h2>
          </div>
          {subtitle && <p className="tkb-section-subtitle">{subtitle}</p>}
        </div>

        {/* Actions & Header Controls */}
        <div className="tkb-slider-nav-wrapper">
          {actionButton}
          <div className="tkb-slider-header-arrows">
            <button
              type="button"
              className="tkb-arrow-btn"
              onClick={() => scroll('prev')}
              disabled={!canScrollLeft}
              aria-label="Cuộn sang trái"
              title="Xem các mục trước"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className="tkb-arrow-btn"
              onClick={() => scroll('next')}
              disabled={!canScrollRight}
              aria-label="Cuộn sang phải"
              title="Xem các mục tiếp theo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Slider Viewport with Edge Floating Buttons */}
      <div className="tkb-slider-viewport">
        {/* Floating Start Arrow */}
        <div className="tkb-floating-controls tkb-control-start" aria-hidden="true">
          <button
            type="button"
            className="tkb-floating-arrow-btn"
            onClick={() => scroll('prev')}
            disabled={!canScrollLeft}
            tabIndex={-1}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Scrolling Track */}
        <div
          ref={trackRef}
          className={`tkb-slider-track tkb-track-${cardBasis}`}
          tabIndex={0}
          role="group"
          aria-label="Các slide danh sách"
        >
          {React.Children.map(children, (child, index) => {
            if (!child) return null;
            return (
              <div
                className="tkb-slide-item"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${React.Children.count(children)}`}
              >
                {child}
              </div>
            );
          })}
        </div>

        {/* Floating End Arrow */}
        <div className="tkb-floating-controls tkb-control-end" aria-hidden="true">
          <button
            type="button"
            className="tkb-floating-arrow-btn"
            onClick={() => scroll('next')}
            disabled={!canScrollRight}
            tabIndex={-1}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default SliderSection;
