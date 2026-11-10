import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api';
import { useCart } from '../context/CartContext';
import { formatRange, money, toneClass } from '../utils/display';

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
      setPromoStatus(`Promo applied! Saved ${money(res.discount)}`);
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
    return <div className="card loading-state">Loading event details...</div>;
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
      <header className={`event-banner ${toneClass(event.category)}`}>
        {event.cover && <img src={event.cover} alt="" />}
        <div className="event-banner-copy">
          <span className="badge badge-success">{event.status}</span>
          <h1>{event.title}</h1>
          <div className="banner-facts">
            <span>{formatRange(event)}</span>
            {event.location && <span>{event.location}</span>}
          </div>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="split">
        <section className="card flex-1 prose">
          <h2>About this Event</h2>
          <div dangerouslySetInnerHTML={{ __html: sanitizedDescription }} />
        </section>

        <aside className="card ticket-panel">
          <h2 className="panel-title">Select Tickets</h2>

          <div className="stack">
            {(!event.ticket_tiers || event.ticket_tiers.length === 0) && (
              <p className="muted">No tickets currently available for this event.</p>
            )}

            {event.ticket_tiers?.map(tier => {
              const selectedItem = cartItems.find(it => it.tier.id === tier.id);
              const currentQty = selectedItem ? selectedItem.quantity : 0;
              const isSoldOut = tier.remaining_quantity <= 0;

              return (
                <div key={tier.id} className={`tier ${isSoldOut ? 'is-sold' : ''}`}>
                  <div className="tier-top">
                    <div>
                      <div className="tier-name">{tier.name || tier.title}</div>
                      <span className={isSoldOut ? 'sold' : 'muted'}>
                        {isSoldOut ? 'Sold Out' : `${tier.remaining_quantity} remaining`}
                      </span>
                    </div>
                    <div className="tier-price">{money(tier.price)}</div>
                  </div>

                  {!isSoldOut && (
                    <div className="qty-row">
                      <label>Quantity</label>
                      <select
                        className="select select-compact"
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

          <form onSubmit={handleApplyPromo} className="promo-row" style={{ marginTop: '1rem' }}>
            <input
              type="text"
              className="input"
              placeholder="Promo Code (e.g. SAVE20)"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Apply
            </button>
          </form>
          {promoStatus && (
            <span className={`note ${promoStatus.startsWith('Error') ? 'bad' : 'good'}`}>
              {promoStatus}
            </span>
          )}

          <div className="total-row">
            <div>
              {discountAmount > 0 && (
                <div className="note good">Discount ({promoCode}) −{money(discountAmount)}</div>
              )}
              <span>Total</span>
            </div>
            <strong>{money(total)}</strong>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
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
