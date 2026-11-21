import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';
import { Icon } from './ui/Icon';
import { BrandMark } from './ui/BrandLogo';

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
      <a href="#main-content" className="skip-link">
        {t('common.skip_to_content', 'Chuyển đến nội dung chính')}
      </a>
      <header className="site-header attendee-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/" className="logo" aria-label="Ticketflow Trang chủ">
              <BrandMark size={34} />
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag attendee-subtag">{t('role.attendee_sub', 'Vé Sự Kiện Trực Tuyến')}</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="portal-nav attendee-nav desktop-nav" aria-label="Chính">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="home" size="sm" ariaHidden />
              <span>{t('nav.explore', 'Khám Phá')}</span>
            </NavLink>

            <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="calendar" size="sm" ariaHidden />
              <span>{t('home.all_heading', 'Tất Cả Sự Kiện')}</span>
            </NavLink>

            <NavLink to="/my-tickets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="ticket" size="sm" ariaHidden />
              <span>{t('nav.my_tickets', 'Vé Của Tôi')}</span>
            </NavLink>

            <NavLink to="/checkout" className={({ isActive }) => `cart-nav-link nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="cart" size="sm" ariaHidden />
              <span>{t('nav.cart', 'Giỏ Vé')}</span>
              {totalCartCount > 0 && (
                <span className="badge badge-primary cart-badge animate-pulse" aria-label={`${totalCartCount} vé`}>
                  {totalCartCount}
                </span>
              )}
            </NavLink>

            {isAuthenticated && user?.role === 'ORGANIZER' && (
              <NavLink to="/organizer" className={({ isActive }) => `nav-link nav-link-role ${isActive ? 'active' : ''}`} title="Studio Ban Tổ Chức">
                <Icon name="studio" size="sm" ariaHidden />
                <span>{t('nav.organizer_studio_short', 'Studio')}</span>
              </NavLink>
            )}

            {isAuthenticated && user?.role === 'ADMIN' && (
              <NavLink to="/admin" className={({ isActive }) => `nav-link nav-link-role ${isActive ? 'active' : ''}`} title="Quản Trị Hệ Thống">
                <Icon name="shield" size="sm" ariaHidden />
                <span>{t('nav.admin_console_short', 'Quản Trị')}</span>
              </NavLink>
            )}

            {isAuthenticated ? (
              <div className="nav-actions">
                <NotificationBell />

                <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Hồ sơ tài khoản">
                  <Icon name="user" size="sm" ariaHidden />
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
                <Icon name="x" size="md" ariaHidden />
              </button>
            </div>

            <div className="mobile-drawer-links">
              <NavLink to="/" end className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="home" size="sm" ariaHidden className="mr-2" />
                {t('nav.explore', 'Khám Phá')}
              </NavLink>
              <NavLink to="/events" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="calendar" size="sm" ariaHidden className="mr-2" />
                {t('home.all_heading', 'Tất Cả Sự Kiện')}
              </NavLink>
              <NavLink to="/my-tickets" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="ticket" size="sm" ariaHidden className="mr-2" />
                {t('nav.my_tickets', 'Vé Của Tôi')}
              </NavLink>
              <NavLink to="/checkout" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="cart" size="sm" ariaHidden className="mr-2" />
                {t('nav.cart', 'Giỏ Vé')} {totalCartCount > 0 && `(${totalCartCount})`}
              </NavLink>
              {isAuthenticated && (
                <>
                  {user?.role === 'ORGANIZER' && (
                    <NavLink to="/organizer" className={({ isActive }) => `drawer-link drawer-link-role ${isActive ? 'active' : ''}`}>
                      <Icon name="studio" size="sm" ariaHidden className="mr-2" />
                      {t('nav.organizer_studio', 'Studio Ban Tổ Chức')}
                    </NavLink>
                  )}
                  {user?.role === 'ADMIN' && (
                    <NavLink to="/admin" className={({ isActive }) => `drawer-link drawer-link-role ${isActive ? 'active' : ''}`}>
                      <Icon name="shield" size="sm" ariaHidden className="mr-2" />
                      {t('nav.admin_console', 'Quản Trị Hệ Thống')}
                    </NavLink>
                  )}
                  <NavLink to="/notifications" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                    <Icon name="bell" size="sm" ariaHidden className="mr-2" />
                    {t('nav.notifications', 'Thông Báo Hộp Thư')}
                  </NavLink>
                  <NavLink to="/profile" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                    <Icon name="user" size="sm" ariaHidden className="mr-2" />
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

      <main id="main-content" tabIndex={-1} className="portal-main attendee-main">
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
