import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { ThemeLangControls } from './ThemeLangControls';
import { api } from '../services/api';
import { supabase } from '../services/supabase';

export const AttendeeLayout = ({ children }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { cartItems } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // In-App Notifications State (Phân hệ 2.6)
  const [notifications, setNotifications] = useState([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowNotifMenu(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setShowNotifMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalCartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/events/notifications');
      setNotifications(Array.isArray(res) ? res : res?.notifications || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000);

      let channel;
      if (user?.id && supabase) {
        channel = supabase
          .channel(`user-notifications-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (payload.new) {
                setNotifications((prev) => [payload.new, ...prev]);
              }
            }
          )
          .subscribe();
      }

      return () => {
        clearInterval(interval);
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    }
  }, [isAuthenticated, user?.id]);

  const handleMarkRead = async (notifId) => {
    try {
      await api.put(`/events/notifications/${notifId}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

            <a href="/my-tickets#support" className="support-nav-link nav-link">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" x2="12.01" y1="17" y2="17" />
              </svg>
              <span>{t('nav.support', 'Hỗ Trợ')}</span>
            </a>

            <ThemeLangControls />

            {isAuthenticated ? (
              <div className="nav-actions notif-bell-container">
                {/* In-App Notifications Bell (Phân hệ 2.6) */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm notif-bell-btn"
                  onClick={() => setShowNotifMenu(!showNotifMenu)}
                  title={t('nav.notifications', 'Thông báo restock & sự kiện')}
                  aria-label={t('nav.notifications', 'Thông báo')}
                  aria-expanded={showNotifMenu}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="notif-badge">{unreadCount}</span>
                  )}
                </button>

                {showNotifMenu && (
                  <div className="notif-dropdown-menu" role="dialog" aria-label="Hộp thư thông báo">
                    <div className="notif-dropdown-header">
                      <strong>{t('nav.notifications', 'Thông Báo Hộp Thư')}</strong>
                      <span className="muted text-xs">{notifications.length} {t('nav.notifications_count', 'tin')}</span>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="notif-dropdown-empty">
                        {t('nav.no_notifications', 'Chưa có thông báo mới nào')}
                      </p>
                    ) : (
                      <div className="notif-list-scroll">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`notif-item ${!n.is_read ? 'is-unread' : ''}`}
                            onClick={() => handleMarkRead(n.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="notif-item-title">{n.title}</div>
                            <div className="notif-item-desc">{n.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <span className="user-chip user-chip-attendee" title={`Đăng nhập: ${user.email}`}>
                  <span className="user-avatar-dot" aria-hidden="true" />
                  <span className="user-name-text">{user.name}</span>
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
                🎪 {t('nav.explore', 'Khám Phá')}
              </NavLink>
              <NavLink to="/events" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                📅 {t('home.all_heading', 'Tất Cả Sự Kiện')}
              </NavLink>
              <NavLink to="/my-tickets" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                🎟️ {t('nav.my_tickets', 'Vé Của Tôi')}
              </NavLink>
              <NavLink to="/checkout" className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
                🛒 {t('nav.cart', 'Giỏ Vé')} {totalCartCount > 0 && `(${totalCartCount})`}
              </NavLink>
              <a href="/my-tickets#support" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                ❓ {t('nav.support', 'Hỗ Trợ & Khiếu Nại')}
              </a>
            </div>

            <div className="mobile-drawer-footer">
              <div className="drawer-controls-row">
                <ThemeLangControls />
              </div>

              {isAuthenticated ? (
                <div className="drawer-user-info">
                  <div className="drawer-user-name">👤 {user.name} ({user.role})</div>
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
            <div className="footer-brand">Ticketflow · {t('home.hero_badge', 'Trải Nghiệm Mua Vé Đích Thực')}</div>
            <p className="footer-desc">
              {t('home.hero_sub', 'Khóa giữ vé nguyên tử 15 phút · Mỗi người một mã QR độc nhất · Thanh toán trực tuyến an toàn bảo chứng 100% Escrow.')}
            </p>
          </div>
          <div className="footer-links">
            <span className="footer-copyright">© 2026 Ticketflow Platform</span>
            <span className="divider" aria-hidden="true">·</span>
            <Link to="/my-tickets" className="footer-link">{t('nav.my_tickets', 'Tra cứu đơn hàng')}</Link>
            <span className="divider" aria-hidden="true">·</span>
            <a href="/my-tickets#support" className="footer-link">{t('nav.support', 'Trung tâm trợ giúp')}</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AttendeeLayout;
