import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';

export const AttendeeLayout = ({ children }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { cartItems } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalCartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="portal-wrapper portal-attendee">
      <header className="site-header attendee-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/" className="logo" aria-label="Ticketflow Trang chủ">
              <img src="/ticketflow-mark.svg" alt="Ticketflow Logo" width="34" height="34" />
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag attendee-subtag">{t('role.attendee_sub', 'Vé Sự Kiện Trực Tuyến')}</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="portal-nav attendee-nav desktop-nav" aria-label="Chính">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>{t('nav.explore', 'Khám Phá')}</span>
            </NavLink>

            <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              <span>{t('home.all_heading', 'Tất Cả Sự Kiện')}</span>
            </NavLink>

            <NavLink to="/my-tickets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
              </svg>
              <span>{t('nav.my_tickets', 'Vé Của Tôi')}</span>
            </NavLink>

            <NavLink to="/checkout" className={({ isActive }) => `cart-nav-link nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
              <span>{t('nav.cart', 'Giỏ Vé')}</span>
              {totalCartCount > 0 && (
                <span className="badge badge-primary cart-badge animate-pulse" aria-label={`${totalCartCount} vé`}>
                  {totalCartCount}
                </span>
              )}
            </NavLink>

            {isAuthenticated ? (
              <div className="nav-actions">
                <NotificationBell />

                <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Hồ sơ tài khoản">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>{t('nav.profile', 'Hồ Sơ')}</span>
                </NavLink>
                <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm">
                  {t('nav.logout', 'Đăng Xuất')}
                </button>
              </div>
            ) : (
              <div className="nav-actions">
                <Link to="/login" className="btn btn-secondary btn-sm">
                  {t('nav.login', 'Đăng Nhập')}
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  {t('nav.register', 'Đăng Ký')}
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
            aria-expanded={mobileMenuOpen}
          >
            <span className={`hamburger-bar ${mobileMenuOpen ? 'is-active' : ''}`} />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu điều hướng di động">
            <div className="mobile-drawer-header">
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag attendee-subtag">{t('role.attendee_sub', 'Vé Sự Kiện')}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
              >
                ✕
              </button>
            </div>

            <div className="mobile-drawer-links">
              <NavLink to="/" end className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                {t('nav.explore', 'Khám Phá')}
              </NavLink>
              <NavLink to="/events" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                {t('home.all_heading', 'Tất Cả Sự Kiện')}
              </NavLink>
              <NavLink to="/my-tickets" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                {t('nav.my_tickets', 'Vé Của Tôi')}
              </NavLink>
              <NavLink to="/checkout" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                {t('nav.cart', 'Giỏ Vé')} {totalCartCount > 0 && `(${totalCartCount})`}
              </NavLink>
              {isAuthenticated && (
                <>
                  <NavLink to="/notifications" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                    🔔 {t('nav.notifications', 'Thông Báo Hộp Thư')}
                  </NavLink>
                  <NavLink to="/profile" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                    {t('nav.profile', 'Hồ Sơ Cá Nhân')}
                  </NavLink>
                </>
              )}
            </div>

            <div className="mobile-drawer-footer">
              {isAuthenticated ? (
                <div className="drawer-user-info">
                  <Link to="/profile" className="drawer-user-name" style={{ display: 'block', marginBottom: '8px', color: 'inherit', textDecoration: 'none' }}>
                    <strong>{user.name}</strong> ({user.role}) &rarr; {t('nav.profile', 'Hồ Sơ')}
                  </Link>
                  <button type="button" onClick={handleLogout} className="btn btn-secondary btn-block btn-sm">
                    {t('nav.logout', 'Đăng Xuất')}
                  </button>
                </div>
              ) : (
                <div className="drawer-auth-buttons">
                  <Link to="/login" className="btn btn-secondary btn-block">
                    {t('nav.login', 'Đăng Nhập')}
                  </Link>
                  <Link to="/register" className="btn btn-primary btn-block">
                    {t('nav.register', 'Đăng Ký')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="portal-main attendee-main">
        {children}
      </main>

      <footer className="site-footer attendee-footer">
        <div className="footer-inner">
          <div className="footer-brand-section">
            <div className="footer-brand">Ticketflow</div>
          </div>
          <div className="footer-links">
            <span className="footer-copyright">© 2026 Ticketflow</span>
            <span className="divider" aria-hidden="true">&bull;</span>
            <Link to="/my-tickets" className="footer-link">{t('nav.my_tickets', 'Vé của tôi')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AttendeeLayout;
