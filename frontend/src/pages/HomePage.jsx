import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export const HomePage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadEvents = async () => {
      try {
        const res = await api.get('/events');
        if (isMounted) {
          setEvents(res.events || []);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadEvents();
    return () => { isMounted = false; };
  }, []);

  const filteredEvents = events.filter(ev =>
    ev.title.toLowerCase().includes(search.toLowerCase()) ||
    (ev.description && ev.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <section>
      <header className="card" style={{ marginBottom: '2rem', textAlign: 'center', padding: '2.5rem 1rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--primary)' }}>
          Discover & Book Extraordinary Events
        </h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 1.5rem auto' }}>
          Browse premier tech summits, developer conferences, workshops, and community meetups.
        </p>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <input
            type="search"
            className="input"
            placeholder="Search events by title or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {loading && (
        <div className="flex justify-center" style={{ padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading events...</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          Error loading events: {error}
        </div>
      )}

      {!loading && filteredEvents.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h3>No events found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Check back soon for new scheduled conferences and meetups.</p>
        </div>
      )}

      <div className="grid-cards">
        {filteredEvents.map(event => {
          const startingPrice = event.ticket_tiers && event.ticket_tiers.length > 0
            ? Math.min(...event.ticket_tiers.map(t => t.price))
            : null;

          return (
            <article key={event.id} className="card card-hover flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                  <span className="badge badge-success">{event.status}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {event.title}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem', lineClamp: 3 }}>
                  {event.description?.replace(/<[^>]*>/g, '').slice(0, 140)}...
                </p>
              </div>

              <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Starting from</span>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                    {startingPrice === 0 ? 'FREE' : startingPrice !== null ? `$${(startingPrice / 100).toFixed(2)}` : 'N/A'}
                  </strong>
                </div>
                <Link to={`/events/${event.id}`} className="btn btn-primary btn-sm">
                  View Tickets &rarr;
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default HomePage;
