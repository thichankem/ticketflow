import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export const AdminPage = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suspendId, setSuspendId] = useState('');
  const [suspendMsg, setSuspendMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const res = await api.get('/admin/stats');
        if (isMounted) setStats(res);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, []);

  const handleSuspend = async (e) => {
    e.preventDefault();
    if (!suspendId) return;
    try {
      setSuspendMsg('Processing suspension...');
      const res = await api.post(`/admin/users/${suspendId}/suspend`, {});
      setSuspendMsg(`Success: User #${res.user.id} suspended.`);
      setSuspendId('');
    } catch (err) {
      setSuspendMsg(`Error: ${err.message}`);
    }
  };

  return (
    <section>
      <header className="page-head">
        <span className="badge badge-primary">Admin</span>
        <h1>Floor overview</h1>
        <p>Platform totals and account moderation. Same controls, quieter desk.</p>
      </header>

      {error && (
        <div className="alert alert-error">
          {error.includes('Forbidden') || error.includes('Unauthorized')
            ? 'Access Denied: You must be signed in as an Admin to access this view.'
            : error}
        </div>
      )}

      {loading && <div className="card loading-state">Loading platform statistics...</div>}

      {stats && (
        <>
          <div className="kpi-grid">
            <article className="card kpi">
              <span className="muted">Total Gross Sales</span>
              <strong>${(stats.gross_sales / 100).toFixed(2)}</strong>
            </article>
            <article className="card kpi">
              <span className="muted">Total Orders</span>
              <strong>{stats.total_orders}</strong>
            </article>
            <article className="card kpi">
              <span className="muted">Live Events</span>
              <strong>{stats.total_events}</strong>
            </article>
            <article className="card kpi">
              <span className="muted">Registered Users</span>
              <strong>{stats.total_users}</strong>
            </article>
          </div>

          <section className="card" style={{ maxWidth: '560px' }}>
            <h2 className="panel-title">User Moderation & Suspension</h2>
            <form onSubmit={handleSuspend}>
              <div className="form-group">
                <label htmlFor="userIdInput">Target User ID</label>
                <div className="promo-row">
                  <input
                    id="userIdInput"
                    type="number"
                    className="input"
                    placeholder="Enter User ID (e.g. 3)"
                    required
                    value={suspendId}
                    onChange={(e) => setSuspendId(e.target.value)}
                  />
                  <button type="submit" className="btn btn-danger">
                    Suspend Account
                  </button>
                </div>
              </div>
              {suspendMsg && (
                <div className={suspendMsg.startsWith('Error') ? 'note bad' : 'note good'}>
                  {suspendMsg}
                </div>
              )}
            </form>
          </section>
        </>
      )}
    </section>
  );
};

export default AdminPage;
