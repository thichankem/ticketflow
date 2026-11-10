import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ATTENDEE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await register(name, email, password, role);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-brand brand-workshop">
        <p className="eyebrow">Ticketflow</p>
        <h1>Join Ticketflow.</h1>
        <p>Buy a ticket, or open the door for everyone else.</p>
      </div>

      <div className="card auth-card">
        <h2 className="panel-title">Create an Account</h2>
        <p className="muted">Join Ticketflow to buy tickets or host your own events</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="regName">Full Name *</label>
            <input
              id="regName"
              type="text"
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="regEmail">Email Address *</label>
            <input
              id="regEmail"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="regPassword">Password *</label>
            <input
              id="regPassword"
              type="password"
              className="input"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="form-group">
            <label htmlFor="regRole">I want to...</label>
            <select
              id="regRole"
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="ATTENDEE">Attend events & buy tickets</option>
              <option value="ORGANIZER">Organize & sell event tickets</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="note" style={{ marginTop: '1.25rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
};

export default RegisterPage;
