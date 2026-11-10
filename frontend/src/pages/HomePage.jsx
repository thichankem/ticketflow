import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { eventStart, formatDate, money, plainText, startingPrice, toneClass } from '../utils/display';

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
      <header className="hero">
        <p className="eyebrow">Ticketflow</p>
        <h1>Find the night. Hold the seat.</h1>
        <p>
          Conferences, concerts, and meetups with a 15-minute hold. Search by title or the words in the listing.
        </p>
        <div className="hero-search">
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
        <div className="card loading-state">
          <p className="muted">Loading events...</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          Error loading events: {error}
        </div>
      )}

      {!loading && filteredEvents.length === 0 && (
        <div className="card empty-state">
          <h3>No events found</h3>
          <p className="muted">Check back soon for new scheduled conferences and meetups.</p>
        </div>
      )}

      {!loading && filteredEvents.length > 0 && (
        <div className="section-label">
          <h2>On sale</h2>
          <span>{filteredEvents.length} listings</span>
        </div>
      )}

      <div className="grid-cards">
        {filteredEvents.map(event => {
          const from = startingPrice(event.ticket_tiers);
          return (
            <article key={event.id} className="event-card">
              <div className={`event-cover ${toneClass(event.category)}`}>
                {event.cover && <img src={event.cover} alt="" />}
                <div className="cover-meta">
                  <span className="status-pill">{event.category || event.status}</span>
                  <span className="price-chip">{from === null ? 'N/A' : from === 0 ? 'FREE' : `From ${money(from)}`}</span>
                </div>
              </div>
              <div className="event-card-body">
                <div className="meta-row">
                  <span>{formatDate(eventStart(event))}</span>
                  <span>{event.location || event.status}</span>
                </div>
                <h3>{event.title}</h3>
                <p>{plainText(event.description).slice(0, 140)}</p>
                <div className="card-actions">
                  <Link to={`/events/${event.id}`} className="btn btn-primary btn-sm">
                    View Tickets
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default HomePage;
