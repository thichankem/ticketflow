import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

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
      <div className="auth-brand">
        <p className="eyebrow">Ticketflow</p>
        <h1>Nền Tảng Đặt Vé Sự Kiện Chuyên Nghiệp</h1>
        <p>Hệ thống đặt vé trực tuyến an toàn, nhanh chóng và tối ưu trải nghiệm cho khán giả và nhà tổ chức sự kiện.</p>
      </div>

      <div className="card auth-card">
        <h2 className="panel-title">{t('auth.login_title', 'Đăng Nhập Tài Khoản')}</h2>
        <p className="muted">{t('auth.login_sub', 'Đăng nhập để xem vé, quản lý sự kiện hoặc cài đặt tài khoản')}</p>

        {error && <div className="alert alert-error">{error}</div>}

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
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('auth.logging_in', 'Đang Đăng Nhập...') : t('auth.login_btn', 'Đăng Nhập')}
          </button>
        </form>

        <div className="auth-demo-box">
          <span className="auth-demo-label">
            {t('auth.quick_demo', 'Chọn nhanh tài khoản trải nghiệm:')}
          </span>
          <div className="auth-demo-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('attendee@ticketflow.local', 'ATTENDEE')}
              disabled={loading}
              title="Vào Cổng Khách Hàng (Mua vé, giữ chỗ 15p, nhận vé QR)"
            >
              👤 {t('role.attendee', 'Khách Mua Vé')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('organizer@ticketflow.local', 'ORGANIZER')}
              disabled={loading}
              title="Vào Studio Ban Tổ Chức (Quản lý sự kiện, vé, doanh thu, escrow)"
            >
              🎪 {t('role.organizer', 'Ban Tổ Chức')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('admin@ticketflow.local', 'ADMIN')}
              disabled={loading}
              title="Vào Trung Tâm Quản Trị Sàn (Executive Dashboard, Escrow, GMV)"
            >
              🛡️ {t('role.admin', 'Quản Trị Sàn')}
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
