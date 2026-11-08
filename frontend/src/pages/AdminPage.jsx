import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AdminPage = () => {
  const { user, isAdmin } = useAuth();
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
      <header className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>SuperAdmin Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }}>Platform overview, operations and account moderation</p>
        </div>
        <span className="badge badge-primary">Admin Portal</span>
      </header>

      {error && (
        <div className="alert alert-error">
          {error.includes('Forbidden') || error.includes('Unauthorized')
            ? 'Access Denied: You must be signed in as an Admin to access this view.'
            : error}
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>Loading platform statistics...</div>}

      {stats && (
        <>
          {/* KPI Cards */}
          <div className="flex flex-wrap gap-md" style={{ marginBottom: '2rem' }}>
            <div className="card flex-1" style={{ minWidth: '200px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Gross Sales</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>
                ${(stats.gross_sales / 100).toFixed(2)}
              </h2>
            </div>

            <div className="card flex-1" style={{ minWidth: '200px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Orders</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {stats.total_orders}
              </h2>
            </div>

            <div className="card flex-1" style={{ minWidth: '200px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Live Events</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {stats.total_events}
              </h2>
            </div>

            <div className="card flex-1" style={{ minWidth: '200px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Registered Users</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {stats.total_users}
              </h2>
            </div>
          </div>

          {/* User Moderation Tool */}
          <section className="card" style={{ maxWidth: '550px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>User Moderation & Suspension</h2>
            <form onSubmit={handleSuspend}>
              <div className="form-group">
                <label htmlFor="userIdInput">Target User ID</label>
                <div className="flex gap-sm">
                  <input
                    id="userIdInput"
                    type="number"
                    className="input"
                    placeholder="Enter User ID (e.g. 3)"
                    required
                    value={suspendId}
                    onChange={(e) => setSuspendId(e.target.value)}
                  />
                  <button type="submit" className="btn btn-danger" style={{ whiteSpace: 'nowrap' }}>
                    Suspend Account
                  </button>
                </div>
              </div>
              {suspendMsg && (
                <div style={{ fontSize: '0.9rem', color: suspendMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
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
