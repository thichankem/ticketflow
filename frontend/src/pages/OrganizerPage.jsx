import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { money, formatDate, formatDateTime } from '../utils/display';
import { ImageUploader } from '../components/ImageUploader';
import { Modal } from '../components/Modal';
import { EventAnalyticsDashboard } from '../components/EventAnalyticsDashboard';

export const OrganizerPage = () => {
  const { user, isOrganizer, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Active Tab: 'events' | 'edit-event' | 'tiers' | 'promos' | 'attendees' | 'event-dashboard'
  const [activeTab, setActiveTab] = useState('events');

  // Popup Modal states for clean, focused create/add workflows
  const [showTierModal, setShowTierModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);

  // Global feedback / notification
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
        // Fallback to public list
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

  // Tab 1: Search and Pagination
  const [eventSearch, setEventSearch] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const eventsPerPage = 12;

  const filteredEvents = events.filter((ev) =>
    (ev.title || '').toLowerCase().includes(eventSearch.toLowerCase()) ||
    (ev.category || '').toLowerCase().includes(eventSearch.toLowerCase()) ||
    (ev.location || '').toLowerCase().includes(eventSearch.toLowerCase())
  );
  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / eventsPerPage));
  const paginatedEvents = filteredEvents.slice((eventPage - 1) * eventsPerPage, eventPage * eventsPerPage);

  // --------------------------------------------------------------------------
  // TAB 2: Create & Edit Event State & Handlers
  // --------------------------------------------------------------------------
  const [eventFormId, setEventFormId] = useState(null); // null = new, number = editing
  const [eventFormData, setEventFormData] = useState({
    title: '',
    category: 'Tech',
    location: '',
    start_date: '',
    end_date: '',
    status: 'LIVE',
    description: '',
    banner: '',
    cover: '',
    allow_refunds: true,
    refund_max_days: 3,
    refund_min_days_before_event: 3,
    blocks: [],
  });
  const [savingEvent, setSavingEvent] = useState(false);

  const addBlock = (type) => {
    setEventFormData((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks,
        {
          id: Date.now(),
          type,
          title: type === 'text' ? 'Đoạn văn bản' : type === 'media' ? 'Hình ảnh bài viết' : 'Lịch trình sự kiện',
          content: '',
          url: '',
          caption: '',
          time: '14:00 - 15:30',
          desc: '',
        },
      ],
    }));
  };

  const removeBlock = (blockId) => {
    setEventFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  };

  const updateBlock = (blockId, field, value) => {
    setEventFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, [field]: value } : b)),
    }));
  };

  const startEditEvent = (ev) => {
    setEventFormId(ev.id);
    setEventFormData({
      title: ev.title || '',
      category: ev.category || 'Tech',
      location: ev.location || '',
      start_date: ev.start_date || ev.starts_at ? new Date(ev.start_date || ev.starts_at).toISOString().slice(0, 16) : '',
      end_date: ev.end_date || ev.ends_at ? new Date(ev.end_date || ev.ends_at).toISOString().slice(0, 16) : '',
      status: ev.status || 'LIVE',
      description: ev.description || '',
      banner: ev.banner || ev.banner_url || ev.cover || '',
      cover: ev.cover || ev.image_url || '',
      allow_refunds: ev.allow_refunds !== undefined ? ev.allow_refunds : true,
      refund_max_days: ev.refund_max_days || 3,
      refund_min_days_before_event: ev.refund_min_days_before_event || 3,
      blocks: ev.blocks || [
        { id: 1, type: 'text', title: 'Giới thiệu & Mục tiêu', content: ev.description || '' },
      ],
    });
    setActiveTab('edit-event');
  };

  const resetEventForm = () => {
    setEventFormId(null);
    setEventFormData({
      title: '',
      category: 'Tech',
      location: '',
      start_date: '',
      end_date: '',
      status: 'LIVE',
      description: '',
      banner: '',
      cover: '',
      allow_refunds: true,
      refund_max_days: 3,
      refund_min_days_before_event: 3,
      blocks: [],
    });
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    setSavingEvent(true);
    try {
      if (eventFormId) {
        // Update existing event
        const res = await api.events.update(eventFormId, eventFormData);
        notify(`Event "${eventFormData.title}" updated successfully!`);
        setEvents((prev) =>
          prev.map((it) => (it.id === eventFormId ? { ...it, ...eventFormData, ...(res?.event || {}) } : it))
        );
      } else {
        // Create new event
        const res = await api.events.create(eventFormData);
        const created = res?.event || { id: Date.now(), ...eventFormData };
        notify(`Event "${created.title}" published!`);
        setEvents((prev) => [created, ...prev]);
        setSelectedEventId(String(created.id));
      }
      resetEventForm();
      setActiveTab('events');
    } catch (err) {
      notify(`Error saving event: ${err.message}`, 'error');
    } finally {
      setSavingEvent(false);
    }
  };

  const [deletingEvent, setDeletingEvent] = useState(false);

  const handleDeleteEvent = async (eventId, title) => {
    const isConfirmed = window.confirm(
      `⚠️ CẢNH BÁO XÓA SỰ KIỆN: "${title}"\n\n` +
      `Bạn có chắc chắn muốn xóa sự kiện này không?\n\n` +
      `⚡ QUAN TRỌNG: Toàn bộ vé đã bán sẽ tự động được HOÀN TIỀN 100% cho tất cả người mua và toàn bộ vé phát hành sẽ bị hủy hiệu lực.\n\n` +
      `Thao tác này là vĩnh viễn và không thể hoàn tác!`
    );
    if (!isConfirmed) return;

    try {
      setDeletingEvent(true);
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
    } finally {
      setDeletingEvent(false);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 3: Ticket Tiers State & Handlers
  // --------------------------------------------------------------------------
  const [tiers, setTiers] = useState([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [tierEditId, setTierEditId] = useState(null);
  const [tierFormData, setTierFormData] = useState({
    name: '',
    price: '2500',
    total_quantity: '100',
    type: 'PAID',
    is_hidden: false,
  });

  const loadTiers = async (eventId) => {
    if (!eventId) return;
    setLoadingTiers(true);
    try {
      const res = await api.events.getTiers(eventId);
      const list = Array.isArray(res) ? res : res?.tiers || [];
      setTiers(list);
    } catch (err) {
      console.warn('Could not load tiers:', err.message);
      setTiers([]);
    } finally {
      setLoadingTiers(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadTiers(selectedEventId);
    }
  }, [selectedEventId]);

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const payload = {
        name: tierFormData.name,
        title: tierFormData.name,
        price: tierFormData.type === 'FREE' ? 0 : parseInt(tierFormData.price, 10),
        total_quantity: parseInt(tierFormData.total_quantity, 10),
        quantity: parseInt(tierFormData.total_quantity, 10),
        type: tierFormData.type,
        is_hidden: Boolean(tierFormData.is_hidden),
      };

      if (tierEditId) {
        // Update tier
        const res = await api.events.updateTier(selectedEventId, tierEditId, payload);
        notify(`Tier "${tierFormData.name}" updated!`);
        setTiers((prev) =>
          prev.map((t) => (t.id === tierEditId ? { ...t, ...payload, ...(res?.tier || {}) } : t))
        );
      } else {
        // Create tier
        const res = await api.events.createTier(selectedEventId, payload);
        const created = res?.tier || { id: Date.now(), ...payload };
        notify(`Tier "${created.name || created.title}" added!`);
        setTiers((prev) => [...prev, created]);
      }

      setTierEditId(null);
      setTierFormData({
        name: '',
        price: '2500',
        total_quantity: '100',
        type: 'PAID',
        is_hidden: false,
      });
      setShowTierModal(false);
    } catch (err) {
      notify(`Error saving tier: ${err.message}`, 'error');
    }
  };

  const handleEditTier = (tier) => {
    setTierEditId(tier.id);
    setTierFormData({
      name: tier.name || tier.title || '',
      price: String(tier.price || 0),
      total_quantity: String(tier.total_quantity || tier.initial_quantity || 100),
      type: tier.type || (tier.price === 0 ? 'FREE' : 'PAID'),
      is_hidden: Boolean(tier.is_hidden),
    });
    setShowTierModal(true);
  };

  const handleDeleteTier = async (tierId, tierName) => {
    if (!window.confirm(`Delete tier "${tierName}"?`)) return;
    try {
      await api.events.deleteTier(selectedEventId, tierId);
      notify(`Tier "${tierName}" deleted.`);
      setTiers((prev) => prev.filter((t) => t.id !== tierId));
    } catch (err) {
      notify(`Cannot delete tier: ${err.message}`, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // TAB 4: Promo Codes State & Handlers
  // --------------------------------------------------------------------------
  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(false);
  const [promoFormData, setPromoFormData] = useState({
    code: '',
    discount_type: 'PERCENTAGE', // PERCENTAGE or FIXED
    discount: '20',
    max_uses: '100',
    expires_at: '',
  });
  const [promoEditId, setPromoEditId] = useState(null);

  const startEditPromo = (promo) => {
    setPromoEditId(promo.id);
    setPromoFormData({
      code: promo.code || '',
      discount_type: promo.discount_type || 'PERCENTAGE',
      discount: String(promo.discount ?? promo.discount_amount ?? 20),
      max_uses: promo.max_uses ? String(promo.max_uses) : '100',
      expires_at: promo.expires_at || promo.expiry ? (typeof (promo.expires_at || promo.expiry) === 'string' ? (promo.expires_at || promo.expiry).split('T')[0] : '') : '',
    });
    setShowPromoModal(true);
  };

  const cancelEditPromo = () => {
    setPromoEditId(null);
    setPromoFormData({
      code: '',
      discount_type: 'PERCENTAGE',
      discount: '20',
      max_uses: '100',
      expires_at: '',
    });
    setShowPromoModal(false);
  };

  const loadPromos = async (eventId) => {
    if (!eventId) return;
    setLoadingPromos(true);
    try {
      const res = await api.events.getPromos(eventId);
      const list = Array.isArray(res) ? res : res?.promos || [];
      setPromos(list);
    } catch (err) {
      console.warn('Could not load promos:', err.message);
      setPromos([]);
    } finally {
      setLoadingPromos(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadPromos(selectedEventId);
    }
  }, [selectedEventId]);

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const payload = {
        code: promoFormData.code.trim().toUpperCase(),
        discount_type: promoFormData.discount_type,
        discount: Number(promoFormData.discount),
        discount_amount: Number(promoFormData.discount),
        max_uses: Number(promoFormData.max_uses) || 100,
        expires_at: promoFormData.expires_at || null,
      };

      if (promoEditId) {
        const res = await api.events.updatePromo(selectedEventId, promoEditId, payload);
        const updated = res?.promo || { id: promoEditId, ...payload };
        notify(`Mã giảm giá "${updated.code}" đã được cập nhật thành công!`);
        setPromos((prev) => prev.map((p) => (p.id === promoEditId ? { ...p, ...updated } : p)));
        cancelEditPromo();
      } else {
        const res = await api.events.createPromo(selectedEventId, payload);
        const created = res?.promo || { id: Date.now(), ...payload, usages: 0 };
        notify(`Mã giảm giá "${created.code}" đã được tạo thành công!`);
        setPromos((prev) => [created, ...prev]);
        cancelEditPromo();
      }
    } catch (err) {
      notify(`Lỗi lưu mã giảm giá: ${err.message}`, 'error');
    }
  };
  const handleCreatePromo = handleSavePromo;

  const handleDeletePromo = async (promoId, code) => {
    if (!window.confirm(`Bạn có chắc muốn xóa mã giảm giá "${code}"?`)) return;
    try {
      await api.events.deletePromo(selectedEventId, promoId);
      notify(`Đã xóa mã ưu đãi "${code}".`);
      setPromos((prev) => prev.filter((p) => p.id !== promoId));
      if (promoEditId === promoId) {
        cancelEditPromo();
      }
    } catch (err) {
      notify(`Không thể xóa mã giảm giá: ${err.message}`, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // TAB 5: Guest & Attendee List State & Handlers
  // --------------------------------------------------------------------------
  const [attendees, setAttendees] = useState([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeStatusFilter, setAttendeeStatusFilter] = useState('ALL');
  const [attendeeVisibleCount, setAttendeeVisibleCount] = useState(25);

  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [guestFormData, setGuestFormData] = useState({
    name: '',
    email: '',
    ticket_tier_id: '',
  });
  const [editingAttendee, setEditingAttendee] = useState(null);

  const handleCreateGuest = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const res = await api.events.createAttendee(selectedEventId, guestFormData);
      notify(`Đã cấp vé khách mời cho ${guestFormData.name || guestFormData.email} thành công!`);
      setShowAddGuestModal(false);
      setGuestFormData({ name: '', email: '', ticket_tier_id: '' });
      loadAttendees(selectedEventId);
    } catch (err) {
      notify(`Lỗi tạo khách mời: ${err.message}`, 'error');
    }
  };

  const handleUpdateAttendee = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !editingAttendee) return;
    try {
      await api.events.updateAttendee(selectedEventId, editingAttendee.id, editingAttendee);
      notify(`Đã cập nhật thông tin người tham dự #${editingAttendee.id} thành công!`);
      setEditingAttendee(null);
      loadAttendees(selectedEventId);
    } catch (err) {
      notify(`Lỗi cập nhật người tham dự: ${err.message}`, 'error');
    }
  };

  const handleDeleteAttendee = async (attendeeId, attendeeName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy vé của "${attendeeName}"? Mã vé này sẽ không còn giá trị vào cửa.`)) return;
    try {
      await api.events.deleteAttendee(selectedEventId, attendeeId);
      notify(`Đã hủy vé của khách "${attendeeName}" thành công.`);
      setAttendees((prev) => prev.map((a) => (a.id === attendeeId ? { ...a, status: 'CANCELLED' } : a)));
    } catch (err) {
      notify(`Lỗi hủy vé: ${err.message}`, 'error');
    }
  };

  const [eventOrders, setEventOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const loadEventOrders = async (eventId) => {
    if (!eventId) return;
    setLoadingOrders(true);
    try {
      const res = await api.events.getOrders(eventId);
      const list = Array.isArray(res) ? res : res?.orders || [];
      setEventOrders(list);
    } catch (err) {
      console.warn('Could not load event orders:', err.message);
      setEventOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadAttendees = async (eventId) => {
    if (!eventId) return;
    setLoadingAttendees(true);
    try {
      const res = await api.events.getAttendees(eventId);
      const list = Array.isArray(res) ? res : res?.attendees || [];
      setAttendees(list);
    } catch (err) {
      console.warn('Could not load attendees:', err.message);
      setAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadAttendees(selectedEventId);
      loadEventOrders(selectedEventId);
    }
  }, [selectedEventId]);

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      const query = attendeeSearch.toLowerCase();
      const name = `${a.first_name || ''} ${a.last_name || ''} ${a.name || ''}`.toLowerCase();
      const email = (a.email || '').toLowerCase();
      const ticketCode = (a.ticket_code || a.barcode || '').toLowerCase();
      const matchesQuery = !query || name.includes(query) || email.includes(query) || ticketCode.includes(query);

      const isCancelled = a.status === 'CANCELLED';
      const matchesStatus =
        attendeeStatusFilter === 'ALL' ||
        (attendeeStatusFilter === 'ACTIVE' && !isCancelled) ||
        (attendeeStatusFilter === 'CANCELLED' && isCancelled);

      return matchesQuery && matchesStatus;
    });
  }, [attendees, attendeeSearch, attendeeStatusFilter]);

  const displayedAttendees = filteredAttendees.slice(0, attendeeVisibleCount);

  // --------------------------------------------------------------------------
  // Guard for Non-organizers
  // --------------------------------------------------------------------------
  if (!authLoading && !isOrganizer) {
    return (
      <section className="card empty-state max-w-modal">
        <span className="badge badge-warning">Truy Cập Bị Giới Hạn</span>
        <h2 className="mt-08">Chỉ Dành Cho Ban Tổ Chức</h2>
        <p className="muted">
          {user?.role === 'ADMIN'
            ? 'Quản trị viên sàn (Super Admin) không thể truy cập vào giao diện Ban tổ chức sự kiện.'
            : 'Bạn cần đăng nhập bằng tài khoản Ban tổ chức để quản lý sự kiện.'}
        </p>
        {user?.role === 'ADMIN' && (
          <div className="mt-md">
            <Link to="/admin" className="btn btn-primary">
              Quay Về Bảng Quản Trị Sàn
            </Link>
          </div>
        )}
      </section>
    );
  }

  // Aggregate stats across all organizer events
  const totalTicketsSold = events.reduce((sum, e) => sum + (Number(e.tickets_sold) || 0), 0);
  const totalRevenue = events.reduce((sum, e) => sum + (Number(e.gross_revenue) || 0), 0);
  const totalRemainingCapacity = events.reduce((sum, e) => sum + (Number(e.ticket_quantity_available) || 0), 0);

  // Event-specific calculated statistics for the Event Dashboard (Của riêng từng sự kiện)
  const eventTotalCapacity = useMemo(() => {
    const fromTiers = tiers.reduce((sum, t) => sum + (Number(t.total_quantity || t.initial_quantity) || 0), 0);
    return fromTiers || Number(selectedEvent?.total_tickets) || 100;
  }, [tiers, selectedEvent]);

  const eventTicketsSold = useMemo(() => {
    const fromTiers = tiers.reduce((sum, t) => {
      const init = Number(t.total_quantity || t.initial_quantity) || 0;
      const rem = t.remaining_quantity !== undefined ? Number(t.remaining_quantity) : init;
      return sum + Math.max(0, init - rem);
    }, 0);
    return Math.max(fromTiers, Number(selectedEvent?.tickets_sold) || 0);
  }, [tiers, selectedEvent]);

  const eventTicketsRemaining = Math.max(0, eventTotalCapacity - eventTicketsSold);
  const eventSoldPercent = eventTotalCapacity > 0 ? Math.min(100, Math.round((eventTicketsSold / eventTotalCapacity) * 100)) : 0;

  const eventRevenue = useMemo(() => {
    if (selectedEvent?.gross_revenue) {
      return Number(selectedEvent.gross_revenue);
    }
    return tiers.reduce((sum, t) => {
      const init = Number(t.total_quantity || t.initial_quantity) || 0;
      const rem = t.remaining_quantity !== undefined ? Number(t.remaining_quantity) : init;
      const sold = Math.max(0, init - rem);
      return sum + (sold * (Number(t.price) || 0));
    }, 0);
  }, [selectedEvent, tiers]);

  const eventTotalAttendees = useMemo(() => {
    return attendees.length || Number(selectedEvent?.attendee_count) || eventTicketsSold;
  }, [attendees, selectedEvent, eventTicketsSold]);

  const eventActiveAttendeesCount = useMemo(() => {
    return attendees.filter((a) => a.status !== 'CANCELLED').length;
  }, [attendees]);

  const eventCompletedOrdersCount = attendees.length > 0 ? Math.ceil(attendees.length / 1.5) : 0;

  return (
    <section>
      <header className="page-head">
        <div className="flex items-center gap-sm">
          <span className="badge badge-role-organizer">{t('organizer.title', 'Studio Ban Tổ Chức')}</span>
          <span className="muted text-xs">
            {user?.name || 'Organizer'} · Account #{user?.account_id || 1}
          </span>
        </div>
        <h1>{t('organizer.title', 'Studio Ban Tổ Chức')}</h1>
        <p>{t('organizer.subtitle', 'Trung tâm vận hành sự kiện, phân bổ hạng vé, quản lý mã ưu đãi và người tham dự')}</p>
      </header>

      {/* Global Alert Notification */}
      {notice && (
        <div className={`alert ${notice.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {notice.message}
        </div>
      )}

      {/* Navigation: Overview mode vs Event-Scoped mode */}
      {activeTab === 'events' ? (
        <nav className="tabs-nav" aria-label="Organizer Sections">
          <button
            type="button"
            className="tab-btn active"
            onClick={() => setActiveTab('events')}
          >
            <span>📋 {t('organizer.tab_events', 'Sự Kiện Của Tôi')}</span>
            <span className="tab-count">{events.length}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm ml-auto"
            onClick={() => navigate('/organizer/events/new')}
          >
            ➕ {t('organizer.tab_create', 'Tạo Sự Kiện Mới')}
          </button>
        </nav>
      ) : (
        /* Event-Scoped Context Header & Navigation (Của riêng từng sự kiện) */
        <div className="event-workspace-header-block mb-md">
          <div className="event-context-bar">
            <div className="event-context-title">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('events')}
              >
                ← {t('organizer.back_to_events', 'Tất Cả Sự Kiện')}
              </button>
              {selectedEvent && (eventFormId !== null || activeTab !== 'edit-event') ? (
                <div className="flex items-center gap-sm flex-wrap">
                  <span className={`badge badge-status-${(selectedEvent?.status || 'DRAFT').toLowerCase()}`}>
                    {selectedEvent?.status || 'DRAFT'}
                  </span>
                  <h2 className="text-lg font-bold m-0">{selectedEvent?.title || 'Sự kiện'}</h2>
                  <span className="muted text-xs">
                    {formatDate(selectedEvent?.start_date || selectedEvent?.starts_at)} · {selectedEvent?.location || 'Online / TBA'}
                  </span>
                </div>
              ) : (
                <h2 className="text-lg font-bold m-0">➕ Tạo Sự Kiện Mới</h2>
              )}
            </div>

            {selectedEvent && activeTab !== 'edit-event' && events.length > 1 && (
              <div className="flex items-center gap-xs flex-wrap">
                <label htmlFor="quickEvSwitcher" className="text-xs muted whitespace-nowrap">
                  Chuyển sự kiện:
                </label>
                <select
                  id="quickEvSwitcher"
                  className="select select-sm select-bold"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} (#{ev.id})
                    </option>
                  ))}
                </select>
                <a
                  href={`/events/${selectedEventId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  title="Xem trang sự kiện công khai"
                >
                  Xem trang ↗
                </a>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  title="Xóa sự kiện này và tự động hoàn tiền 100% cho toàn bộ khách mua vé"
                  onClick={() => handleDeleteEvent(selectedEvent.id, selectedEvent.title)}
                  disabled={deletingEvent}
                >
                  🗑️ {t('organizer.delete_event', 'Xóa Sự Kiện')}
                </button>
              </div>
            )}
          </div>

          {/* Event-Scoped Tabs Navigation */}
          {selectedEvent && (eventFormId !== null || activeTab !== 'edit-event') && (
            <nav className="tabs-nav event-tabs-nav" aria-label="Event Sections">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'event-dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('event-dashboard')}
              >
                <span>📊 {t('organizer.tab_dashboard', 'Dashboard Sự Kiện')}</span>
              </button>

              <button
                type="button"
                className={`tab-btn ${activeTab === 'tiers' ? 'active' : ''}`}
                onClick={() => setActiveTab('tiers')}
              >
                <span>🎫 {t('organizer.tab_tiers', 'Hạng Vé')}</span>
                {tiers.length > 0 && <span className="tab-count">{tiers.length}</span>}
              </button>

              <button
                type="button"
                className={`tab-btn ${activeTab === 'promos' ? 'active' : ''}`}
                onClick={() => setActiveTab('promos')}
              >
                <span>🏷️ {t('organizer.tab_promos', 'Mã Giảm Giá')}</span>
                {promos.length > 0 && <span className="tab-count">{promos.length}</span>}
              </button>

              <button
                type="button"
                className={`tab-btn ${activeTab === 'attendees' ? 'active' : ''}`}
                onClick={() => setActiveTab('attendees')}
              >
                <span>👥 {t('organizer.tab_attendees', 'Khách Mời & Người Tham Dự')}</span>
                {attendees.length > 0 && <span className="tab-count">{attendees.length}</span>}
              </button>

              <button
                type="button"
                className={`tab-btn ${activeTab === 'edit-event' ? 'active' : ''}`}
                onClick={() => startEditEvent(selectedEvent)}
              >
                <span>⚙️ {t('organizer.tab_edit', 'Chỉnh Sửa Sự Kiện')}</span>
              </button>
            </nav>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 1: My Events & Overview
         ========================================================================= */}
      {activeTab === 'events' && (
        <div className="stack">
          <div className="toolbar toolbar-row-flex">
            <div className="flex items-center gap-sm flex-wrap">
              <h2 className="panel-title m-0">
                {t('organizer.tab_events', 'Sự Kiện Của Tôi')}
              </h2>
              <span className="badge badge-primary">
                {filteredEvents.length} events
              </span>
            </div>
            
            <div className="flex items-center gap-sm flex-wrap">
              <label htmlFor="organizer-event-search" className="sr-only">Tìm kiếm sự kiện</label>
              <input
                id="organizer-event-search"
                type="search"
                className="input input-sm w-input-260"
                placeholder="Search events by title, category, venue..."
                aria-label="Search events by title, category, venue..."
                value={eventSearch}
                onChange={(e) => {
                  setEventSearch(e.target.value);
                  setEventPage(1);
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/organizer/events/new')}
              >
                + Create New Event
              </button>
            </div>
          </div>

          {loadingEvents ? (
            <div className="card loading-state">Loading your events...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="card empty-state">
              <h3>No events found</h3>
              <p className="muted">Try adjusting your search keywords or create a new event listing.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/organizer/events/new')}
              >
                Create Event Now
              </button>
            </div>
          ) : (
            <>
              <div className="grid-cards">
                {paginatedEvents.map((ev) => {
                const sold = Number(ev.tickets_sold) || 0;
                const total = Number(ev.total_tickets) || (sold > 0 ? sold + 20 : 100);
                const soldPct = Math.min(100, Math.round((sold / total) * 100));

                return (
                  <article key={ev.id} className="event-card">
                    <div
                      className="event-cover"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedEventId(String(ev.id));
                        setActiveTab('event-dashboard');
                      }}
                      title="Xem chi tiết & Dashboard sự kiện"
                    >
                      {ev.cover || ev.banner ? (
                        <img src={ev.cover || ev.banner} alt={ev.title} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/events/summit.svg'; }} />
                      ) : (
                        <div className="event-thumb-placeholder">
                          {ev.category || 'Event'}
                        </div>
                      )}
                      <div className="cover-meta">
                        <span className="status-pill">{ev.category || 'Tech'}</span>
                        <span
                          className={`badge badge-status-${(ev.status || 'DRAFT').toLowerCase()}`}
                        >
                          {ev.status || 'DRAFT'}
                        </span>
                      </div>
                    </div>

                    <div className="event-card-body">
                      <h3
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedEventId(String(ev.id));
                          setActiveTab('event-dashboard');
                        }}
                        title="Xem chi tiết & Dashboard sự kiện"
                      >
                        {ev.title}
                      </h3>
                      <p className="muted text-xs">
                        {formatDate(ev.start_date || ev.starts_at)} · {ev.location || 'Online / TBA'}
                      </p>

                      <div className="stack gap-xs mt-06">
                        {/* Sold Metrics */}
                        <div className="flex justify-between text-xs">
                          <span className="muted">Tickets Sold</span>
                          <strong>
                            {sold} / {total} ({soldPct}%)
                          </strong>
                        </div>
                        <progress className="progress-bar-element" value={Math.min(100, Math.max(0, soldPct))} max={100} />

                        {/* Revenue Metric */}
                        <div className="flex justify-between text-xs mt-03">
                          <span className="muted">Gross Sales</span>
                          <strong className="note good">
                            {money(ev.gross_revenue || ev.revenue || 0)}
                          </strong>
                        </div>
                      </div>

                      {/* Event Quick Actions */}
                      <div className="card-actions flex gap-xs flex-wrap">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm w-full font-bold flex items-center justify-center gap-xs"
                          onClick={() => {
                            setSelectedEventId(String(ev.id));
                            setActiveTab('event-dashboard');
                          }}
                        >
                          <span>📊 {t('organizer.view_dashboard', 'Xem Chi Tiết & Dashboard')}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex-1"
                          title="Chỉnh sửa thông tin sự kiện"
                          onClick={() => startEditEvent(ev)}
                        >
                          ⚙️ Sửa
                        </button>

                        <button
                          type="button"
                          className="btn btn-danger btn-xs flex-1"
                          title="Xóa sự kiện & tự động hoàn tiền 100% cho khách mua vé"
                          onClick={() => handleDeleteEvent(ev.id, ev.title)}
                          disabled={deletingEvent}
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {totalEventPages > 1 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  Showing {(eventPage - 1) * eventsPerPage + 1}–{Math.min(eventPage * eventsPerPage, filteredEvents.length)} of {filteredEvents.length} events
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={eventPage <= 1}
                    onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                  >
                    ← Previous
                  </button>
                  <span className="pagination-info p-compact font-semibold">
                    Page {eventPage} / {totalEventPages}
                  </span>
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={eventPage >= totalEventPages}
                    onClick={() => setEventPage((p) => Math.min(totalEventPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )}

      {/* =========================================================================
          TAB: Event Dashboard (Của riêng từng sự kiện - Doanh thu, Vé, Người)
         ========================================================================= */}
      {activeTab === 'event-dashboard' && selectedEvent && (
        <div className="stack gap-md">
          {/* Enhanced Analytics Dashboard with Line Chart (Orders) & Bar Chart (Tiers by Day) */}
          <EventAnalyticsDashboard
            event={selectedEvent}
            tiers={tiers}
            orders={eventOrders}
            attendees={attendees}
            loading={loadingOrders}
            onRefresh={() => {
              loadEventOrders(selectedEventId);
              loadAttendees(selectedEventId);
            }}
          />

          {/* Section: Bảng phân tích chi tiết theo từng Hạng Vé */}
          <section className="card">
            <div className="toolbar toolbar-row-flex mb-md">
              <div>
                <h3 className="panel-title m-0">Hiệu Suất Theo Từng Hạng Vé</h3>
                <p className="muted text-xs m-0">Doanh thu và tiến độ lấp đầy chi tiết của từng hạng vé trong sự kiện #{selectedEvent.id}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveTab('tiers')}
              >
                + Quản Lý Hạng Vé
              </button>
            </div>

            {tiers.length === 0 ? (
              <div className="empty-state p-md text-center">
                <p className="muted">Sự kiện này chưa có hạng vé nào.</p>
                <button type="button" className="btn btn-primary btn-sm mt-xs" onClick={() => setActiveTab('tiers')}>
                  Thêm hạng vé đầu tiên
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hạng Vé</th>
                      <th>Loại</th>
                      <th>Đơn Giá</th>
                      <th>Phát Hành</th>
                      <th>Đã Bán</th>
                      <th>Còn Lại</th>
                      <th>Tỷ Lệ Bán</th>
                      <th className="text-right">Doanh Thu Thu Được</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => {
                      const totalQty = t.total_quantity || t.initial_quantity || 0;
                      const remQty = t.remaining_quantity !== undefined ? t.remaining_quantity : totalQty;
                      const soldQty = Math.max(0, totalQty - remQty);
                      const pct = totalQty > 0 ? Math.min(100, Math.round((soldQty / totalQty) * 100)) : 0;
                      const tierRev = soldQty * (Number(t.price) || 0);

                      return (
                        <tr key={t.id}>
                          <td><strong>{t.name || t.title}</strong></td>
                          <td>
                            <span className={`status-pill ${t.type === 'FREE' ? 'ready' : ''}`}>
                              {t.type || (t.price === 0 ? 'FREE' : 'PAID')}
                            </span>
                          </td>
                          <td>{t.price === 0 ? 'Miễn phí' : money(t.price)}</td>
                          <td>{totalQty}</td>
                          <td><span className="font-bold">{soldQty}</span></td>
                          <td><span className="muted">{remQty}</span></td>
                          <td>
                            <div className="flex items-center gap-xs" style={{ minWidth: 120 }}>
                              <progress className="progress-bar-element flex-1" value={pct} max={100} />
                              <span className="text-xs font-semibold">{pct}%</span>
                            </div>
                          </td>
                          <td className="text-right font-bold note good">{money(tierRev)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold bg-muted-row">
                      <td colSpan={3}>Tổng Cộng Toàn Bộ Hạng Vé</td>
                      <td>{eventTotalCapacity}</td>
                      <td>{eventTicketsSold}</td>
                      <td>{eventTicketsRemaining}</td>
                      <td>
                        <span className="text-xs font-bold">{eventSoldPercent}%</span>
                      </td>
                      <td className="text-right text-primary">{money(eventRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Section: Split 2 columns (Mã Giảm Giá & Khách Mời Mới Nhất) */}
          <div className="split">
            {/* Promo Codes Summary */}
            <section className="card flex-1">
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <h3 className="panel-title m-0">Mã Giảm Giá Của Sự Kiện ({promos.length})</h3>
                  <p className="muted text-xs m-0">Các mã ưu đãi áp dụng riêng cho sự kiện này</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setActiveTab('promos')}
                >
                  Quản lý mã →
                </button>
              </div>

              {promos.length === 0 ? (
                <div className="empty-state p-sm text-center">
                  <p className="muted text-sm">Chưa có mã giảm giá nào cho sự kiện này.</p>
                  <button type="button" className="btn btn-secondary btn-xs mt-xs" onClick={() => setActiveTab('promos')}>
                    + Tạo mã ưu đãi
                  </button>
                </div>
              ) : (
                <div className="stack gap-xs">
                  {promos.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex justify-between items-center p-sm rounded bg-muted-row border border-default">
                      <div>
                        <strong className="badge badge-primary font-mono">{p.code}</strong>
                        <span className="text-xs muted ml-sm">
                          {p.discount_type === 'PERCENTAGE' ? `Giảm ${p.discount}%` : `Giảm ${money(p.discount)}`}
                        </span>
                      </div>
                      <div className="text-xs text-right">
                        <span className="muted">Đã dùng: </span>
                        <strong>{p.usages || 0} / {p.max_uses || '∞'}</strong>
                      </div>
                    </div>
                  ))}
                  {promos.length > 4 && (
                    <button type="button" className="btn btn-link btn-xs" onClick={() => setActiveTab('promos')}>
                      Xem tất cả {promos.length} mã giảm giá →
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Recent Attendees & Guests */}
            <section className="card flex-1">
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <h3 className="panel-title m-0">Khách Mời & Người Tham Dự ({attendees.length})</h3>
                  <p className="muted text-xs m-0">Danh sách người tham dự gần đây</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setActiveTab('attendees')}
                >
                  👥 Xem Danh Sách Khách →
                </button>
              </div>

              {attendees.length === 0 ? (
                <div className="empty-state p-sm text-center">
                  <p className="muted text-sm">Chưa có người tham dự nào cho sự kiện này.</p>
                </div>
              ) : (
                <div className="stack gap-xs">
                  {attendees.slice(0, 5).map((a) => {
                    const fullName = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.name || a.email;
                    const isCancelled = a.status === 'CANCELLED';

                    return (
                      <div key={a.id || a.short_id} className="flex justify-between items-center p-sm rounded bg-muted-row border border-default">
                        <div>
                          <div className="font-bold text-sm">{fullName}</div>
                          <div className="text-xs muted font-mono">{a.ticket_code || a.barcode}</div>
                        </div>
                        <div>
                          <span className={`status-pill ${isCancelled ? 'cancelled' : 'ready'}`}>
                            {isCancelled ? 'Đã hủy' : 'Hợp lệ'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {attendees.length > 5 && (
                    <button type="button" className="btn btn-link btn-xs" onClick={() => setActiveTab('attendees')}>
                      Xem toàn bộ {attendees.length} khách mời →
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: Create & Edit Event
         ========================================================================= */}
      {activeTab === 'edit-event' && (
        <section className="card max-w-modal-large">
          <div className="flex justify-between items-center mb-125">
            <div>
              <h2 className="panel-title m-0">
                {eventFormId ? `Edit Event #${eventFormId}` : 'Create New Event'}
              </h2>
              <p className="muted text-sm mt-02">
                {eventFormId
                  ? 'Update event details, scheduling, and publication status.'
                  : 'Publish a brand new event listing with real-time tier controls.'}
              </p>
            </div>
            {eventFormId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={resetEventForm}
              >
                Clear / New Event
              </button>
            )}
          </div>

          <form onSubmit={handleSaveEvent}>
            <div className="form-group">
              <label htmlFor="evTitle">Event Title *</label>
              <input
                id="evTitle"
                type="text"
                className="input"
                required
                placeholder="e.g. Vietnam Music Festival & Live Concert Tour 2026"
                value={eventFormData.title}
                onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
              />
            </div>

            <div className="flex gap-md flex-responsive">
              <div className="form-group flex-1">
                <label htmlFor="evCategory">Category *</label>
                <select
                  id="evCategory"
                  className="select"
                  value={eventFormData.category}
                  onChange={(e) => setEventFormData({ ...eventFormData, category: e.target.value })}
                >
                  <option value="Tech">Tech</option>
                  <option value="Music">Music</option>
                  <option value="Sports">Sports</option>
                  <option value="Film">Film</option>
                  <option value="Community">Community</option>
                  <option value="Business">Business</option>
                  <option value="Design">Design</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="evStatus">Lifecycle Status *</label>
                <select
                  id="evStatus"
                  className="select"
                  value={eventFormData.status}
                  onChange={(e) => setEventFormData({ ...eventFormData, status: e.target.value })}
                >
                  <option value="LIVE">LIVE (Public On Sale)</option>
                  <option value="DRAFT">DRAFT (Private)</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="evLocation">Venue / Location</label>
              <input
                id="evLocation"
                type="text"
                className="input"
                placeholder="e.g. Yerba Buena Center, San Francisco or Online Stream"
                value={eventFormData.location}
                onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
              />
            </div>

            <div className="flex gap-md flex-responsive">
              <div className="form-group flex-1">
                <label htmlFor="evStart">Start Date & Time</label>
                <input
                  id="evStart"
                  type="datetime-local"
                  className="input"
                  value={eventFormData.start_date}
                  onChange={(e) => setEventFormData({ ...eventFormData, start_date: e.target.value })}
                />
              </div>

              <div className="form-group flex-1">
                <label htmlFor="evEnd">End Date & Time</label>
                <input
                  id="evEnd"
                  type="datetime-local"
                  className="input"
                  value={eventFormData.end_date}
                  onChange={(e) => setEventFormData({ ...eventFormData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="evDesc">Event Description & Program</label>
              <textarea
                id="evDesc"
                className="textarea"
                rows="4"
                placeholder="Provide agenda, keynote speakers, venue directions, and instructions for attendees..."
                value={eventFormData.description}
                onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
              />
            </div>

            {/* Section: Event Branding (Banner & Cover) with Direct Upload & Auto-Optimization */}
            <div className="form-section-box form-section-box-muted">
              <div className="mb-085">
                <h3 className="m-0 text-title-sm">🖼️ Ảnh Bìa & Nhận Diện Sự Kiện (Banner & Poster)</h3>
                <p className="muted mt-02 text-xs">
                  Tải ảnh trực tiếp từ thiết bị (không cần nhập URL). Hệ thống tự động ép kích cỡ và chuyển đổi sang định dạng WebP tối ưu (tối đa 10MB). Không cho phép tải video và PDF.
                </p>
              </div>

              <div className="event-branding-grid">
                {/* Banner Upload */}
                <ImageUploader
                  id="evBanner"
                  label="Ảnh bìa sự kiện (Event Banner)"
                  hint="Khuyến nghị tỉ lệ 16:9 (1920×1080px). Dùng làm hero header đầu trang chi tiết sự kiện và trang chủ."
                  value={eventFormData.banner}
                  aspect="banner"
                  maxWidth={1920}
                  maxHeight={1080}
                  onChange={(url) => setEventFormData((prev) => ({ ...prev, banner: url }))}
                />

                {/* Poster / Cover Upload */}
                <ImageUploader
                  id="evCover"
                  label="Ảnh đại diện / Poster (Event Cover)"
                  hint="Khuyến nghị tỉ lệ 4:3 hoặc vuông (1200×1200px). Dùng hiển thị trên danh sách các thẻ sự kiện."
                  value={eventFormData.cover}
                  aspect="cover"
                  maxWidth={1200}
                  maxHeight={1200}
                  onChange={(url) => setEventFormData((prev) => ({ ...prev, cover: url }))}
                />
              </div>
            </div>

            {/* Section: Blog-style Multimedia Blocks */}
            <div className="form-section-box form-section-box-muted">
              <div className="flex justify-between items-center mb-085">
                <div>
                  <h3 className="m-0 text-title-sm">📝 Trình thiết kế bài viết dạng Blog (Multimedia Blocks)</h3>
                  <p className="muted mt-02 text-xs">
                    Thêm các khối nội dung phong phú: văn bản, hình ảnh bài viết, hoặc mốc lịch trình (Agenda).
                  </p>
                </div>
                <div className="flex gap-xs">
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('text')}>
                    + Đoạn văn bản
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('media')}>
                    + Ảnh bài viết
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('schedule')}>
                    + Mốc lịch trình
                  </button>
                </div>
              </div>

              <div className="stack gap-sm">
                {eventFormData.blocks?.map((block, idx) => (
                  <div key={block.id || idx} className="blog-block-item">
                    <div className="flex justify-between items-center mb-sm">
                      <span className="badge badge-primary uppercase">
                        Khối #{idx + 1}: {block.type === 'media' ? 'Hình ảnh' : block.type}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => removeBlock(block.id)}
                        title="Xóa khối"
                      >
                        ✕ Xóa
                      </button>
                    </div>

                    {block.type === 'text' && (
                      <div className="stack gap-xs">
                        <input
                          type="text"
                          className="input input-sm"
                          placeholder="Tiêu đề đoạn..."
                          value={block.title}
                          onChange={(e) => updateBlock(block.id, 'title', e.target.value)}
                        />
                        <textarea
                          className="textarea input-sm"
                          rows="2"
                          placeholder="Nội dung văn bản chi tiết..."
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, 'content', e.target.value)}
                        />
                      </div>
                    )}

                    {block.type === 'media' && (
                      <div className="stack gap-xs">
                        <ImageUploader
                          id={`block-media-${block.id}`}
                          label="Hình ảnh bài viết"
                          hint="Tải ảnh trực tiếp từ máy (tối đa 1200px, tự nén WebP, không cho phép video & PDF)."
                          value={block.url}
                          aspect="banner"
                          maxWidth={1200}
                          maxHeight={1200}
                          onChange={(url) => updateBlock(block.id, 'url', url)}
                        />
                        <input
                          type="text"
                          className="input input-sm"
                          placeholder="Chú thích ảnh / Caption..."
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, 'caption', e.target.value)}
                        />
                      </div>
                    )}

                    {block.type === 'schedule' && (
                      <div className="form-row-2">
                        <input
                          type="text"
                          className="input input-sm"
                          placeholder="Thời gian (ví dụ: 09:00 - 10:30)"
                          value={block.time}
                          onChange={(e) => updateBlock(block.id, 'time', e.target.value)}
                        />
                        <input
                          type="text"
                          className="input input-sm"
                          placeholder="Tên hoạt động / Tham luận"
                          value={block.title}
                          onChange={(e) => updateBlock(block.id, 'title', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Section: Refund Policy */}
            <div className="form-section-box form-section-box-muted mt-125">
              <h3 className="mb-04 text-title-sm">🛡️ Chính sách Hoàn vé & Hủy vé tự phục vụ</h3>

              <div className="flex items-center gap-sm my-075">
                <input
                  id="allowRefundsToggle"
                  type="checkbox"
                  checked={eventFormData.allow_refunds}
                  onChange={(e) => setEventFormData({ ...eventFormData, allow_refunds: e.target.checked })}
                />
                <label htmlFor="allowRefundsToggle" className="m-0 font-semibold">
                  Cho phép khách tự phục vụ hủy vé & hoàn tiền trực tuyến
                </label>
              </div>

              {eventFormData.allow_refunds && (
                <div className="flex gap-md flex-responsive mt-sm">
                  <div className="form-group flex-1">
                    <label htmlFor="refundMaxDays">Số ngày tối đa được hủy sau khi đặt</label>
                    <input
                      id="refundMaxDays"
                      type="number"
                      min="1"
                      className="input"
                      value={eventFormData.refund_max_days}
                      onChange={(e) => setEventFormData({ ...eventFormData, refund_max_days: parseInt(e.target.value, 10) || 3 })}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="refundMinDays">Số ngày tối thiểu trước khi sự kiện bắt đầu</label>
                    <input
                      id="refundMinDays"
                      type="number"
                      min="1"
                      className="input"
                      value={eventFormData.refund_min_days_before_event}
                      onChange={(e) => setEventFormData({ ...eventFormData, refund_min_days_before_event: parseInt(e.target.value, 10) || 3 })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-sm mt-125">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingEvent}
              >
                {savingEvent
                  ? 'Saving...'
                  : eventFormId
                  ? 'Update Event Changes'
                  : 'Publish Event Listing'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('events')}
              >
                Cancel
              </button>
            </div>
          </form>

          {eventFormId && (
            <div
              className="card danger-zone mt-xl"
              style={{
                borderColor: 'var(--color-danger, #ef4444)',
                background: 'rgba(239, 68, 68, 0.04)',
                borderWidth: '1.5px',
                borderStyle: 'solid',
              }}
            >
              <div className="flex justify-between items-center flex-wrap gap-md">
                <div>
                  <h4 className="text-danger m-0 font-bold flex items-center gap-xs">
                    <span>⚠️</span> {t('organizer.delete_event_danger_zone', 'Vùng Nguy Hiểm: Xóa Sự Kiện')}
                  </h4>
                  <p className="muted text-sm mt-xs mb-0">
                    {t(
                      'organizer.delete_event_danger_desc',
                      'Khi xóa sự kiện, hệ thống sẽ tự động hoàn tiền 100% cho toàn bộ người mua vé và hủy toàn bộ vé đã phát hành. Thao tác này là vĩnh viễn và không thể hoàn tác.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteEvent(eventFormId, eventFormData.title || 'Sự kiện')}
                  disabled={deletingEvent}
                >
                  {deletingEvent ? 'Đang Xóa & Hoàn Tiền...' : `🗑️ ${t('organizer.delete_event_btn', 'Xóa sự kiện & Hoàn tiền 100%')}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 3: Ticket Tiers
         ========================================================================= */}
      {activeTab === 'tiers' && (
        <div className="stack">
          {/* Event Picker Bar */}
          <div className="card toolbar">
            <div className="flex items-center gap-sm flex-1">
              <label htmlFor="tierEvSelect" className="font-bold whitespace-nowrap">
                Select Event:
              </label>
              <select
                id="tierEvSelect"
                className="select max-w-400"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    #{ev.id} - {ev.title} ({ev.status})
                  </option>
                ))}
              </select>
            </div>
            <span className="muted text-sm">
              Managing ticket types, prices, and inventory
            </span>
          </div>

          {/* Existing Tiers List */}
          <section className="card">
            <div className="flex justify-between items-center mb-md">
              <div>
                <h2 className="panel-title mb-0">{t('organizer.tab_tiers', 'Cấu Hình Hạng Vé')}</h2>
                <p className="muted text-xs m-0">Quản lý các loại vé, mức giá và số lượng phát hành cho sự kiện</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setTierEditId(null);
                  setTierFormData({
                    name: '',
                    price: '2500',
                    total_quantity: '100',
                    type: 'PAID',
                    is_hidden: false,
                  });
                  setShowTierModal(true);
                }}
              >
                ➕ Thêm Hạng Vé Mới
              </button>
            </div>

            {loadingTiers ? (
              <div className="loading-state">Loading tiers...</div>
            ) : tiers.length === 0 ? (
              <div className="empty-state">
                <p className="muted">{t('organizer.no_tiers', 'Chưa có hạng vé nào được cấu hình cho sự kiện này.')}</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-sm"
                  onClick={() => {
                    setTierEditId(null);
                    setTierFormData({
                      name: '',
                      price: '2500',
                      total_quantity: '100',
                      type: 'PAID',
                      is_hidden: false,
                    });
                    setShowTierModal(true);
                  }}
                >
                  ➕ Thêm Hạng Vé Mới
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('organizer.col_tier_name', 'Tên hạng vé')}</th>
                      <th>Type</th>
                      <th>{t('organizer.col_price', 'Giá vé')}</th>
                      <th>{t('organizer.col_capacity', 'Số lượng phát hành')}</th>
                      <th>Visibility</th>
                      <th className="text-right">{t('organizer.col_actions', 'Thao tác')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => {
                      const tierPrice = t.price || 0;
                      const capacity = t.total_quantity || t.initial_quantity || 0;
                      return (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.name || t.title}</strong>
                          </td>
                          <td>
                            <span className="badge badge-info">{t.type || (tierPrice === 0 ? 'FREE' : 'PAID')}</span>
                          </td>
                          <td>
                            <strong>{money(tierPrice)}</strong>
                          </td>
                          <td>{capacity} tickets</td>
                          <td>
                            <span
                              className={`badge ${t.is_hidden ? 'badge-warning' : 'badge-success'}`}
                            >
                              {t.is_hidden ? 'Hidden' : 'Public'}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions justify-end">
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleEditTier(t)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-danger"
                                onClick={() => handleDeleteTier(t.id, t.name || t.title)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Modal Popup: Add / Edit Ticket Tier */}
          <Modal
            isOpen={showTierModal}
            onClose={() => {
              setShowTierModal(false);
              setTierEditId(null);
            }}
            title={tierEditId ? '✏️ Chỉnh Sửa Hạng Vé' : '➕ Thêm Hạng Vé Mới'}
            subtitle="Cấu hình loại vé, đơn giá thanh toán và hạn mức phát hành"
          >
            <form onSubmit={handleSaveTier}>
              <div className="form-group">
                <label htmlFor="tierName">Tier Name *</label>
                <input
                  id="tierName"
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. VIP Early Access"
                  value={tierFormData.name}
                  onChange={(e) => setTierFormData({ ...tierFormData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="tierType">Ticket Type</label>
                <select
                  id="tierType"
                  className="select"
                  value={tierFormData.type}
                  onChange={(e) => setTierFormData({ ...tierFormData, type: e.target.value })}
                >
                  <option value="PAID">PAID</option>
                  <option value="FREE">FREE</option>
                  <option value="DONATION">DONATION</option>
                </select>
              </div>

              {tierFormData.type !== 'FREE' && (
                <div className="form-group">
                  <label htmlFor="tierPrice">Price in Cents (e.g. 2500 = $25.00)</label>
                  <input
                    id="tierPrice"
                    type="number"
                    min="0"
                    className="input"
                    required
                    value={tierFormData.price}
                    onChange={(e) => setTierFormData({ ...tierFormData, price: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="tierQty">Total Quantity / Capacity</label>
                <input
                  id="tierQty"
                  type="number"
                  min="1"
                  className="input"
                  required
                  value={tierFormData.total_quantity}
                  onChange={(e) => setTierFormData({ ...tierFormData, total_quantity: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={tierFormData.is_hidden}
                    onChange={(e) => setTierFormData({ ...tierFormData, is_hidden: e.target.checked })}
                  />
                  <span>Hide tier from public catalogue (Access code only)</span>
                </label>
              </div>

              <div className="flex gap-xs mt-md">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    setShowTierModal(false);
                    setTierEditId(null);
                  }}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {tierEditId ? 'Lưu Thay Đổi' : 'Thêm Hạng Vé'}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* =========================================================================
          TAB 4: Promo Codes
         ========================================================================= */}
      {activeTab === 'promos' && (
        <div className="stack">
          {/* Event Picker Bar */}
          <div className="card toolbar">
            <div className="flex items-center gap-sm flex-1">
              <label htmlFor="promoEvSelect" className="font-bold whitespace-nowrap">
                Select Event:
              </label>
              <select
                id="promoEvSelect"
                className="select max-w-400"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    #{ev.id} - {ev.title}
                  </option>
                ))}
              </select>
            </div>
            <span className="muted text-sm">
              Special promo discounts, coupon rules & limits
            </span>
          </div>

          {/* Promo Codes List */}
          <section className="card">
            <div className="flex justify-between items-center mb-md">
              <div>
                <h2 className="panel-title mb-0">{t('organizer.tab_promos', 'Mã Giảm Giá')}</h2>
                <p className="muted text-xs m-0">Quản lý mã khuyến mãi, voucher giảm giá và hạn mức sử dụng</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  cancelEditPromo();
                  setShowPromoModal(true);
                }}
              >
                ➕ Thêm Mã Giảm Giá
              </button>
            </div>

            {loadingPromos ? (
              <div className="loading-state">Loading promo codes...</div>
            ) : promos.length === 0 ? (
              <div className="empty-state">
                <p className="muted">{t('organizer.no_promos', 'Chưa có mã giảm giá nào cho sự kiện này.')}</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-sm"
                  onClick={() => {
                    cancelEditPromo();
                    setShowPromoModal(true);
                  }}
                >
                  ➕ Thêm Mã Giảm Giá
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('organizer.col_promo_code', 'Mã ưu đãi')}</th>
                      <th>{t('organizer.col_discount', 'Giảm giá')}</th>
                      <th>{t('organizer.col_usage', 'Lượt sử dụng')} / Limit</th>
                      <th>Expires</th>
                      <th className="text-right">{t('organizer.col_actions', 'Thao tác')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promos.map((p) => {
                      const usages = p.usages || 0;
                      const maxUses = p.max_uses || p.maxUsages || '∞';
                      return (
                        <tr key={p.id || p.code}>
                          <td>
                            <span className="badge-promo-code">
                              {p.code}
                            </span>
                          </td>
                          <td>
                            <strong className="note good">
                              {p.discount_type === 'PERCENTAGE'
                                ? `${p.discount}% OFF`
                                : `${money(p.discount)} OFF`}
                            </strong>
                          </td>
                          <td>
                            {usages} / {maxUses} uses
                          </td>
                          <td className="muted text-xs">
                            {p.expires_at ? formatDate(p.expires_at) : 'No expiration'}
                          </td>
                          <td>
                            <div className="table-actions justify-end">
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                title="Chỉnh sửa mã ưu đãi"
                                onClick={() => startEditPromo(p)}
                              >
                                ✏️ Sửa
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-danger"
                                title="Xóa mã ưu đãi"
                                onClick={() => handleDeletePromo(p.id, p.code)}
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Modal Popup: Create / Edit Promo */}
          <Modal
            isOpen={showPromoModal}
            onClose={() => {
              setShowPromoModal(false);
              cancelEditPromo();
            }}
            title={promoEditId ? '✏️ Cập Nhật Mã Giảm Giá' : '➕ Tạo Mã Giảm Giá Mới'}
            subtitle="Áp dụng chiết khấu % hoặc số tiền cố định cho người mua vé"
          >
            <form onSubmit={handleSavePromo}>
              <div className="form-group">
                <label htmlFor="promoCode">Promo Code *</label>
                <input
                  id="promoCode"
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. EARLYBIRD20"
                  value={promoFormData.code}
                  onChange={(e) => setPromoFormData({ ...promoFormData, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="discountType">Discount Type</label>
                <select
                  id="discountType"
                  className="select"
                  value={promoFormData.discount_type}
                  onChange={(e) => setPromoFormData({ ...promoFormData, discount_type: e.target.value })}
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED">Fixed Amount ($ Cents)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="discountVal">
                  {promoFormData.discount_type === 'PERCENTAGE'
                    ? 'Discount Percentage (e.g. 20 for 20%)'
                    : 'Fixed Discount in Cents (e.g. 1000 = $10.00)'}
                </label>
                <input
                  id="discountVal"
                  type="number"
                  min="1"
                  className="input"
                  required
                  value={promoFormData.discount}
                  onChange={(e) => setPromoFormData({ ...promoFormData, discount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="maxUses">Max Usages</label>
                <input
                  id="maxUses"
                  type="number"
                  min="1"
                  className="input"
                  value={promoFormData.max_uses}
                  onChange={(e) => setPromoFormData({ ...promoFormData, max_uses: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expiresAt">Expiration Date (Optional)</label>
                <input
                  id="expiresAt"
                  type="date"
                  className="input"
                  value={promoFormData.expires_at}
                  onChange={(e) => setPromoFormData({ ...promoFormData, expires_at: e.target.value })}
                />
              </div>

              <div className="flex gap-xs mt-md">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    setShowPromoModal(false);
                    cancelEditPromo();
                  }}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {promoEditId ? 'Lưu Thay Đổi Mã' : 'Tạo Mã Giảm Giá'}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* =========================================================================
          TAB 5: Guest & Attendee List
         ========================================================================= */}
      {activeTab === 'attendees' && (
        <div className="stack">
          {/* Event Picker Bar */}
          <div className="card toolbar">
            <div className="flex items-center gap-sm flex-1">
              <label htmlFor="attEvSelect" className="font-bold whitespace-nowrap">
                Select Event:
              </label>
              <select
                id="attEvSelect"
                className="select max-w-400"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    #{ev.id} - {ev.title}
                  </option>
                ))}
              </select>
            </div>
            <span className="muted text-sm">
              Danh sách khách mời và quản lý người tham dự sự kiện
            </span>
          </div>

          {/* Metrics Summary Banner */}
          <div className="kpi-grid">
            <article className="card kpi">
              <span className="muted">Tổng Số Vé</span>
              <strong>{attendees.length}</strong>
              <span className="muted text-xs">Registered attendees</span>
            </article>

            <article className="card kpi">
              <span className="muted">Vé Đang Hoạt Động</span>
              <strong className="text-success">{attendees.filter((a) => a.status !== 'CANCELLED').length}</strong>
              <span className="note good text-xs">Active guest passes</span>
            </article>

            <article className="card kpi">
              <span className="muted">Vé Đã Hủy</span>
              <strong className="text-muted">{attendees.filter((a) => a.status === 'CANCELLED').length}</strong>
              <span className="muted text-xs">Cancelled tickets</span>
            </article>
          </div>

          {/* Attendee Roster Table */}
          <section className="card">
            <div className="toolbar flex-wrap gap-sm">
              <div className="search-input-wrapper flex-1-240">
                <label htmlFor="organizer-attendee-search" className="sr-only">Tìm kiếm người tham dự</label>
                <input
                  id="organizer-attendee-search"
                  type="text"
                  className="input"
                  placeholder="Search attendee by name, email, or ticket code..."
                  aria-label="Search attendee by name, email, or ticket code..."
                  value={attendeeSearch}
                  onChange={(e) => setAttendeeSearch(e.target.value)}
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex gap-xs items-center">
                <button
                  type="button"
                  className={`btn btn-xs ${attendeeStatusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAttendeeStatusFilter('ALL')}
                >
                  Tất Cả ({attendees.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${attendeeStatusFilter === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAttendeeStatusFilter('ACTIVE')}
                >
                  Hoạt Động ({attendees.filter((a) => a.status !== 'CANCELLED').length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${attendeeStatusFilter === 'CANCELLED' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAttendeeStatusFilter('CANCELLED')}
                >
                  Đã Hủy ({attendees.filter((a) => a.status === 'CANCELLED').length})
                </button>
              </div>

              <div className="flex gap-sm items-center">
                <span className="muted text-sm">
                  Showing {displayedAttendees.length} of {filteredAttendees.length} guests
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => loadAttendees(selectedEventId)}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={async () => {
                    try {
                      await api.events.exportAttendees(selectedEventId);
                    } catch (e) {
                      alert('Lỗi xuất danh sách người tham dự: ' + e.message);
                    }
                  }}
                  title="Xuất danh sách người tham dự dạng CSV/Excel"
                >
                  Xuất CSV
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setShowAddGuestModal(true)}
                  title="Cấp vé khách mời / VIP không cần thanh toán"
                >
                  ➕ Thêm Khách Mời
                </button>
              </div>
            </div>

            {/* Modal Popup: Thêm Khách Mời VIP / Comp Ticket */}
            <Modal
              isOpen={showAddGuestModal}
              onClose={() => setShowAddGuestModal(false)}
              title="➕ Cấp Vé Khách Mời / Vé Mời VIP Mới"
              subtitle="Tạo vé đặc quyền miễn phí kèm mã QR cho khách danh dự hoặc đối tác"
            >
              <form onSubmit={handleCreateGuest} className="stack gap-sm">
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Họ và tên khách mời *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Nguyễn Văn A"
                    required
                    value={guestFormData.name}
                    onChange={(e) => setGuestFormData({ ...guestFormData, name: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Email nhận vé *</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="guest@example.com"
                    required
                    value={guestFormData.email}
                    onChange={(e) => setGuestFormData({ ...guestFormData, email: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold">Hạng vé cấp phát</label>
                  <select
                    className="select"
                    value={guestFormData.ticket_tier_id}
                    onChange={(e) => setGuestFormData({ ...guestFormData, ticket_tier_id: e.target.value })}
                  >
                    <option value="">-- Mặc định (Hạng vé đầu tiên) --</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title || t.name} ({t.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-xs mt-md">
                  <button
                    type="button"
                    className="btn btn-secondary flex-1"
                    onClick={() => setShowAddGuestModal(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary flex-1">
                    ✓ Cấp Vé & Phát Hành QR
                  </button>
                </div>
              </form>
            </Modal>

            {/* Modal Popup: Chỉnh Sửa Người Tham Dự */}
            <Modal
              isOpen={!!editingAttendee}
              onClose={() => setEditingAttendee(null)}
              title={`✏️ Chỉnh Sửa Khách Mời #${editingAttendee?.id || ''}`}
              subtitle="Cập nhật thông tin định danh và hạng vé của người tham dự"
            >
              {editingAttendee && (
                <form onSubmit={handleUpdateAttendee} className="stack gap-sm">
                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold">Họ và tên</label>
                    <input
                      type="text"
                      className="input"
                      value={editingAttendee.name || `${editingAttendee.first_name || ''} ${editingAttendee.last_name || ''}`.trim()}
                      onChange={(e) => setEditingAttendee({ ...editingAttendee, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold">Email</label>
                    <input
                      type="email"
                      className="input"
                      value={editingAttendee.email || ''}
                      onChange={(e) => setEditingAttendee({ ...editingAttendee, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold">Hạng vé</label>
                    <select
                      className="select"
                      value={editingAttendee.ticket_tier_id || ''}
                      onChange={(e) => setEditingAttendee({ ...editingAttendee, ticket_tier_id: e.target.value })}
                    >
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title || t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-xs mt-md">
                    <button
                      type="button"
                      className="btn btn-secondary flex-1"
                      onClick={() => setEditingAttendee(null)}
                    >
                      Hủy
                    </button>
                    <button type="submit" className="btn btn-primary flex-1">
                      Lưu Thay Đổi
                    </button>
                  </div>
                </form>
              )}
            </Modal>

            {loadingAttendees ? (
              <div className="loading-state">Loading attendee roster...</div>
            ) : filteredAttendees.length === 0 ? (
              <div className="empty-state">
                <p className="muted">{t('organizer.no_attendees', 'Không tìm thấy người tham dự nào cho sự kiện này.')}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('organizer.col_attendee_name', 'Họ và tên')}</th>
                      <th>{t('organizer.col_email', 'Email')}</th>
                      <th>{t('organizer.col_tier_name', 'Hạng vé')}</th>
                      <th>{t('organizer.col_ticket_code', 'Mã vé (QR)')}</th>
                      <th>{t('organizer.col_status', 'Trạng thái')}</th>
                      <th className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAttendees.map((a) => {
                      const isCancelled = a.status === 'CANCELLED';
                      const fullName =
                        `${a.first_name || ''} ${a.last_name || ''}`.trim() ||
                        a.name ||
                        'Ticket Holder';
                      return (
                        <tr key={a.id || a.short_id || a.barcode}>
                          <td>
                            <div className="font-semibold">{fullName}</div>
                            <span className="muted text-xs">
                              #{a.short_id || a.id}
                            </span>
                          </td>
                          <td className="muted">{a.email}</td>
                          <td>
                            <span className="badge badge-info">{a.tier_name || a['tier name'] || 'General'}</span>
                          </td>
                          <td>
                            <span className="badge-ticket-code font-mono">
                              {a.ticket_code || a.barcode}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${isCancelled ? 'badge-status-draft' : 'badge-status-live'}`}
                            >
                              {isCancelled ? 'Đã hủy' : 'Hoạt động'}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions justify-end flex items-center gap-1">
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                title="Chỉnh sửa thông tin khách"
                                onClick={() =>
                                  setEditingAttendee({
                                    id: a.id,
                                    name: fullName,
                                    email: a.email,
                                    ticket_tier_id: a.ticket_tier_id || (tiers[0] && tiers[0].id),
                                  })
                                }
                              >
                                ✏️ Sửa
                              </button>
                              {!isCancelled && (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline-danger"
                                  title="Hủy / Xóa vé"
                                  onClick={() => handleDeleteAttendee(a.id, fullName)}
                                >
                                  🗑️ Hủy
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls for Large Attendee Volume (150+) */}
            {attendeeVisibleCount < filteredAttendees.length && (
              <div className="card-footer-action">
                <span className="muted text-sm mr-md">
                  Showing {displayedAttendees.length} of {filteredAttendees.length} attendees
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mr-sm"
                  onClick={() => setAttendeeVisibleCount((prev) => prev + 25)}
                >
                  + Load 25 More
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAttendeeVisibleCount(filteredAttendees.length)}
                >
                  Load All ({filteredAttendees.length})
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
};

export default OrganizerPage;
