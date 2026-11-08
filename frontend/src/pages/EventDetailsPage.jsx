import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';

export const EventDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cartItems, updateQuantity, applyPromoCode, reserveTickets, promoCode, discountAmount, total } = useCart();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoStatus, setPromoStatus] = useState(null);
  const [reserving, setReserving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchEvent = async () => {
      try {
        const res = await api.get(`/events/${id}`);
        if (isMounted) setEvent(res.event);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchEvent();
    return () => { isMounted = false; };
  }, [id]);

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    try {
      setPromoStatus('Validating...');
      const res = await applyPromoCode(id, promoInput.trim());
      setPromoStatus(`Promo applied! Saved $${(res.discount / 100).toFixed(2)}`);
    } catch (err) {
      setPromoStatus(`Error: ${err.message}`);
    }
  };

  const handleReserve = async () => {
    try {
      setReserving(true);
      setError(null);
      await reserveTickets(id);
      navigate('/checkout');
    } catch (err) {
      setError(err.message || 'Failed to reserve tickets. Please check availability.');
    } finally {
      setReserving(false);
    }
  };

  if (loading) {
    return <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>Loading event details...</div>;
  }

  if (error && !event) {
    return <div className="alert alert-error">Event not found or failed to load: {error}</div>;
  }

  const sanitizedDescription = DOMPurify.sanitize(event.description || '', {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'class'],
  });

  const totalTicketsSelected = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article>
      {/* Event Header Banner */}
      <header className="card" style={{ marginBottom: '2rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
          <span className="badge badge-success">{event.status}</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {new Date(event.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} &ndash;{' '}
            {new Date(event.ends_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '1rem', color: '#111827' }}>
          {event.title}
        </h1>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="flex flex-responsive gap-xl" style={{ alignItems: 'flex-start' }}>
        {/* Left Column: Event Description (Sanitized) */}
        <section className="card flex-1">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>About this Event</h2>
          <div
            style={{ color: 'var(--text-main)', lineHeight: '1.7' }}
            dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
          />
        </section>

        {/* Right Column: Ticket Selector & Checkout Box */}
        <aside className="card" style={{ width: '100%', maxWidth: '420px', position: 'sticky', top: '5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>Select Tickets</h2>

          <div className="flex flex-col gap-md" style={{ marginBottom: '1.5rem' }}>
            {(!event.ticket_tiers || event.ticket_tiers.length === 0) && (
              <p style={{ color: 'var(--text-muted)' }}>No tickets currently available for this event.</p>
            )}

            {event.ticket_tiers?.map(tier => {
              const selectedItem = cartItems.find(it => it.tier.id === tier.id);
              const currentQty = selectedItem ? selectedItem.quantity : 0;
              const isSoldOut = tier.remaining_quantity <= 0;

              return (
                <div
                  key={tier.id}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)',
                    padding: '1rem',
                    backgroundColor: isSoldOut ? '#f9fafb' : '#ffffff',
                  }}
                >
                  <div className="flex justify-between items-start" style={{ marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{tier.name || tier.title}</strong>
                      <span style={{ fontSize: '0.8rem', color: isSoldOut ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {isSoldOut ? 'Sold Out' : `${tier.remaining_quantity} remaining`}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                        {tier.price === 0 ? 'FREE' : `$${(tier.price / 100).toFixed(2)}`}
                      </strong>
                    </div>
                  </div>

                  {!isSoldOut && (
                    <div className="flex items-center justify-between" style={{ marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Quantity:</label>
                      <select
                        className="select"
                        style={{ width: 'auto', padding: '0.35rem 0.75rem' }}
                        value={currentQty}
                        onChange={(e) => updateQuantity(tier, e.target.value)}
                      >
                        <option value="0">0</option>
                        {Array.from({ length: Math.min(tier.max_per_order, tier.remaining_quantity) }, (_, i) => i + 1).map(num => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Promo Code Form */}
          <form onSubmit={handleApplyPromo} style={{ marginBottom: '1.5rem' }}>
            <div className="flex gap-sm">
              <input
                type="text"
                className="input"
                placeholder="Promo Code (e.g. SAVE20)"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }}>
                Apply
              </button>
            </div>
            {promoStatus && (
              <span style={{ fontSize: '0.8rem', display: 'block', marginTop: '0.35rem', color: promoStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {promoStatus}
              </span>
            )}
          </form>

          {/* Order Summary Calculations */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
            {discountAmount > 0 && (
              <div className="flex justify-between" style={{ color: 'var(--success)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <span>Discount ({promoCode})</span>
                <span>-${(discountAmount / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span style={{ fontSize: '1rem', fontWeight: 600 }}>Total</span>
              <strong style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                ${(total / 100).toFixed(2)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.875rem' }}
            disabled={totalTicketsSelected === 0 || reserving}
            onClick={handleReserve}
          >
            {reserving ? 'Reserving...' : `Reserve ${totalTicketsSelected} Ticket(s)`}
          </button>
        </aside>
      </div>
    </article>
  );
};

export default EventDetailsPage;
