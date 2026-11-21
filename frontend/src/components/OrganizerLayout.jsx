import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';
import { Icon } from './ui/Icon';
import { BrandMark } from './ui/BrandLogo';

export const OrganizerLayout = ({ children }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="portal-wrapper portal-organizer">
      <a href="#main-content" className="skip-link">
        {t('common.skip_to_content', 'Chuyển đến nội dung chính')}
      </a>
      <header className="site-header organizer-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/organizer" className="logo" aria-label="Ticketflow Organizer Studio">
              <BrandMark size={34} />
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag organizer-subtag">{t('role.organizer_sub', 'Studio Ban Tổ Chức')}</span>
              </div>
            </Link>
          </div>

          <nav className="portal-nav organizer-nav desktop-nav" aria-label="Organizer Navigation">
            <NavLink to="/organizer" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="studio" size="sm" ariaHidden />
              <span>{t('nav.organizer_studio', 'Bảng Quản Trị Sự Kiện')}</span>
            </NavLink>

            <NavLink to="/organizer/events/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="plus" size="sm" ariaHidden />
              <span>{t('nav.create_event', 'Tạo Sự Kiện Mới')}</span>
            </NavLink>

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
              </div>
            )}
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
          >
            <span className={`hamburger-bar ${mobileMenuOpen ? 'is-active' : ''}`} />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu BTC">
            <div className="mobile-drawer-header">
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag organizer-subtag">{t('role.organizer_sub', 'Organizer')}</span>
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
              <NavLink to="/organizer" end className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="studio" size="sm" ariaHidden className="mr-2" />
                {t('nav.organizer_studio', 'Bảng Quản Trị Sự Kiện')}
              </NavLink>
              <NavLink to="/organizer/events/new" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="plus" size="sm" ariaHidden className="mr-2" />
                {t('nav.create_event', 'Tạo Sự Kiện Mới')}
              </NavLink>
              <NavLink to="/notifications" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="bell" size="sm" ariaHidden className="mr-2" />
                {t('nav.notifications', 'Thông Báo Hộp Thư')}
              </NavLink>
              <NavLink to="/profile" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="user" size="sm" ariaHidden className="mr-2" />
                {t('nav.profile', 'Hồ Sơ Cá Nhân')}
              </NavLink>
              <NavLink to="/" end className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                <Icon name="ticket" size="sm" ariaHidden className="mr-2" />
                {t('role.attendee', 'Trang Khách Mua Vé')}
              </NavLink>
            </div>

            <div className="mobile-drawer-footer">
              {isAuthenticated && (
                <div className="drawer-user-info">
                  <Link to="/profile" className="drawer-user-name" style={{ display: 'block', marginBottom: '8px', color: 'inherit', textDecoration: 'none' }}>
                    <strong>{user.name}</strong> ({user.role}) &rarr; {t('nav.profile', 'Hồ Sơ')}
                  </Link>
                  <button type="button" onClick={handleLogout} className="btn btn-secondary btn-block btn-sm">
                    {t('nav.logout', 'Đăng Xuất')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="portal-main organizer-main">
        {children}
      </main>

      <footer className="site-footer organizer-footer">
        <div className="footer-inner">
          <div className="footer-brand-section">
            <div className="footer-brand">Ticketflow · Organizer</div>
          </div>
          <div className="footer-links">
            <Link to="/" className="footer-link">{t('role.attendee', 'Trang Khách Mua Vé')}</Link>
            <span className="divider" aria-hidden="true">&bull;</span>
            <span className="footer-copyright">© 2026 Ticketflow</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default OrganizerLayout;
