import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/ui/Icon';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const redirectByRole = (userRole) => {
    const role = (userRole || '').toUpperCase();
    if (role === 'ADMIN') {
      navigate('/admin');
    } else if (role === 'ORGANIZER') {
      navigate('/organizer');
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await login(email, password);
      redirectByRole(res?.user?.role);
    } catch (err) {
      setError(err.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail, defaultRole) => {
    setEmail(demoEmail);
    setPassword('password123');
    try {
      setLoading(true);
      setError(null);
      const res = await login(demoEmail, 'password123');
      redirectByRole(res?.user?.role || defaultRole);
    } catch (err) {
      setError(err.message || 'Đăng nhập nhanh thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="card auth-card">
        <div className="auth-card-header">
          <h1 className="panel-title">{t('auth.login_title', 'Đăng Nhập')}</h1>
          <p className="auth-card-subtitle">Nhập thông tin tài khoản của bạn để tiếp tục</p>
        </div>

        {error && (
          <div className="alert alert-error">
            <Icon name="alert-circle" size="sm" ariaHidden />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t('auth.email_label', 'Địa Chỉ Email')}</label>
            <input
              id="email"
              type="email"
              className="input"
              required
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password_label', 'Mật Khẩu')}</label>
            <div className="password-input-group">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="password-toggle-btn flex items-center justify-center"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size="sm" ariaHidden />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block auth-submit-btn" disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="spinner spinner-sm" aria-hidden="true" />
                <span>{t('auth.logging_in', 'Đang Đăng Nhập...')}</span>
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <span>{t('auth.login_btn', 'Đăng Nhập')}</span>
                <span aria-hidden="true">&rarr;</span>
              </span>
            )}
          </button>
        </form>

        <div className="auth-demo-box">
          <div className="auth-demo-header">
            <span className="auth-demo-label">
              <Icon name="sparkles" size="xs" ariaHidden />
              <span>{t('auth.quick_demo', 'Tài khoản thử nghiệm:')}</span>
            </span>
          </div>
          <div className="auth-demo-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm auth-demo-btn"
              onClick={() => handleQuickLogin('attendee@ticketflow.local', 'ATTENDEE')}
              disabled={loading}
              title="Đăng nhập Khách Mua Vé (attendee@ticketflow.local)"
            >
              <span className="auth-demo-role">{t('role.attendee', 'Khách Mua Vé')}</span>
              <span className="auth-demo-hint">attendee@</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm auth-demo-btn"
              onClick={() => handleQuickLogin('organizer@ticketflow.local', 'ORGANIZER')}
              disabled={loading}
              title="Đăng nhập Ban Tổ Chức (organizer@ticketflow.local)"
            >
              <span className="auth-demo-role">{t('role.organizer', 'Ban Tổ Chức')}</span>
              <span className="auth-demo-hint">organizer@</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm auth-demo-btn"
              onClick={() => handleQuickLogin('admin@ticketflow.local', 'ADMIN')}
              disabled={loading}
              title="Đăng nhập Quản Trị Sàn (admin@ticketflow.local)"
            >
              <span className="auth-demo-role">{t('role.admin', 'Quản Trị Sàn')}</span>
              <span className="auth-demo-hint">admin@</span>
            </button>
          </div>
        </div>

        <p className="note auth-switch-note">
          {t('auth.no_account', 'Chưa có tài khoản?')} <Link to="/register">{t('auth.register_now', 'Đăng ký tài khoản mới')}</Link>
        </p>
      </div>
    </section>
  );
};

export default LoginPage;
