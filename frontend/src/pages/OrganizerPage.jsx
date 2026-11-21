import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { EventAnalyticsDashboard } from '../components/EventAnalyticsDashboard';
import { EventForm } from '../components/events/EventForm';
import { OrganizerEventsTab } from '../components/organizer/OrganizerEventsTab';
import { OrganizerTiersTab } from '../components/organizer/OrganizerTiersTab';
import { OrganizerPromosTab } from '../components/organizer/OrganizerPromosTab';
import { OrganizerAttendeesTab } from '../components/organizer/OrganizerAttendeesTab';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatDate } from '../utils/display';
import { Icon } from '../components/ui/Icon';

export const OrganizerPage = () => {
  const { isOrganizer } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeEventId } = useParams();

  // If routeEventId exists, we are in the Event Details view
  const isDetailView = Boolean(routeEventId);

  // SubTab for Event Details view: 'overview' | 'tiers' | 'promos' | 'attendees'
  const [eventSubTab, setEventSubTab] = useState('overview');

  // Edit event mode
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
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Events list & Selection
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [errorEvents, setErrorEvents] = useState(null);
  const [singleEvent, setSingleEvent] = useState(null);
  const [loadingSingleEvent, setLoadingSingleEvent] = useState(false);

  // Dashboard metrics data for selected event
  const [eventTiers, setEventTiers] = useState([]);
  const [eventOrders, setEventOrders] = useState([]);
  const [eventAttendees, setEventAttendees] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Load organizer events (fail closed without falling back to public events)
  const loadOrganizerEvents = async () => {
    setLoadingEvents(true);
    setErrorEvents(null);
    try {
      const dashRes = await api.events.getOrganizerDashboard();
      const data = Array.isArray(dashRes) ? dashRes : dashRes?.events || [];
      setEvents(data);
    } catch (err) {
      console.warn('Could not load organizer events:', err.message);
      setErrorEvents(err.message || 'Không thể tải danh sách sự kiện do bạn tổ chức.');
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (isOrganizer) {
      loadOrganizerEvents();
    }
  }, [isOrganizer]);

  // Active selected event object helper
  const selectedEvent = useMemo(() => {
    if (!routeEventId) return null;
    return events.find((e) => String(e.id) === String(routeEventId)) || singleEvent || null;
  }, [events, routeEventId, singleEvent]);

  // If routeEventId is present in URL but not yet in events list, fetch directly
  useEffect(() => {
    if (routeEventId && !events.some((e) => String(e.id) === String(routeEventId))) {
      let active = true;
      setLoadingSingleEvent(true);
      api.events.getById(routeEventId)
        .then((res) => {
          if (active) {
            setSingleEvent(res?.event || res || null);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch single event:', err.message);
        })
        .finally(() => {
          if (active) setLoadingSingleEvent(false);
        });
      return () => { active = false; };
    }
  }, [routeEventId, events]);

  // Load dashboard metrics for selected event
  const loadDashboardData = async (eventId) => {
    if (!eventId) return;
    setLoadingDashboard(true);
    try {
      const [tiersRes, ordersRes, attRes] = await Promise.allSettled([
        api.events.getTiers(eventId),
        api.events.getOrders(eventId),
        api.events.getAttendees(eventId),
      ]);
      if (tiersRes.status === 'fulfilled') {
        const val = tiersRes.value;
        setEventTiers(Array.isArray(val) ? val : val?.tiers || []);
      }
      if (ordersRes.status === 'fulfilled') {
        const val = ordersRes.value;
        setEventOrders(Array.isArray(val) ? val : val?.orders || []);
      }
      if (attRes.status === 'fulfilled') {
        const val = attRes.value;
        setEventAttendees(Array.isArray(val) ? val : val?.attendees || []);
      }
    } catch (e) {
      console.warn('Dashboard data fetch error:', e);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (isDetailView && routeEventId) {
      loadDashboardData(routeEventId);
    }
  }, [isDetailView, routeEventId]);

  const handleSelectEvent = (id) => {
    navigate(`/organizer/events/${id}`);
    setEventSubTab('overview');
  };

  const handleStartEditEvent = (ev) => {
    setEditingEvent(ev);
  };

  const handleSaveEvent = async (formData, id) => {
    try {
      if (id) {
        const res = await api.events.update(id, formData);
        notify(`Sự kiện "${formData.title}" đã được cập nhật thành công!`);
        setEvents((prev) =>
          prev.map((it) => (it.id === id ? { ...it, ...formData, ...(res?.event || {}) } : it))
        );
        if (singleEvent && String(singleEvent.id) === String(id)) {
          setSingleEvent((prev) => ({ ...prev, ...formData, ...(res?.event || {}) }));
        }
      } else {
        const res = await api.events.create(formData);
        const created = res?.event;
        if (!created || !created.id) {
          throw new Error('Hệ thống không nhận được thông tin sự kiện được tạo.');
        }
        notify(`Sự kiện "${created.title}" đã được xuất bản!`);
        setEvents((prev) => [created, ...prev]);
        navigate(`/organizer/events/${created.id}`);
      }
      setEditingEvent(null);
    } catch (err) {
      notify(`Lỗi lưu sự kiện: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleDeleteEvent = async (eventId, title) => {
    try {
      const res = await api.events.delete(eventId);
      notify(
        res?.message || `Đã hủy sự kiện "${title}". Các yêu cầu hoàn tiền đang được xếp hàng xử lý tự động.`,
        'success'
      );
      setEvents((prev) => prev.filter((e) => Number(e.id) !== Number(eventId)));
      if (String(routeEventId) === String(eventId)) {
        navigate('/organizer');
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
          <button
            type="button"
            className="btn-close flex items-center justify-center"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            <Icon name="x" size="xs" ariaHidden />
          </button>
        </div>
      )}

      {/* Error state for organizer events loading */}
      {errorEvents && (
        <div className="alert alert-error mb-md flex justify-between items-center">
          <span>{errorEvents}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadOrganizerEvents}>
            Thử lại
          </button>
        </div>
      )}

      {/* VIEW 1: EDIT EVENT FORM */}
      {editingEvent ? (
        <div className="card p-lg">
          <div className="flex justify-between items-center mb-md pb-xs border-b">
            <h2 className="panel-title m-0">
              {editingEvent.id ? `Chỉnh sửa: ${editingEvent.title}` : 'Tạo sự kiện mới'}
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={() => setEditingEvent(null)}
            >
              <Icon name="chevron-left" size="xs" ariaHidden />
              <span>Quay lại</span>
            </button>
          </div>
          <EventForm
            initialData={editingEvent}
            eventId={editingEvent?.id}
            onSave={handleSaveEvent}
            onCancel={() => setEditingEvent(null)}
          />
        </div>
      ) : isDetailView ? (
        /* VIEW 2: EVENT DETAILS VIEW (Chi tiết sự kiện & các tab quản lý sự kiện) */
        loadingSingleEvent && !selectedEvent ? (
          <div className="card loading-state p-xl text-center text-muted">
            Đang tải thông tin chi tiết sự kiện...
          </div>
        ) : !selectedEvent ? (
          <div className="card empty-state p-xl text-center">
            <h3>Không tìm thấy sự kiện</h3>
            <p className="muted mb-md">
              Sự kiện có thể đã bị xóa hoặc bạn không có quyền truy cập sự kiện này.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/organizer')}
            >
              ← Quay lại danh sách sự kiện
            </button>
          </div>
        ) : (
          <div className="stack">
            {/* Breadcrumb / Top Bar */}
            <div className="flex justify-between items-center mb-sm flex-wrap gap-sm">
              <button
                type="button"
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
                onClick={() => navigate('/organizer')}
              >
                <Icon name="chevron-left" size="xs" ariaHidden />
                <span>Quay lại danh sách sự kiện</span>
              </button>
              <div className="flex items-center gap-xs">
                <span className="badge badge-primary font-mono text-xs">Mã: #{selectedEvent.id}</span>
                <StatusBadge status={selectedEvent.status || 'DRAFT'} />
              </div>
            </div>

            {/* Event Header Banner Card */}
            <div className="card p-md mb-md">
              <div className="flex justify-between items-center flex-wrap gap-md">
                <div className="flex items-center gap-md">
                  {selectedEvent.cover || selectedEvent.banner ? (
                    <img
                      src={selectedEvent.cover || selectedEvent.banner}
                      alt={selectedEvent.title}
                      style={{
                        width: '72px',
                        height: '72px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                      }}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/images/events/summit.svg';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '8px',
                        background: 'var(--bg-muted, #f1f5f9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        color: 'var(--text-muted, #64748b)',
                      }}
                    >
                      {selectedEvent.category || 'Event'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-xs flex-wrap mb-1">
                      <span className="badge badge-primary text-xs">{selectedEvent.category || 'Sự kiện'}</span>
                      <StatusBadge status={selectedEvent.status || 'DRAFT'} />
                    </div>
                    <h1 className="text-xl font-bold m-0 text-foreground">{selectedEvent.title}</h1>
                    <p className="text-xs muted m-0 mt-1 flex items-center gap-md flex-wrap">
                      <span>📅 {formatDate(selectedEvent.start_date || selectedEvent.starts_at)}</span>
                      <span>📍 {selectedEvent.location || 'Online / TBA'}</span>
                      <span>🎟️ Đã bán {selectedEvent.tickets_sold || 0} vé</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-xs flex-wrap">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex items-center gap-1.5"
                    onClick={() => handleStartEditEvent(selectedEvent)}
                    title="Chỉnh sửa thông tin sự kiện"
                  >
                    <Icon name="edit" size="xs" ariaHidden />
                    <span>Chỉnh sửa sự kiện</span>
                  </button>
                  <a
                    href={`/events/${selectedEvent.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm flex items-center gap-1.5"
                    title="Mở trang bán vé công khai của sự kiện"
                  >
                    <Icon name="external-link" size="xs" ariaHidden />
                    <span>Xem trang công khai</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Event Specific Sub-Tabs (Chỉ xuất hiện khi vào Chi Tiết Sự Kiện) */}
            <div
              className="tabs-nav mb-lg border-b overflow-x-auto whitespace-nowrap"
              style={{ scrollbarWidth: 'thin' }}
            >
              <button
                type="button"
                className={`tab-btn ${eventSubTab === 'overview' ? 'active' : ''}`}
                onClick={() => setEventSubTab('overview')}
              >
                Tổng quan
              </button>
              <button
                type="button"
                className={`tab-btn ${eventSubTab === 'tiers' ? 'active' : ''}`}
                onClick={() => setEventSubTab('tiers')}
              >
                Hạng vé
              </button>
              <button
                type="button"
                className={`tab-btn ${eventSubTab === 'promos' ? 'active' : ''}`}
                onClick={() => setEventSubTab('promos')}
              >
                Mã giảm giá
              </button>
              <button
                type="button"
                className={`tab-btn ${eventSubTab === 'attendees' ? 'active' : ''}`}
                onClick={() => setEventSubTab('attendees')}
              >
                Người tham dự
              </button>
            </div>

            {/* Sub-Tab Contents */}
            {eventSubTab === 'overview' && (
              <EventAnalyticsDashboard
                eventId={selectedEvent.id}
                event={selectedEvent}
                tiers={eventTiers}
                orders={eventOrders}
                attendees={eventAttendees}
                loading={loadingDashboard}
                onRefresh={() => loadDashboardData(selectedEvent.id)}
                onEdit={() => handleStartEditEvent(selectedEvent)}
              />
            )}

            {eventSubTab === 'tiers' && (
              <OrganizerTiersTab
                selectedEventId={String(selectedEvent.id)}
                hideEventSelector={true}
                notify={notify}
              />
            )}

            {eventSubTab === 'promos' && (
              <OrganizerPromosTab
                selectedEventId={String(selectedEvent.id)}
                hideEventSelector={true}
                notify={notify}
              />
            )}

            {eventSubTab === 'attendees' && (
              <OrganizerAttendeesTab
                selectedEventId={String(selectedEvent.id)}
                hideEventSelector={true}
                notify={notify}
              />
            )}
          </div>
        )
      ) : (
        /* VIEW 3: MAIN ORGANIZER STUDIO (Danh sách sự kiện - KHÔNG CÒN CÁC THANH TAB Ở ĐÂY) */
        <div className="stack">
          {/* Organizer Studio Header */}
          <div className="flex justify-between items-center mb-md flex-wrap gap-sm">
            <div>
              <h1 className="text-2xl font-bold m-0 flex items-center gap-xs">
                <Icon name="studio" size="lg" ariaHidden className="text-primary mr-1" />
                <span>{t('organizer.title', 'Studio Ban Tổ Chức')}</span>
              </h1>
            </div>

            <button
              type="button"
              className="btn btn-primary flex items-center gap-1.5"
              onClick={() => navigate('/organizer/events/new')}
            >
              <Icon name="plus" size="sm" ariaHidden />
              <span>Tạo Sự Kiện Mới</span>
            </button>
          </div>

          {/* Events List */}
          <OrganizerEventsTab
            events={events}
            loading={loadingEvents}
            onSelectEvent={handleSelectEvent}
            onEditEvent={handleStartEditEvent}
            onDeleteEvent={handleDeleteEvent}
          />
        </div>
      )}
    </section>
  );
};

export default OrganizerPage;
