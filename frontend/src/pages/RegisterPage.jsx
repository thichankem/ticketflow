import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/ui/Icon';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await register(name, email, password, 'ATTENDEE');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Đăng ký tài khoản không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-brand brand-workshop">
        <p className="eyebrow">Ticketflow</p>
        <h1>Đăng ký tài khoản</h1>
      </div>

      <div className="card auth-card">
        <h2 className="panel-title">{t('auth.register_title', 'Đăng Ký')}</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="regName">{t('auth.fullname_label', 'Họ và Tên *')}</label>
            <input
              id="regName"
              type="text"
              className="input"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="form-group">
            <label htmlFor="regEmail">{t('auth.email_label', 'Địa Chỉ Email *')}</label>
            <input
              id="regEmail"
              type="email"
              className="input"
              required
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="regPassword">{t('auth.password_label', 'Mật Khẩu *')}</label>
            <div className="password-input-group">
              <input
                id="regPassword"
                type={showPassword ? 'text' : 'password'}
                className="input"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
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

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('auth.registering', 'Đang Tạo Tài Khoản...') : t('auth.register_submit', 'Hoàn Tất Đăng Ký')}
          </button>
        </form>

        <p className="note auth-switch-note">
          {t('auth.have_account', 'Đã có tài khoản?')} <Link to="/login">{t('nav.login', 'Đăng nhập')}</Link>
        </p>
      </div>
    </section>
  );
};

export default RegisterPage;
