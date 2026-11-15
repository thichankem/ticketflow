import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ThemeLangControls } from './ThemeLangControls';

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
          </div>

          <div className="admin-status-indicators">
            <span className="admin-status-pill escrow-pill" title="Tài khoản bảo chứng Escrow giữ 100% doanh thu an toàn">
              🔒 Escrow: Bảo chứng 100%
            </span>
            <span className="admin-status-pill health-pill" title="Trạng thái kết nối cơ sở dữ liệu và hệ thống">
              <span className="status-live-dot" aria-hidden="true" />
              Hệ thống: Sẵn sàng
            </span>
          </div>

          <nav className="portal-nav admin-nav desktop-nav" aria-label="Admin Navigation">
            <NavLink to="/admin" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{t('nav.admin_console', 'Bảng Điều Hành')}</span>
            </NavLink>

            <Link to="/organizer" className="nav-shortcut nav-link" title={t('role.organizer_sub', 'Chuyển sang góc nhìn Ban tổ chức')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M3 9h18" /><path d="M9 21V9" />
              </svg>
              <span>{t('role.organizer_sub', 'Studio BTC')}</span>
            </Link>

            <Link to="/" className="nav-shortcut nav-link" title={t('nav.view_store', 'Chuyển sang góc nhìn Khách mua vé')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" x2="22" y1="12" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{t('nav.view_store', 'Xem Trang Sàn')}</span>
            </Link>

            <ThemeLangControls />

            {isAuthenticated ? (
              <div className="nav-actions">
                <span className="user-chip user-chip-admin" title={`Admin email: ${user.email}`}>
                  <span className="user-avatar-dot dot-admin" aria-hidden="true" />
                  <span className="user-name-text">{user.name}</span>
                  <span className="chip-role">{t('nav.admin_role', 'Admin')}</span>
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
                🛡️ {t('nav.admin_console', 'Bảng Điều Hành Quản Trị')}
              </NavLink>
              <Link to="/organizer" className="drawer-link">
                🏢 {t('role.organizer_sub', 'Xem Studio Ban Tổ Chức')}
              </Link>
              <Link to="/" className="drawer-link">
                🌐 {t('nav.view_store', 'Xem Trang Sàn Khách Hàng')}
              </Link>
            </div>

            <div className="mobile-drawer-footer">
              <div className="drawer-controls-row">
                <ThemeLangControls />
              </div>
              {isAuthenticated && (
                <div className="drawer-user-info">
                  <div className="drawer-user-name">🛡️ {user.name} ({user.role})</div>
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
            <div className="footer-brand">Ticketflow Platform Administration · Executive Console</div>
            <p className="footer-desc">
              Trung tâm giám sát dòng tiền giao dịch GMV, điều phối tài khoản bảo chứng Escrow, hòa giải tranh chấp và phòng vệ an ninh toàn sàn.
            </p>
          </div>
          <div className="footer-links">
            <span className="footer-copyright">Phiên bản Quản trị 2.0</span>
            <span className="divider" aria-hidden="true">·</span>
            <span className="footer-note">Bảo chứng Escrow 100%</span>
            <span className="divider" aria-hidden="true">·</span>
            <span className="footer-note">Kill Switch Tức thời</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AdminLayout;
