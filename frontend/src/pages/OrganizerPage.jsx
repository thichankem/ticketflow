import React, { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const OrganizerPage = () => {
  const { isOrganizer } = useAuth();

  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStatus, setEventStatus] = useState(null);

  const [tierEventId, setTierEventId] = useState('1');
  const [tierName, setTierName] = useState('');
  const [tierPrice, setTierPrice] = useState('2500');
  const [tierQty, setTierQty] = useState('50');
  const [tierType, setTierType] = useState('PAID');
  const [tierStatus, setTierStatus] = useState(null);

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
      <section className="card empty-state" style={{ maxWidth: '560px', margin: '2rem auto' }}>
        <h2>Organizer Portal</h2>
        <p className="muted">
          You must be logged in as an Organizer or Admin to manage events and check in attendees.
        </p>
      </section>
    );
  }

  return (
    <section>
      <header className="page-head">
        <h1>Organizer desk</h1>
        <p>Create events, configure ticket tiers, and scan tickets at the door.</p>
        <p className="hint">Demo catalogue uses event IDs 1–8. Event 1 is Global Tech Summit. Promo on that event: SAVE20.</p>
      </header>

      <div className="split">
        <div className="stack flex-1">
          <section className="card">
            <h2 className="panel-title">Create New Event</h2>
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
              <div className={`inline-status ${eventStatus.startsWith('Error') ? 'note bad' : 'note good'}`}>
                {eventStatus}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="panel-title">Add Ticket Tier to Event</h2>
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

              <div className="flex gap-md flex-responsive">
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
              <div className={`inline-status ${tierStatus.startsWith('Error') ? 'note bad' : 'note good'}`}>
                {tierStatus}
              </div>
            )}
          </section>
        </div>

        <aside className="card ticket-stub">
          <h2 className="panel-title">Door Check-in Scanner</h2>
          <p className="hint">Scan barcodes or enter attendee codes to check in guests at event entrance</p>

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

            <button type="submit" className="btn btn-primary btn-block">
              Validate & Check In
            </button>
          </form>

          {checkinStatus && (
            <div
              className={`alert ${checkinStatus.startsWith('Check-in Denied') ? 'alert-error' : 'alert-success'}`}
              style={{ marginTop: '1rem', marginBottom: 0 }}
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
