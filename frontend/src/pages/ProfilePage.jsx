import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AttendeeLayout from '../components/AttendeeLayout';
import OrganizerLayout from '../components/OrganizerLayout';
import AdminLayout from '../components/AdminLayout';
import { Icon } from '../components/ui/Icon';

export const ProfilePage = () => {
  const { user, isAuthenticated, loading: authLoading, updateProfile, changePassword, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Personal Info Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  const VN_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;

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
    if (profileLoading) return;
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

    const cleanPhone = phone.trim().replace(/[\s.-]+/g, '');
    if (cleanPhone && !VN_PHONE_REGEX.test(cleanPhone)) {
      setPhoneError('Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (ví dụ: 0901234567 hoặc +84901234567).');
      return;
    }
    setPhoneError(null);

    try {
      setProfileLoading(true);
      const res = await updateProfile({
        name: name.trim(),
        email: email.trim(),
        phone: cleanPhone,
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
      setPhoneError(null);
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
              <h2 className="flex items-center gap-2">
                <Icon name="user" size="md" ariaHidden className="text-primary" />
                <span>{t('profile.personal_info', 'Thông Tin Cá Nhân')}</span>
              </h2>
              <p>Cập nhật họ tên, địa chỉ email và số điện thoại liên hệ nhận vé</p>
            </div>

            {profileSuccess && (
              <div className="alert alert-success flex items-center gap-2" role="alert" style={{ marginBottom: '1rem' }}>
                <Icon name="check" size="xs" ariaHidden />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="alert alert-error flex items-center gap-2" role="alert" style={{ marginBottom: '1rem' }}>
                <Icon name="alert-circle" size="xs" ariaHidden />
                <span>{profileError}</span>
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
                  className={`input ${phoneError ? 'input-error' : ''}`}
                  aria-invalid={!!phoneError}
                  aria-describedby={phoneError ? 'profile-phone-error' : undefined}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (phoneError) {
                      const cleaned = e.target.value.trim().replace(/[\s.-]+/g, '');
                      if (!cleaned || VN_PHONE_REGEX.test(cleaned)) {
                        setPhoneError(null);
                      }
                    }
                  }}
                  onBlur={() => {
                    const cleaned = phone.trim().replace(/[\s.-]+/g, '');
                    if (cleaned && !VN_PHONE_REGEX.test(cleaned)) {
                      setPhoneError('Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (ví dụ: 0901234567 hoặc +84901234567).');
                    } else {
                      setPhoneError(null);
                    }
                  }}
                  placeholder={t('profile.phone_placeholder', 'Ví dụ: 0901234567')}
                />
                {phoneError && (
                  <span id="profile-phone-error" className="form-error text-danger" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                    {phoneError}
                  </span>
                )}
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
                  placeholder="Vai trò tài khoản"
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
              <h2 className="flex items-center gap-2">
                <Icon name="lock" size="md" ariaHidden className="text-primary" />
                <span>{t('profile.security_info', 'Đổi Mật Khẩu Bảo Mật')}</span>
              </h2>
              <p>Bảo vệ tài khoản bằng mật khẩu an toàn có độ dài tối thiểu 8 ký tự</p>
            </div>

            {passwordSuccess && (
              <div className="alert alert-success flex items-center gap-2" role="alert" style={{ marginBottom: '1rem' }}>
                <Icon name="check" size="xs" ariaHidden />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="alert alert-error flex items-center gap-2" role="alert" style={{ marginBottom: '1rem' }}>
                <Icon name="alert-circle" size="xs" ariaHidden />
                <span>{passwordError}</span>
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
                    className="password-toggle-btn flex items-center justify-center"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    aria-pressed={showCurrentPw}
                    aria-label={showCurrentPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <Icon name={showCurrentPw ? 'eye-off' : 'eye'} size="sm" ariaHidden />
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
                    className="password-toggle-btn flex items-center justify-center"
                    onClick={() => setShowNewPw(!showNewPw)}
                    aria-pressed={showNewPw}
                    aria-label={showNewPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <Icon name={showNewPw ? 'eye-off' : 'eye'} size="sm" ariaHidden />
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
                    className="password-toggle-btn flex items-center justify-center"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    aria-pressed={showConfirmPw}
                    aria-label={showConfirmPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <Icon name={showConfirmPw ? 'eye-off' : 'eye'} size="sm" ariaHidden />
                  </button>
                </div>
              </div>

              {/* Password Requirement Checklist */}
              <ul className="pw-requirements-list">
                <li className={`pw-req-item flex items-center gap-2 ${hasMinLength ? 'is-valid' : ''}`}>
                  <Icon name={hasMinLength ? 'check-circle' : 'circle'} size="xs" ariaHidden className={hasMinLength ? 'text-success' : 'text-muted'} />
                  <span>Độ dài tối thiểu 8 ký tự</span>
                </li>
                <li className={`pw-req-item flex items-center gap-2 ${hasLetterAndNumber ? 'is-valid' : ''}`}>
                  <Icon name={hasLetterAndNumber ? 'check-circle' : 'circle'} size="xs" ariaHidden className={hasLetterAndNumber ? 'text-success' : 'text-muted'} />
                  <span>Bao gồm cả chữ cái và chữ số</span>
                </li>
                <li className={`pw-req-item flex items-center gap-2 ${passwordsMatch ? 'is-valid' : ''}`}>
                  <Icon name={passwordsMatch ? 'check-circle' : 'circle'} size="xs" ariaHidden className={passwordsMatch ? 'text-success' : 'text-muted'} />
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
      </div>
    </Layout>
  );
};

export default ProfilePage;
