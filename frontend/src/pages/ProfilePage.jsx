import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AttendeeLayout from '../components/AttendeeLayout';
import OrganizerLayout from '../components/OrganizerLayout';
import AdminLayout from '../components/AdminLayout';

export const ProfilePage = () => {
  const { user, isAuthenticated, loading: authLoading, updateProfile, changePassword, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Personal Info Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  // Sync initial user data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/profile');
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !user) {
    return (
      <AttendeeLayout>
        <div className="page-suspense-fallback" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      </AttendeeLayout>
    );
  }

  // Password rules validation
  const hasMinLength = newPassword.length >= 8;
  const hasLetterAndNumber = /(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isPasswordValid = hasMinLength && hasLetterAndNumber && passwordsMatch;

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!name.trim()) {
      setProfileError('Vui lòng nhập họ và tên');
      return;
    }
    if (!email.trim()) {
      setProfileError('Vui lòng nhập địa chỉ email');
      return;
    }

    try {
      setProfileLoading(true);
      const res = await updateProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      setProfileSuccess(res?.message || t('profile.update_success', 'Cập nhật thông tin hồ sơ thành công!'));
    } catch (err) {
      setProfileError(err.message || 'Không thể cập nhật hồ sơ. Vui lòng thử lại.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleResetProfileForm = () => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setProfileError(null);
      setProfileSuccess(null);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    if (!isPasswordValid) {
      if (!hasMinLength) {
        setPasswordError('Mật khẩu mới phải có tối thiểu 8 ký tự');
      } else if (!hasLetterAndNumber) {
        setPasswordError('Mật khẩu mới phải bao gồm cả chữ cái và chữ số');
      } else if (!passwordsMatch) {
        setPasswordError('Mật khẩu xác nhận không trùng khớp');
      }
      return;
    }

    try {
      setPasswordLoading(true);
      const res = await changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(res?.message || t('profile.password_success', 'Đổi mật khẩu thành công!'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const userInitial = (user.name || user.email || 'U').charAt(0).toUpperCase();

  // Dynamic Layout selection based on user's active role
  const Layout = user.role === 'ADMIN' ? AdminLayout : user.role === 'ORGANIZER' ? OrganizerLayout : AttendeeLayout;

  return (
    <Layout>
      <div className="profile-shell">
        {/* Profile Hero Header */}
        <section className="profile-header-banner">
          <div className="profile-user-summary">
            <div className="profile-avatar-circle" aria-hidden="true">
              {userInitial}
            </div>
            <div className="profile-user-details">
              <h1>{user.name}</h1>
              <div className="profile-user-meta">
                <span className="badge badge-primary">{user.role}</span>
                <span>•</span>
                <span>{user.email}</span>
                {user.phone && (
                  <>
                    <span>•</span>
                    <span>{user.phone}</span>
                  </>
                )}
                <span>•</span>
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Đang hoạt động</span>
              </div>
            </div>
          </div>

          <div className="profile-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              {t('nav.logout', 'Đăng Xuất')}
            </button>
          </div>
        </section>

        {/* Main 2-Column Grid */}
        <div className="profile-grid">
          {/* Card 1: Thông tin cá nhân (Tên, Email, SĐT) */}
          <div className="card profile-card">
            <div className="profile-card-header">
              <h2>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {t('profile.personal_info', 'Thông Tin Cá Nhân')}
              </h2>
              <p>Cập nhật họ tên, địa chỉ email và số điện thoại liên hệ nhận vé</p>
            </div>

            {profileSuccess && (
              <div className="alert alert-success" role="alert" style={{ marginBottom: '1rem' }}>
                ✓ {profileSuccess}
              </div>
            )}

            {profileError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
                ✕ {profileError}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="profile-name">{t('profile.name', 'Họ và Tên *')}</label>
                <input
                  id="profile-name"
                  type="text"
                  className="input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>

              <div className="form-group">
                <label htmlFor="profile-email">{t('profile.email', 'Địa Chỉ Email *')}</label>
                <input
                  id="profile-email"
                  type="email"
                  className="input"
                  required
                  autoCapitalize="none"
                  spellCheck="false"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <small className="muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem' }}>
                  Email được dùng để đăng nhập và nhận vé điện tử, mã QR.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="profile-phone">{t('profile.phone', 'Số Điện Thoại')}</label>
                <input
                  id="profile-phone"
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('profile.phone_placeholder', 'Ví dụ: 0901234567')}
                />
                <small className="muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem' }}>
                  Dùng để liên hệ khẩn cấp hoặc gửi thông báo sự kiện quan trọng.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="profile-role">{t('profile.role', 'Vai Trò Tài Khoản')}</label>
                <input
                  id="profile-role"
                  type="text"
                  className="input"
                  value={user.role}
                  readOnly
                  disabled
                  style={{ opacity: 0.8, cursor: 'not-allowed', background: 'rgba(0,0,0,0.03)' }}
                />
              </div>

              <div className="profile-actions-row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={profileLoading}
                >
                  {profileLoading ? t('profile.saving_btn', 'Đang Lưu...') : t('profile.save_btn', 'Lưu Thay Đổi')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleResetProfileForm}
                  disabled={profileLoading}
                >
                  Đặt lại
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Đổi Mật Khẩu */}
          <div className="card profile-card">
            <div className="profile-card-header">
              <h2>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {t('profile.security_info', 'Đổi Mật Khẩu Bảo Mật')}
              </h2>
              <p>Bảo vệ tài khoản bằng mật khẩu an toàn có độ dài tối thiểu 8 ký tự</p>
            </div>

            {passwordSuccess && (
              <div className="alert alert-success" role="alert" style={{ marginBottom: '1rem' }}>
                ✓ {passwordSuccess}
              </div>
            )}

            {passwordError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
                ✕ {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="current-password">{t('profile.current_password', 'Mật Khẩu Hiện Tại *')}</label>
                <div className="password-input-group">
                  <input
                    id="current-password"
                    type={showCurrentPw ? 'text' : 'password'}
                    className="input"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    aria-pressed={showCurrentPw}
                    aria-label={showCurrentPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showCurrentPw ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="new-password">{t('profile.new_password', 'Mật Khẩu Mới *')}</label>
                <div className="password-input-group">
                  <input
                    id="new-password"
                    type={showNewPw ? 'text' : 'password'}
                    className="input"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPw(!showNewPw)}
                    aria-pressed={showNewPw}
                    aria-label={showNewPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showNewPw ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">{t('profile.confirm_password', 'Xác Nhận Mật Khẩu Mới *')}</label>
                <div className="password-input-group">
                  <input
                    id="confirm-password"
                    type={showConfirmPw ? 'text' : 'password'}
                    className="input"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    aria-pressed={showConfirmPw}
                    aria-label={showConfirmPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showConfirmPw ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {/* Password Requirement Checklist */}
              <ul className="pw-requirements-list">
                <li className={`pw-req-item ${hasMinLength ? 'is-valid' : ''}`}>
                  <span>{hasMinLength ? '✓' : '○'}</span>
                  <span>Độ dài tối thiểu 8 ký tự</span>
                </li>
                <li className={`pw-req-item ${hasLetterAndNumber ? 'is-valid' : ''}`}>
                  <span>{hasLetterAndNumber ? '✓' : '○'}</span>
                  <span>Bao gồm cả chữ cái và chữ số</span>
                </li>
                <li className={`pw-req-item ${passwordsMatch ? 'is-valid' : ''}`}>
                  <span>{passwordsMatch ? '✓' : '○'}</span>
                  <span>Hai mật khẩu mới trùng khớp</span>
                </li>
              </ul>

              <div className="profile-actions-row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordLoading ? t('profile.changing_password_btn', 'Đang Cập Nhật...') : t('profile.change_password_btn', 'Cập Nhật Mật Khẩu')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Quick Links Section */}
        <section className="profile-quick-links">
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {t('profile.overview', 'Lối Tắt & Quản Lý Hoạt Động')}
          </h2>

          <div className="quick-links-grid">
            <Link to="/my-tickets" className="quick-link-card">
              <div className="quick-link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
                </svg>
              </div>
              <div className="quick-link-info">
                <h3>{t('nav.my_tickets', 'Vé Của Tôi')}</h3>
                <p>Xem vé điện tử, mã QR và hóa đơn đã đặt</p>
              </div>
            </Link>

            <Link to="/notifications" className="quick-link-card">
              <div className="quick-link-icon" style={{ color: '#0f766e', background: 'rgba(15, 118, 110, 0.1)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <div className="quick-link-info">
                <h3>{t('nav.notifications', 'Hộp Thư & Thông Báo')}</h3>
                <p>Xem toàn bộ thông báo hệ thống, restock vé và tin tức sàn</p>
              </div>
            </Link>

            <Link to="/events" className="quick-link-card">
              <div className="quick-link-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              </div>
              <div className="quick-link-info">
                <h3>{t('nav.explore', 'Khám Phá Sự Kiện')}</h3>
                <p>Tìm kiếm sự kiện âm nhạc, hội thảo, thể thao</p>
              </div>
            </Link>

            {user.role === 'ORGANIZER' && (
              <Link to="/organizer" className="quick-link-card">
                <div className="quick-link-icon" style={{ color: '#7c3aed', background: 'rgba(124, 58, 237, 0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M3 9h18" /><path d="M9 21V9" />
                  </svg>
                </div>
                <div className="quick-link-info">
                  <h3>{t('nav.organizer_studio', 'Studio Ban Tổ Chức')}</h3>
                  <p>Quản lý sự kiện, hạng vé và danh sách người tham dự</p>
                </div>
              </Link>
            )}

            {user.role === 'ADMIN' && (
              <Link to="/admin" className="quick-link-card">
                <div className="quick-link-icon" style={{ color: '#ea580c', background: 'rgba(234, 88, 12, 0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="quick-link-info">
                  <h3>{t('nav.admin_console', 'Bảng Điều Hành')}</h3>
                  <p>Quản trị người dùng, sự kiện và kiểm toán tài chính</p>
                </div>
              </Link>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ProfilePage;
