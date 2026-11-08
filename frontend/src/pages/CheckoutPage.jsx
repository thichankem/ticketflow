import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

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

  // Format countdown mm:ss
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

      // Construct attendees
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

  // SUCCESS CONFIRMATION VIEW
  if (completedResult) {
    const { order, attendees } = completedResult;
    return (
      <section className="card" style={{ maxWidth: '680px', margin: '2rem auto', textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
        <span className="badge badge-success" style={{ marginBottom: '1rem' }}>Order Confirmed</span>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          You're going to the event!
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Order reference: <strong>{order.orderShortId || `ORD-${order.id}`}</strong>
        </p>

        <div style={{ textAlign: 'left', margin: '2rem 0', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Your Tickets & Barcodes</h2>
          <div className="flex flex-col gap-md">
            {attendees?.map((att, idx) => (
              <div key={att.id || idx} className="card" style={{ backgroundColor: '#f9fafb' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                  <strong>Attendee: {att.name}</strong>
                  <span className="badge badge-primary">{att.status}</span>
                </div>
                <div className="barcode-box">
                  {att.barcode}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem', textAlign: 'center' }}>
                  Present this barcode at the door for entry
                </span>
              </div>
            ))}
          </div>
        </div>

        <Link to="/" className="btn btn-primary" style={{ width: '100%' }}>
          Return to Events Catalogue
        </Link>
      </section>
    );
  }

  // NO ACTIVE ORDER
  if (!activeOrder && cartItems.length === 0) {
    return (
      <section className="card" style={{ maxWidth: '500px', margin: '3rem auto', textAlign: 'center', padding: '2.5rem' }}>
        <h2>Your Cart is Empty</h2>
        <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>Please select tickets from an event before checking out.</p>
        <Link to="/" className="btn btn-primary">Browse Events</Link>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* 15-Minute Reservation Hold Alert */}
      {remainingSeconds > 0 && (
        <div className="alert alert-info flex justify-between items-center">
          <div>
            <strong>Tickets Held Exclusively For You:</strong> Your seats are reserved for{' '}
            <strong style={{ fontSize: '1.1rem' }}>{formatTimer(remainingSeconds)}</strong>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
            Cancel Hold
          </button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="flex flex-responsive gap-xl" style={{ alignItems: 'flex-start' }}>
        {/* Checkout Form */}
        <form onSubmit={handleSubmitCheckout} className="card flex-1">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Checkout & Registration</h1>

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

          {/* Payment Method */}
          <div className="form-group" style={{ marginTop: '1.5rem' }}>
            <label>Payment Method</label>
            <div className="flex flex-col gap-sm" style={{ marginTop: '0.5rem' }}>
              <label className="flex items-center gap-sm" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="OFFLINE"
                  checked={paymentMethod === 'OFFLINE'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>Pay Offline / Pay at the Door</span>
              </label>

              <label className="flex items-center gap-sm" style={{ cursor: 'pointer' }}>
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
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.875rem', marginTop: '1.5rem' }}
            disabled={submitting}
          >
            {submitting ? 'Processing Order...' : total === 0 ? 'Complete Free Registration' : `Pay & Confirm $${(total / 100).toFixed(2)}`}
          </button>
        </form>

        {/* Order Summary Sidebar */}
        <aside className="card" style={{ width: '100%', maxWidth: '340px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>Order Summary</h2>

          <div className="flex flex-col gap-sm" style={{ marginBottom: '1rem' }}>
            {cartItems.map(it => (
              <div key={it.tier.id} className="flex justify-between items-center" style={{ fontSize: '0.9rem' }}>
                <span>{it.quantity}x {it.tier.name || it.tier.title}</span>
                <strong>{it.tier.price === 0 ? 'FREE' : `$${((it.tier.price * it.quantity) / 100).toFixed(2)}`}</strong>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <div className="flex justify-between" style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
              <span>${(subtotal / 100).toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between" style={{ color: 'var(--success)', fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                <span>Discount</span>
                <span>-${(discountAmount / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center" style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <strong>Total Due</strong>
              <strong style={{ fontSize: '1.35rem', color: 'var(--primary)' }}>
                ${(total / 100).toFixed(2)}
              </strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CheckoutPage;
