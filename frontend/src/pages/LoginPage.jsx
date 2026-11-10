import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
  };

  return (
    <section className="auth-shell">
      <div className="auth-brand">
        <p className="eyebrow">Ticketflow</p>
        <h1>The door list starts here.</h1>
        <p>Sign in to hold tickets, scan barcodes, or watch the floor.</p>
      </div>

      <div className="card auth-card">
        <h2 className="panel-title">Welcome Back</h2>
        <p className="muted">Sign in to manage your tickets and events</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem' }}>
          <span className="note muted">Quick Demo Accounts</span>
          <div className="demo-row" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleQuickLogin('admin@ticketflow.local')}>
              Admin
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleQuickLogin('organizer@ticketflow.local')}>
              Organizer
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleQuickLogin('attendee@ticketflow.local')}>
              Attendee
            </button>
          </div>
        </div>

        <p className="note" style={{ marginTop: '1.25rem' }}>
          Don't have an account? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </section>
  );
};

export default LoginPage;
