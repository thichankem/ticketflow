import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { EventAnalyticsDashboard } from '../components/EventAnalyticsDashboard';
import { EventForm } from '../components/events/EventForm';
import { OrganizerEventsTab } from '../components/organizer/OrganizerEventsTab';
import { OrganizerTiersTab } from '../components/organizer/OrganizerTiersTab';
import { OrganizerPromosTab } from '../components/organizer/OrganizerPromosTab';
import { OrganizerAttendeesTab } from '../components/organizer/OrganizerAttendeesTab';
import { OrganizerCheckinTab } from '../components/organizer/OrganizerCheckinTab';

export const OrganizerPage = () => {
  const { isOrganizer } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Active Tab: 'events' | 'event-dashboard' | 'edit-event' | 'tiers' | 'promos' | 'attendees' | 'checkin'
  const [activeTab, setActiveTab] = useState('events');
  const [editingEvent, setEditingEvent] = useState(null);

  // Global notice toast
  const [notice, setNotice] = useState(null);
  const notify = (msg, type = 'success') => {
    setNotice({ message: msg, type });
    setTimeout(() => setNotice(null), 4500);
  };

  // Check flash messages from navigation
  useEffect(() => {
    if (location.state?.notice) {
      notify(location.state.notice);
      if (location.state.selectedEventId) {
        setSelectedEventId(String(location.state.selectedEventId));
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Events list & Selection
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Selected event object helper
  const selectedEvent = useMemo(() => {
    return events.find((e) => String(e.id) === String(selectedEventId)) || events[0] || null;
  }, [events, selectedEventId]);

  // Load organizer events
  const loadOrganizerEvents = async () => {
    setLoadingEvents(true);
    try {
      let data = [];
      try {
        const dashRes = await api.events.getOrganizerDashboard();
        data = Array.isArray(dashRes) ? dashRes : dashRes?.events || [];
      } catch {
        const listRes = await api.events.list();
        data = Array.isArray(listRes) ? listRes : listRes?.events || [];
      }
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(String(data[0].id));
      }
    } catch (err) {
      console.warn('Could not load organizer events:', err.message);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (isOrganizer) {
      loadOrganizerEvents();
    }
  }, [isOrganizer]);

  // Sync selectedEventId if events change
  useEffect(() => {
    if (events.length > 0 && !events.some((e) => String(e.id) === String(selectedEventId))) {
      setSelectedEventId(String(events[0].id));
    }
  }, [events, selectedEventId]);

  const handleSelectEvent = (id, targetTab = 'event-dashboard') => {
    setSelectedEventId(String(id));
    setActiveTab(targetTab);
  };

  const handleStartEditEvent = (ev) => {
    setEditingEvent(ev);
    setSelectedEventId(String(ev.id));
    setActiveTab('edit-event');
  };

  const handleSaveEvent = async (formData, id) => {
    try {
      if (id) {
        const res = await api.events.update(id, formData);
        notify(`Sự kiện "${formData.title}" đã được cập nhật thành công!`);
        setEvents((prev) =>
          prev.map((it) => (it.id === id ? { ...it, ...formData, ...(res?.event || {}) } : it))
        );
      } else {
        const res = await api.events.create(formData);
        const created = res?.event || { id: Date.now(), ...formData };
        notify(`Sự kiện "${created.title}" đã được xuất bản!`);
        setEvents((prev) => [created, ...prev]);
        setSelectedEventId(String(created.id));
      }
      setEditingEvent(null);
      setActiveTab('events');
    } catch (err) {
      notify(`Lỗi lưu sự kiện: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleDeleteEvent = async (eventId, title) => {
    try {
      const res = await api.events.delete(eventId);
      notify(
        res?.message || `Đã xóa sự kiện "${title}" và tự động hoàn tiền 100% cho người mua vé thành công.`,
        'success'
      );
      setEvents((prev) => prev.filter((e) => Number(e.id) !== Number(eventId)));
      if (Number(selectedEventId) === Number(eventId)) {
        setSelectedEventId(null);
        setActiveTab('events');
      }
    } catch (err) {
      notify(`Không thể xóa sự kiện: ${err.message}`, 'error');
    }
  };

  return (
    <section className="container py-md">
      {/* Global Notice Toast */}
      {notice && (
        <div className={`alert alert-${notice.type} mb-md flex justify-between items-center`}>
          <span>{notice.message}</span>
          <button type="button" className="btn-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {/* Organizer Studio Header */}
      <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
        <div>
          <h1 className="text-2xl font-bold m-0 flex items-center gap-xs">
            <span>🎟️</span> {t('organizer.title', 'Studio Ban Tổ Chức')}
          </h1>
          <p className="muted text-sm m-0">
            {t('organizer.subtitle', 'Quản lý sự kiện, vé, doanh thu và người tham dự.')}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/organizer/events/new')}
        >
          + Tạo Sự Kiện Mới
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-nav mb-lg border-b">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Sự kiện của tôi
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'event-dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('event-dashboard')}
          disabled={!selectedEvent}
        >
          Tổng quan {selectedEvent ? `(#${selectedEvent.id})` : ''}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'tiers' ? 'active' : ''}`}
          onClick={() => setActiveTab('tiers')}
          disabled={!selectedEvent}
        >
          Hạng vé
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'promos' ? 'active' : ''}`}
          onClick={() => setActiveTab('promos')}
          disabled={!selectedEvent}
        >
          Mã giảm giá
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'attendees' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendees')}
          disabled={!selectedEvent}
        >
          Người tham dự
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'checkin' ? 'active' : ''}`}
          onClick={() => setActiveTab('checkin')}
          disabled={!selectedEvent}
        >
          Soát vé (Check-in)
        </button>
        {activeTab === 'edit-event' && (
          <button type="button" className="tab-btn active">
            Chỉnh sửa sự kiện
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'events' && (
        <OrganizerEventsTab
          events={events}
          loading={loadingEvents}
          onSelectEvent={handleSelectEvent}
          onEditEvent={handleStartEditEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      {activeTab === 'event-dashboard' && selectedEvent && (
        <EventAnalyticsDashboard
          eventId={selectedEvent.id}
          event={selectedEvent}
          onEdit={() => handleStartEditEvent(selectedEvent)}
        />
      )}

      {activeTab === 'edit-event' && (
        <div className="card p-lg">
          <div className="flex justify-between items-center mb-md pb-xs border-b">
            <h2 className="panel-title m-0">
              {editingEvent ? `Chỉnh sửa: ${editingEvent.title}` : 'Tạo sự kiện mới'}
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEditingEvent(null);
                setActiveTab('events');
              }}
            >
              ← Quay lại danh sách
            </button>
          </div>
          <EventForm
            initialData={editingEvent}
            eventId={editingEvent?.id}
            onSave={handleSaveEvent}
            onCancel={() => {
              setEditingEvent(null);
              setActiveTab('events');
            }}
          />
        </div>
      )}

      {activeTab === 'tiers' && (
        <OrganizerTiersTab
          selectedEventId={selectedEventId}
          events={events}
          onSelectEvent={setSelectedEventId}
          notify={notify}
        />
      )}

      {activeTab === 'promos' && (
        <OrganizerPromosTab
          selectedEventId={selectedEventId}
          events={events}
          onSelectEvent={setSelectedEventId}
          notify={notify}
        />
      )}

      {activeTab === 'attendees' && (
        <OrganizerAttendeesTab
          selectedEventId={selectedEventId}
          events={events}
          onSelectEvent={setSelectedEventId}
          notify={notify}
        />
      )}

      {activeTab === 'checkin' && (
        <OrganizerCheckinTab
          selectedEvent={selectedEvent}
          notify={notify}
        />
      )}
    </section>
  );
};

export default OrganizerPage;
