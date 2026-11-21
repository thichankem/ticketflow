import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from '../ui/Icon';
import { EVENT_CATEGORIES } from '../../utils/display';

export const CategoryScrollNav = ({
  categories = EVENT_CATEGORIES,
  selectedCategory = null,
  onSelectCategory,
  className = '',
  ariaLabel = 'Danh mục sự kiện',
}) => {
  const navRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollState = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + 4;
    setCanScrollLeft(hasOverflow && scrollLeft > 4);
    setCanScrollRight(hasOverflow && scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    checkScrollState();

    const handleScroll = () => {
      checkScrollState();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    if ('onscrollend' in window) {
      el.addEventListener('scrollend', handleScroll, { passive: true });
    }

    const resizeObserver = new ResizeObserver(() => {
      checkScrollState();
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      if ('onscrollend' in window) {
        el.removeEventListener('scrollend', handleScroll);
      }
      resizeObserver.disconnect();
    };
  }, [checkScrollState, categories]);

  const handleScroll = (direction) => {
    const el = navRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.65, 240);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`category-scroll-wrapper ${className}`}>
      <button
        type="button"
        className="tkb-arrow-btn category-nav-arrow category-nav-arrow-left"
        onClick={() => handleScroll('left')}
        disabled={!canScrollLeft}
        aria-label="Cuộn danh mục sang trái"
        title="Xem danh mục trước"
      >
        <Icon name="chevron-left" size={18} ariaHidden />
      </button>

      <nav
        ref={navRef}
        className="category-scroll-nav"
        aria-label={ariaLabel}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={`category-pill flex items-center gap-1.5 ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory && onSelectCategory(cat.id)}
              aria-pressed={isActive}
            >
              <Icon name={cat.icon} size="sm" ariaHidden />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="tkb-arrow-btn category-nav-arrow category-nav-arrow-right"
        onClick={() => handleScroll('right')}
        disabled={!canScrollRight}
        aria-label="Cuộn danh mục sang phải"
        title="Xem các danh mục tiếp theo"
      >
        <Icon name="chevron-right" size={18} ariaHidden />
      </button>
    </div>
  );
};

export default CategoryScrollNav;
