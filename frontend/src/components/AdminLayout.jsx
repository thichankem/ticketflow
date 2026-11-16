import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationBell from './NotificationBell';

export const AdminLayout = ({ children }) => {
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
    <div className="portal-wrapper portal-admin">
      <header className="site-header admin-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/admin" className="logo" aria-label="Ticketflow Quản Trị Sàn">
              <img src="/ticketflow-mark.svg" alt="Ticketflow Logo" width="34" height="34" />
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag admin-subtag">{t('role.admin_sub', 'Trung Tâm Quản Trị Sàn')}</span>
              </div>
            </Link>

            <div className="admin-status-indicators">
              <span className="admin-status-pill health-pill" title="Trạng thái hệ thống">
                <span className="status-live-dot" aria-hidden="true" />
                Hệ thống: Sẵn sàng
              </span>
            </div>
          </div>

          <nav className="portal-nav admin-nav desktop-nav" aria-label="Admin Navigation">
            <NavLink to="/admin" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{t('nav.admin_console', 'Bảng Điều Hành')}</span>
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
          <div className="mobile-drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu Quản trị viên">
            <div className="mobile-drawer-header">
              <div className="logo-text">
                <span className="brand-name">Ticketflow</span>
                <span className="portal-subtag admin-subtag">{t('role.admin_sub', 'Executive Admin')}</span>
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
              <NavLink to="/admin" end className="drawer-link active">
                {t('nav.admin_console', 'Bảng Điều Hành')}
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

      <main className="portal-main admin-main">
        {children}
      </main>

      <footer className="site-footer admin-footer">
        <div className="footer-inner">
          <div className="footer-brand-section">
            <div className="footer-brand">Ticketflow · Admin</div>
          </div>
          <div className="footer-links">
            <span className="footer-copyright">© 2026 Ticketflow</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AdminLayout;
