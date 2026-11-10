import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { money } from '../utils/display';

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    cartItems,
    activeOrder,
    remainingSeconds,
    total,
    discountAmount,
    subtotal,
    finalizeCheckout,
    cancelActiveOrder,
  } = useCart();

  const [buyerName, setBuyerName] = useState(user?.name || '');
  const [buyerEmail, setBuyerEmail] = useState(user?.email || '');
  const [paymentMethod, setPaymentMethod] = useState('OFFLINE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completedResult, setCompletedResult] = useState(null);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSubmitCheckout = async (e) => {
    e.preventDefault();
    if (!buyerName || !buyerEmail) {
      setError('Please provide your name and email address.');
      return;
    }

    if (!activeOrder?.id) {
      setError('No active ticket reservation found. Please select tickets first.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const attendees = [];
      for (const item of cartItems) {
        for (let i = 0; i < item.quantity; i++) {
          attendees.push({
            name: buyerName,
            email: buyerEmail,
            ticket_tier_id: item.tier.id,
          });
        }
      }

      const res = await finalizeCheckout(
        activeOrder.id,
        { name: buyerName, email: buyerEmail },
        attendees,
        paymentMethod
      );

      setCompletedResult(res);
    } catch (err) {
      setError(err.message || 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to release these tickets and cancel?')) {
      await cancelActiveOrder();
      navigate('/');
    }
  };

  if (completedResult) {
    const { order, attendees } = completedResult;
    return (
      <section className="ticket-pass">
        <div className="pass-hero">
          <span className="badge badge-success">Order Confirmed</span>
          <h1>You're going.</h1>
          <p className="muted">
            Order reference: <strong>{order.orderShortId || `ORD-${order.id}`}</strong>
          </p>
        </div>
        <div className="stub-rule" />
        <h2 className="panel-title">Your Tickets & Barcodes</h2>
        <div className="stack">
          {attendees?.map((att, idx) => (
            <div key={att.id || idx} className="tier">
              <div className="tier-top">
                <strong>Attendee: {att.name}</strong>
                <span className="badge badge-primary">{att.status}</span>
              </div>
              <div className="barcode-box">{att.barcode}</div>
              <span className="note muted">Present this barcode at the door for entry</span>
            </div>
          ))}
        </div>
        <Link to="/" className="btn btn-primary btn-block" style={{ marginTop: '1rem' }}>
          Return to Events Catalogue
        </Link>
      </section>
    );
  }

  if (!activeOrder && cartItems.length === 0) {
    return (
      <section className="card empty-state" style={{ maxWidth: '520px', margin: '2rem auto' }}>
        <h2>Your Cart is Empty</h2>
        <p className="muted">Please select tickets from an event before checking out.</p>
        <Link to="/" className="btn btn-primary">Browse Events</Link>
      </section>
    );
  }

  return (
    <section>
      {remainingSeconds > 0 && (
        <div className="hold-banner">
          <div>
            <strong>Tickets held for you</strong>
            <div className="timer">{formatTimer(remainingSeconds)}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
            Cancel Hold
          </button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="split">
        <form onSubmit={handleSubmitCheckout} className="card flex-1">
          <h1 className="panel-title">Checkout & Registration</h1>

          <div className="form-group">
            <label htmlFor="buyerName">Full Name *</label>
            <input
              id="buyerName"
              type="text"
              className="input"
              required
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="buyerEmail">Email Address *</label>
            <input
              id="buyerEmail"
              type="email"
              className="input"
              required
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          <div className="form-group">
            <label>Payment Method</label>
            <label className="choice">
              <input
                type="radio"
                name="paymentMethod"
                value="OFFLINE"
                checked={paymentMethod === 'OFFLINE'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>Pay Offline / Pay at the Door</span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="paymentMethod"
                value="SIMULATED_CARD"
                checked={paymentMethod === 'SIMULATED_CARD'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>Credit / Debit Card (Instant Simulation)</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Processing Order...' : total === 0 ? 'Complete Free Registration' : `Pay & Confirm $${(total / 100).toFixed(2)}`}
          </button>
        </form>

        <aside className="ticket-stub">
          <h2 className="panel-title">Order Summary</h2>
          <div className="stack">
            {cartItems.map(it => (
              <div key={it.tier.id} className="stub-line">
                <span>{it.quantity}× {it.tier.name || it.tier.title}</span>
                <strong>{money(it.tier.price * it.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="stub-rule" />
          <div className="stub-line">
            <span className="muted">Subtotal</span>
            <span>${(subtotal / 100).toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="stub-line note good">
              <span>Discount</span>
              <span>−${(discountAmount / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="total-row">
            <strong style={{ fontSize: '1rem' }}>Total Due</strong>
            <strong>${(total / 100).toFixed(2)}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CheckoutPage;
