import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './ui/Icon';

export const RoleSwitcherBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, switchDemoRole } = useAuth();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [switching, setSwitching] = useState(false);

  // Determine current active portal by pathname
  const currentPath = location.pathname;
  let activeRole = 'ATTENDEE';
  if (currentPath.startsWith('/admin')) {
    activeRole = 'ADMIN';
  } else if (currentPath.startsWith('/organizer')) {
    activeRole = 'ORGANIZER';
  }

  const handleRoleSelect = async (role, path) => {
    if (switching) return;
    if (user?.role === 'ADMIN' && role === 'ORGANIZER') {
      return; // Quản trị viên sàn (Super Admin) không thể sang giao diện Ban tổ chức
    }
    try {
      setSwitching(true);
      await switchDemoRole(role);
      navigate(path);
    } catch (err) {
      console.error('Quick role switch failed:', err);
      navigate(path);
    } finally {
      setSwitching(false);
    }
  };

  const getWorkspaceTitle = () => {
    if (activeRole === 'ADMIN') return t('role.admin', 'Quản Trị Sàn');
    if (activeRole === 'ORGANIZER') return t('role.organizer', 'Ban Tổ Chức');
    return t('role.attendee', 'Khách Mua Vé');
  };

  return (
    <aside className={`role-switcher-banner ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('role.title', 'HỆ THỐNG VAI TRÒ')}>
      <div className="role-switcher-container">
        <div className="role-switcher-meta">
          <span className="role-switcher-label">
            <span className="workspace-prefix">{t('role.workspace', 'Không gian:')}</span> <strong>{getWorkspaceTitle()}</strong>
          </span>
        </div>

        {!collapsed && (
          <div className="role-switcher-buttons" role="tablist" aria-label="Chuyển đổi vai trò">
            <button
              type="button"
              role="tab"
              aria-selected={activeRole === 'ATTENDEE'}
              className={`role-btn role-btn-attendee ${activeRole === 'ATTENDEE' ? 'active' : ''}`}
              onClick={() => handleRoleSelect('ATTENDEE', '/')}
              disabled={switching}
              title={t('role.attendee', 'Khách Mua Vé')}
            >
              <span className="role-name">{t('role.attendee', 'Khách Mua Vé')}</span>
              <span className="role-sub">Khách hàng</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeRole === 'ORGANIZER'}
              className={`role-btn role-btn-organizer ${activeRole === 'ORGANIZER' ? 'active' : ''} ${user?.role === 'ADMIN' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleRoleSelect('ORGANIZER', '/organizer')}
              disabled={switching || user?.role === 'ADMIN'}
              title={user?.role === 'ADMIN' ? 'Quản trị viên sàn (Super Admin) không thể sang không gian Ban tổ chức' : t('role.organizer', 'Ban Tổ Chức')}
            >
              <span className="role-name">{t('role.organizer', 'Ban Tổ Chức')}</span>
              <span className="role-sub">{user?.role === 'ADMIN' ? 'Bị khóa' : 'Ban tổ chức'}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeRole === 'ADMIN'}
              className={`role-btn role-btn-admin ${activeRole === 'ADMIN' ? 'active' : ''}`}
              onClick={() => handleRoleSelect('ADMIN', '/admin')}
              disabled={switching}
              title={t('role.admin', 'Quản Trị Sàn')}
            >
              <span className="role-name">{t('role.admin', 'Quản Trị Sàn')}</span>
              <span className="role-sub">Quản trị viên</span>
            </button>
          </div>
        )}

        <div className="role-switcher-actions">
          {switching && <span className="role-switching-indicator animate-pulse">{t('role.switching', 'Đang đổi phiên...')}</span>}
          {user && (
            <span className="current-user-tag" title={`Tài khoản: ${user.email}`}>
              <span className="dot-online" aria-hidden="true" />
              <strong>{user.name}</strong> <span className="user-role-pill">({user.role})</span>
            </span>
          )}

          <button
            type="button"
            className="role-collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('role.expand', 'Mở rộng') : t('role.collapse', 'Thu gọn')}
            aria-label={collapsed ? 'Mở rộng thanh vai trò' : 'Thu gọn thanh vai trò'}
          >
            <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size="sm" ariaHidden />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RoleSwitcherBar;
