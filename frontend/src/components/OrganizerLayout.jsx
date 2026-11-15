import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ThemeLangControls } from './ThemeLangControls';

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

            <Link to="/" className="nav-shortcut public-shortcut nav-link" title={t('nav.view_store', 'Xem giao diện khách mua vé thực tế')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" x2="22" y1="12" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{t('nav.view_store', 'Xem Trang Bán Vé')}</span>
            </Link>

            <ThemeLangControls />

            {isAuthenticated ? (
              <div className="nav-actions">
                <span className="user-chip user-chip-organizer" title={`Ban tổ chức: ${user.email}`}>
                  <span className="user-avatar-dot dot-organizer" aria-hidden="true" />
                  <span className="user-name-text">{user.name}</span>
                  <span className="chip-role">{t('nav.organizer_role', 'BTC')}</span>
                </span>
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
                🎪 {t('nav.organizer_studio', 'Bảng Quản Trị Sự Kiện')}
              </NavLink>
              <Link to="/" className="drawer-link">
                🌐 {t('nav.view_store', 'Xem Trang Bán Vé Khách')}
              </Link>
            </div>

            <div className="mobile-drawer-footer">
              <div className="drawer-controls-row">
                <ThemeLangControls />
              </div>
              {isAuthenticated && (
                <div className="drawer-user-info">
                  <div className="drawer-user-name">🏢 {user.name} ({user.role})</div>
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
            <div className="footer-brand">Ticketflow · {t('role.organizer_sub', 'Organizer Studio')}</div>
            <p className="footer-desc">
              Quản lý toàn diện vòng đời sự kiện, sơ đồ chỗ ngồi, đa hạng vé, mã ưu đãi, dòng tiền bảo chứng Escrow và soát vé trực tiếp.
            </p>
          </div>
          <div className="footer-links">
            <Link to="/" className="footer-link">{t('role.attendee', 'Trang Khách Mua Vé')}</Link>
            <span className="divider" aria-hidden="true">·</span>
            <span className="footer-note">Escrow Bảo chứng 100%</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default OrganizerLayout;
