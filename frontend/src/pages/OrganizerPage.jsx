import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const OrganizerPage = () => {
  const { user, isOrganizer } = useAuth();

  // Create Event Form state
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStatus, setEventStatus] = useState(null);

  // Create Tier Form state
  const [tierEventId, setTierEventId] = useState('1');
  const [tierName, setTierName] = useState('');
  const [tierPrice, setTierPrice] = useState('2500');
  const [tierQty, setTierQty] = useState('50');
  const [tierType, setTierType] = useState('PAID');
  const [tierStatus, setTierStatus] = useState(null);

  // Check-in state
  const [checkinEventId, setCheckinEventId] = useState('1');
  const [checkinBarcode, setCheckinBarcode] = useState('');
  const [checkinStatus, setCheckinStatus] = useState(null);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      setEventStatus('Creating event...');
      const res = await api.post('/events', {
        title: eventTitle,
        description: eventDesc,
        status: 'LIVE',
      });
      setEventStatus(`Success: Event #${res.event.id} "${res.event.title}" created!`);
      setEventTitle('');
      setEventDesc('');
    } catch (err) {
      setEventStatus(`Error: ${err.message}`);
    }
  };

  const handleCreateTier = async (e) => {
    e.preventDefault();
    try {
      setTierStatus('Creating tier...');
      const res = await api.post(`/events/${tierEventId}/tiers`, {
        name: tierName,
        price: tierType === 'FREE' ? 0 : parseInt(tierPrice, 10),
        total_quantity: parseInt(tierQty, 10),
        type: tierType,
      });
      setTierStatus(`Success: Tier "${res.tier.name}" created!`);
      setTierName('');
    } catch (err) {
      setTierStatus(`Error: ${err.message}`);
    }
  };

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!checkinBarcode.trim()) return;
    try {
      setCheckinStatus('Checking in...');
      const res = await api.post(`/events/${checkinEventId}/attendees/check-in`, {
        barcode: checkinBarcode.trim(),
      });
      setCheckinStatus(`Verified! Attendee ${res.attendee.name} successfully checked in.`);
      setCheckinBarcode('');
    } catch (err) {
      setCheckinStatus(`Check-in Denied: ${err.message}`);
    }
  };

  if (!isOrganizer) {
    return (
      <section className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
        <h2>Organizer Portal</h2>
        <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>
          You must be logged in as an Organizer or Admin to manage events and check in attendees.
        </p>
      </section>
    );
  }

  return (
    <section>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Organizer Management Portal</h1>
        <p style={{ color: 'var(--text-muted)' }}>Create events, configure ticket tiers, and scan tickets at the door</p>
      </header>

      <div className="flex flex-responsive gap-xl" style={{ alignItems: 'flex-start' }}>
        {/* Left Column: Event & Tier Creation */}
        <div className="flex flex-col gap-lg flex-1">
          {/* Create Event Card */}
          <section className="card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Create New Event</h2>
            <form onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Event Title *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. AI & Cloud Summit 2026"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Event Description</label>
                <textarea
                  className="textarea"
                  rows="3"
                  placeholder="Detailed schedule, speakers, and venue info..."
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary">
                Publish Event
              </button>
            </form>
            {eventStatus && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: eventStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {eventStatus}
              </div>
            )}
          </section>

          {/* Add Ticket Tier Card */}
          <section className="card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Add Ticket Tier to Event</h2>
            <form onSubmit={handleCreateTier}>
              <div className="form-group">
                <label>Event ID</label>
                <input
                  type="number"
                  className="input"
                  value={tierEventId}
                  onChange={(e) => setTierEventId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Tier Name *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. Early Bird VIP"
                  value={tierName}
                  onChange={(e) => setTierName(e.target.value)}
                />
              </div>

              <div className="flex gap-md">
                <div className="form-group flex-1">
                  <label>Type</label>
                  <select
                    className="select"
                    value={tierType}
                    onChange={(e) => setTierType(e.target.value)}
                  >
                    <option value="PAID">PAID</option>
                    <option value="FREE">FREE</option>
                    <option value="DONATION">DONATION</option>
                  </select>
                </div>

                {tierType !== 'FREE' && (
                  <div className="form-group flex-1">
                    <label>Price (Cents)</label>
                    <input
                      type="number"
                      className="input"
                      value={tierPrice}
                      onChange={(e) => setTierPrice(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group flex-1">
                  <label>Quantity</label>
                  <input
                    type="number"
                    className="input"
                    value={tierQty}
                    onChange={(e) => setTierQty(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-secondary">
                Add Tier
              </button>
            </form>
            {tierStatus && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: tierStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {tierStatus}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Door QR / Barcode Check-In Scanner */}
        <aside className="card" style={{ width: '100%', maxWidth: '400px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Door Check-in Scanner</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Scan barcodes or enter attendee codes to check in guests at event entrance
          </p>

          <form onSubmit={handleCheckIn}>
            <div className="form-group">
              <label>Event ID</label>
              <input
                type="number"
                className="input"
                value={checkinEventId}
                onChange={(e) => setCheckinEventId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Ticket Barcode *</label>
              <input
                type="text"
                className="input"
                placeholder="Scan or type barcode (e.g. TKT-...)"
                required
                value={checkinBarcode}
                onChange={(e) => setCheckinBarcode(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Validate & Check In
            </button>
          </form>

          {checkinStatus && (
            <div
              className={`alert ${checkinStatus.startsWith('Check-in Denied') ? 'alert-error' : 'alert-success'}`}
              style={{ marginTop: '1rem', marginBottom: '0' }}
            >
              {checkinStatus}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default OrganizerPage;
