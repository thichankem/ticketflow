import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';

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
      <header className="site-header organizer-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/organizer" className="logo" aria-label="Ticketflow Organizer Studio">
              <img src="/ticketflow-mark.svg" alt="Ticketflow Logo" width="34" height="34" />
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag organizer-subtag">{t('role.organizer_sub', 'Studio Ban Tổ Chức')}</span>
              </div>
            </Link>
          </div>

          <nav className="portal-nav organizer-nav desktop-nav" aria-label="Organizer Navigation">
            <NavLink to="/organizer" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" /><path d="M9 21V9" />
              </svg>
              <span>{t('nav.organizer_studio', 'Bảng Quản Trị Sự Kiện')}</span>
            </NavLink>

            <NavLink to="/organizer/events/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>{t('nav.create_event', '➕ Tạo Sự Kiện Mới')}</span>
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
                ✕
              </button>
            </div>

            <div className="mobile-drawer-links">
              <NavLink to="/organizer" end className="drawer-link active">
                {t('nav.organizer_studio', 'Bảng Quản Trị Sự Kiện')}
              </NavLink>
              <NavLink to="/notifications" className="drawer-link">
                🔔 {t('nav.notifications', 'Thông Báo Hộp Thư')}
              </NavLink>
              <NavLink to="/profile" className="drawer-link">
                {t('nav.profile', 'Hồ Sơ Cá Nhân')}
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

      <main className="portal-main organizer-main">
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
