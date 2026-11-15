import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { money, formatDate, formatDateTime } from '../utils/display';

export const OrganizerPage = () => {
  const { user, isOrganizer, loading: authLoading } = useAuth();

  // Active Tab: 'events' | 'edit-event' | 'tiers' | 'promos' | 'attendees' | 'escrow' | 'helpdesk'
  const [activeTab, setActiveTab] = useState('events');

  // Global feedback / notification
  const [notice, setNotice] = useState(null);
  const notify = (msg, type = 'success') => {
    setNotice({ message: msg, type });
    setTimeout(() => setNotice(null), 4500);
  };

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
    pdf_brochure_url: '',
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
          title: type === 'text' ? 'Đoạn văn bản' : type === 'media' ? 'Media / Hình ảnh' : 'Lịch trình sự kiện',
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
      pdf_brochure_url: ev.pdf_brochure_url || ev.brochure_url || '',
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
      pdf_brochure_url: '',
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

  const handleDeleteEvent = async (eventId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? All tiers and tickets will be affected.`)) {
      return;
    }
    try {
      await api.events.delete(eventId);
      notify(`Event "${title}" deleted.`);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err) {
      notify(`Failed to delete event: ${err.message}`, 'error');
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
    if (selectedEventId && (activeTab === 'tiers' || activeTab === 'events')) {
      loadTiers(selectedEventId);
    }
  }, [selectedEventId, activeTab]);

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
    if (selectedEventId && activeTab === 'promos') {
      loadPromos(selectedEventId);
    }
  }, [selectedEventId, activeTab]);

  const handleCreatePromo = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const payload = {
        code: promoFormData.code.trim().toUpperCase(),
        discount_type: promoFormData.discount_type,
        discount: Number(promoFormData.discount),
        max_uses: Number(promoFormData.max_uses) || 100,
        expires_at: promoFormData.expires_at || null,
      };
      const res = await api.events.createPromo(selectedEventId, payload);
      const created = res?.promo || { id: Date.now(), ...payload, usages: 0 };
      notify(`Promo code ${created.code} created!`);
      setPromos((prev) => [created, ...prev]);
      setPromoFormData({
        code: '',
        discount_type: 'PERCENTAGE',
        discount: '20',
        max_uses: '100',
        expires_at: '',
      });
    } catch (err) {
      notify(`Failed to create promo: ${err.message}`, 'error');
    }
  };

  const handleDeletePromo = async (promoId, code) => {
    if (!window.confirm(`Delete promo code "${code}"?`)) return;
    try {
      await api.events.deletePromo(selectedEventId, promoId);
      notify(`Promo code "${code}" removed.`);
      setPromos((prev) => prev.filter((p) => p.id !== promoId));
    } catch (err) {
      notify(`Failed to delete promo: ${err.message}`, 'error');
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
  const [scannerInput, setScannerInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const html5QrCodeRef = useRef(null);

  const toggleCameraScanner = async () => {
    if (cameraScanning) {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn('Error stopping camera:', e);
        }
        html5QrCodeRef.current = null;
      }
      setCameraScanning(false);
    } else {
      setCameraScanning(true);
      setTimeout(async () => {
        try {
          const qrCodeScanner = new Html5Qrcode('live-qr-reader');
          html5QrCodeRef.current = qrCodeScanner;
          await qrCodeScanner.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              if (decodedText) {
                handleBarcodeScan(null, decodedText);
              }
            },
            () => {}
          );
        } catch (err) {
          console.error('Camera QR start error:', err);
          notify(`Không thể mở camera: ${err.message || 'Chưa cấp quyền camera'}`, 'error');
          setCameraScanning(false);
        }
      }, 100);
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current.stop();
          html5QrCodeRef.current.clear();
        } catch (e) {}
      }
    };
  }, []);

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

  const handleBarcodeScan = async (e, barcodeOverride = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const barcode = (barcodeOverride || scannerInput || '').trim();
    if (!barcode) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await api.events.checkInBarcode(selectedEventId, barcode);
      setScanResult({
        type: 'success',
        message: `✅ Soát vé thành công: ${res.attendee?.name || res.attendee?.first_name || barcode} đã được xác nhận vào cửa!`,
      });
      setScannerInput('');
      loadAttendees(selectedEventId);
      notify('Soát vé vào cửa thành công!');
    } catch (err) {
      if (err.status === 409) {
        setScanResult({
          type: 'error',
          message: `🚨 BÁO ĐỘNG QUÉT TRÙNG (Anti-Passback): Vé "${barcode}" này ĐÃ ĐƯỢC CHECK-IN trước đó! Từ chối vào cửa.`,
        });
        notify('Vé đã check-in trước đó (Anti-passback)!', 'error');
      } else if (err.status === 403) {
        setScanResult({
          type: 'error',
          message: `⛔ Vé "${barcode}" đã bị hủy hoặc hoàn tiền! Không có giá trị vào cửa.`,
        });
        notify('Vé đã bị hủy/hoàn tiền!', 'error');
      } else {
        setScanResult({
          type: 'error',
          message: `⚠️ Lỗi soát vé: ${err.message || 'Mã vé không tồn tại trong sự kiện này.'}`,
        });
        notify(`Lỗi soát vé: ${err.message}`, 'error');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleToggleCheckin = async (attendeeId, barcode) => {
    if (barcode) {
      await handleBarcodeScan(null, barcode);
      return;
    }
    try {
      const res = await api.events.toggleCheckin(selectedEventId, attendeeId);
      const updated = res?.attendee;
      setAttendees((prev) =>
        prev.map((a) => {
          if (a.id === attendeeId) {
            const nextStatus = updated?.status || 'CHECKED_IN';
            return {
              ...a,
              status: nextStatus,
              checked_in_at: nextStatus === 'CHECKED_IN' ? new Date().toISOString() : a.checked_in_at,
            };
          }
          return a;
        })
      );
      notify(`Check-in attendee #${attendeeId} thành công.`);
    } catch (err) {
      notify(`Lỗi check-in: ${err.message}`, 'error');
    }
  };

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      const query = attendeeSearch.toLowerCase();
      const name = `${a.first_name || ''} ${a.last_name || ''} ${a.name || ''}`.toLowerCase();
      const email = (a.email || '').toLowerCase();
      const barcode = (a.barcode || '').toLowerCase();
      const matchesQuery = !query || name.includes(query) || email.includes(query) || barcode.includes(query);

      const isChecked = a.status === 'CHECKED_IN';
      const matchesStatus =
        attendeeStatusFilter === 'ALL' ||
        (attendeeStatusFilter === 'CHECKED_IN' && isChecked) ||
        (attendeeStatusFilter === 'PENDING' && !isChecked);

      return matchesQuery && matchesStatus;
    });
  }, [attendees, attendeeSearch, attendeeStatusFilter]);

  const displayedAttendees = filteredAttendees.slice(0, attendeeVisibleCount);

  const attendeeCheckedInCount = attendees.filter((a) => a.status === 'CHECKED_IN').length;
  const attendanceRate =
    attendees.length > 0
      ? ((attendeeCheckedInCount / attendees.length) * 100).toFixed(1) + '%'
      : '0.0%';

  // --------------------------------------------------------------------------
  // TAB 6: Escrow & Payout Management (Phân hệ 2.14)
  // --------------------------------------------------------------------------
  const [escrowSummary, setEscrowSummary] = useState(null);
  const [loadingEscrow, setLoadingEscrow] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    bank_name: 'Vietcombank',
    bank_account_number: '',
    bank_account_name: '',
    notes: '',
  });
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const loadEscrowSummary = async (eventId) => {
    if (!eventId) return;
    setLoadingEscrow(true);
    try {
      const summary = await api.escrow.getEventSummary(eventId);
      setEscrowSummary(summary);
    } catch (err) {
      console.warn('Could not load escrow summary:', err.message);
      setEscrowSummary(null);
    } finally {
      setLoadingEscrow(false);
    }
  };

  useEffect(() => {
    if (selectedEventId && activeTab === 'escrow') {
      loadEscrowSummary(selectedEventId);
    }
  }, [selectedEventId, activeTab]);

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    setSubmittingPayout(true);
    try {
      await api.escrow.requestPayout(selectedEventId, payoutForm);
      notify('Yêu cầu quyết toán doanh thu đã được gửi tới Ban Quản Trị Sàn!');
      await loadEscrowSummary(selectedEventId);
      setPayoutForm({
        bank_name: 'Vietcombank',
        bank_account_number: '',
        bank_account_name: '',
        notes: '',
      });
    } catch (err) {
      notify(`Không thể gửi yêu cầu quyết toán: ${err.message}`, 'error');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 7: Helpdesk & Support Tickets (Phân hệ 2.16)
  // --------------------------------------------------------------------------
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('ALL');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await api.helpdesk.listTickets();
      const list = Array.isArray(res) ? res : res?.tickets || [];
      setTickets(list);
    } catch (err) {
      console.warn('Could not load tickets:', err.message);
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'helpdesk') {
      loadTickets();
    }
  }, [activeTab]);

  const handleOpenTicket = async (ticket) => {
    try {
      const detail = await api.helpdesk.getTicket(ticket.id);
      setSelectedTicket(detail);
    } catch {
      setSelectedTicket(ticket);
    }
  };

  const handleSendTicketReply = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await api.helpdesk.addMessage(selectedTicket.id, replyText.trim());
      notify('Đã gửi phản hồi hỗ trợ thành công!');
      const updated = await api.helpdesk.getTicket(selectedTicket.id);
      setSelectedTicket(updated);
      setReplyText('');
      loadTickets();
    } catch (err) {
      notify(`Lỗi gửi phản hồi: ${err.message}`, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const query = ticketSearch.toLowerCase();
      const subject = (t.subject || '').toLowerCase();
      const email = (t.contact_email || '').toLowerCase();
      const name = (t.contact_name || '').toLowerCase();
      const code = (t.short_id || '').toLowerCase();
      const matchesQuery = !query || subject.includes(query) || email.includes(query) || name.includes(query) || code.includes(query);

      const matchesStatus = ticketStatusFilter === 'ALL' || t.status === ticketStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [tickets, ticketSearch, ticketStatusFilter]);

  // --------------------------------------------------------------------------
  // Guard for Non-organizers
  // --------------------------------------------------------------------------
  if (!authLoading && !isOrganizer) {
    return (
      <section className="card empty-state max-w-modal">
        <span className="badge badge-warning">Restricted Access</span>
        <h2 className="mt-08">Organizer Desk Required</h2>
        <p className="muted">
          You must be signed in with an Organizer or Administrator account to manage events and check in guests.
        </p>
      </section>
    );
  }

  // Aggregate stats across all organizer events
  const totalTicketsSold = events.reduce((sum, e) => sum + (Number(e.tickets_sold) || 0), 0);
  const totalRevenue = events.reduce((sum, e) => sum + (Number(e.gross_revenue) || 0), 0);
  const totalCheckins = events.reduce((sum, e) => sum + (Number(e.checked_in_count) || 0), 0);

  return (
    <section>
      <header className="page-head">
        <div className="flex items-center gap-sm">
          <span className="badge badge-role-organizer">Organizer Desk</span>
          <span className="muted text-xs">
            {user?.name || 'Organizer'} · Account #{user?.account_id || 1}
          </span>
        </div>
        <h1>Event Operations & Desk</h1>
        <p>End-to-end management: lifecycle controls, multi-tier ticketing, promo codes, door admission, escrow & support.</p>
      </header>

      {/* Global Alert Notification */}
      {notice && (
        <div className={`alert ${notice.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          {notice.message}
        </div>
      )}

      {/* Tabs Navigation */}
      <nav className="tabs-nav" aria-label="Organizer Sections">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <span>My Events & Overview</span>
          <span className="tab-count">{events.length}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'edit-event' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit-event')}
        >
          <span>{eventFormId ? 'Edit Event' : 'Create & Edit Event'}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'tiers' ? 'active' : ''}`}
          onClick={() => setActiveTab('tiers')}
        >
          <span>Ticket Tiers</span>
          {tiers.length > 0 && <span className="tab-count">{tiers.length}</span>}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'promos' ? 'active' : ''}`}
          onClick={() => setActiveTab('promos')}
        >
          <span>Promo Codes</span>
          {promos.length > 0 && <span className="tab-count">{promos.length}</span>}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'attendees' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendees')}
        >
          <span>Guest & Attendee List</span>
          {attendees.length > 0 && <span className="tab-count">{attendees.length}</span>}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('escrow')}
        >
          <span>🛡️ Escrow & Quyết toán</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'helpdesk' ? 'active' : ''}`}
          onClick={() => setActiveTab('helpdesk')}
        >
          <span>💬 Hỗ trợ & Khiếu nại</span>
          {tickets.length > 0 && <span className="tab-count">{tickets.length}</span>}
        </button>
      </nav>

      {/* =========================================================================
          TAB 1: My Events & Overview
         ========================================================================= */}
      {activeTab === 'events' && (
        <div className="stack">
          {/* Top Aggregates */}
          <div className="kpi-grid">
            <article className="card kpi">
              <span className="muted">Total Events</span>
              <strong>{events.length}</strong>
              <span className="muted text-xs">Active & Draft</span>
            </article>

            <article className="card kpi">
              <span className="muted">Tickets Sold</span>
              <strong>{totalTicketsSold}</strong>
              <span className="note good text-xs">Issued passes</span>
            </article>

            <article className="card kpi">
              <span className="muted">Gross Revenue</span>
              <strong>{money(totalRevenue)}</strong>
              <span className="note good text-xs">Processed sales</span>
            </article>

            <article className="card kpi">
              <span className="muted">Door Check-ins</span>
              <strong>{totalCheckins}</strong>
              <span className="muted text-xs">Admitted guests</span>
            </article>
          </div>

          <div className="toolbar toolbar-row-flex">
            <div className="flex items-center gap-sm flex-wrap">
              <h2 className="panel-title m-0">
                Your Events Portfolio
              </h2>
              <span className="badge badge-primary">
                {filteredEvents.length} events
              </span>
            </div>
            
            <div className="flex items-center gap-sm flex-wrap">
              <input
                type="search"
                className="input input-sm w-input-260"
                placeholder="Search events by title, category, venue..."
                value={eventSearch}
                onChange={(e) => {
                  setEventSearch(e.target.value);
                  setEventPage(1);
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  resetEventForm();
                  setActiveTab('edit-event');
                }}
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
                onClick={() => {
                  resetEventForm();
                  setActiveTab('edit-event');
                }}
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

                const checkedIn = Number(ev.checked_in_count) || 0;
                const totalGuests = Number(ev.attendee_count) || sold || 1;
                const checkinPct = Math.min(100, Math.round((checkedIn / totalGuests) * 100));

                return (
                  <article key={ev.id} className="event-card">
                    <div className="event-cover">
                      {ev.cover ? (
                        <img src={ev.cover} alt={ev.title} />
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
                      <h3>{ev.title}</h3>
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

                        {/* Check-in Progress Bar */}
                        <div className="flex justify-between text-xs mt-03">
                          <span className="muted">Check-in Rate</span>
                          <span>
                            {checkedIn} / {totalGuests} ({checkinPct}%)
                          </span>
                        </div>
                        <progress className="progress-bar-element progress-green" value={Math.min(100, Math.max(0, checkinPct))} max={100} />
                      </div>

                      {/* Event Quick Actions */}
                      <div className="card-actions flex gap-xs flex-wrap">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex-1"
                          onClick={() => startEditEvent(ev)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex-1"
                          onClick={() => {
                            setSelectedEventId(String(ev.id));
                            setActiveTab('tiers');
                          }}
                        >
                          Tiers
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex-1"
                          onClick={() => {
                            setSelectedEventId(String(ev.id));
                            setActiveTab('attendees');
                          }}
                        >
                          Guests
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex-1"
                          onClick={() => {
                            setSelectedEventId(String(ev.id));
                            setActiveTab('escrow');
                          }}
                        >
                          Escrow
                        </button>

                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          title="Delete Event"
                          onClick={() => handleDeleteEvent(ev.id, ev.title)}
                        >
                          ✕
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

            {/* Section: Blog-style Multimedia Blocks */}
            <div className="form-section-box form-section-box-muted">
              <div className="flex justify-between items-center mb-085">
                <div>
                  <h3 className="m-0 text-title-sm">📝 Trình thiết kế bài viết dạng Blog (Multimedia Blocks)</h3>
                  <p className="muted mt-02 text-xs">
                    Thêm các khối nội dung phong phú: văn bản, hình ảnh media, hoặc mốc lịch trình (Agenda).
                  </p>
                </div>
                <div className="flex gap-xs">
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('text')}>
                    + Đoạn văn bản
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('media')}>
                    + Ảnh / Media
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
                        Khối #{idx + 1}: {block.type}
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
                        <input
                          type="url"
                          className="input input-sm"
                          placeholder="URL hình ảnh / video (https://...)"
                          value={block.url}
                          onChange={(e) => updateBlock(block.id, 'url', e.target.value)}
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

            {/* Section: Refund Policy & PDF Attachment */}
            <div className="form-section-box form-section-box-muted mt-125">
              <h3 className="mb-04 text-title-sm">🛡️ Chính sách Hoàn vé & Tài liệu Đính kèm (PDF)</h3>

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

              <div className="form-group mt-085">
                <label htmlFor="pdfBrochureUrl">Tệp tài liệu đính kèm / Cẩm nang sự kiện (URL PDF)</label>
                <input
                  id="pdfBrochureUrl"
                  type="url"
                  className="input"
                  placeholder="https://example.com/brochure-event.pdf"
                  value={eventFormData.pdf_brochure_url}
                  onChange={(e) => setEventFormData({ ...eventFormData, pdf_brochure_url: e.target.value })}
                />
              </div>
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

          <div className="split">
            {/* Existing Tiers List */}
            <section className="card flex-1">
              <h2 className="panel-title">Active Ticket Tiers</h2>
              {loadingTiers ? (
                <div className="loading-state">Loading tiers...</div>
              ) : tiers.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">No ticket tiers configured for this event yet.</p>
                  <p className="hint">Add your first admission tier using the form.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tier Name</th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>Capacity</th>
                        <th>Visibility</th>
                        <th className="text-right">Actions</th>
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

            {/* Tier Form */}
            <section className="card w-modal-380">
              <h2 className="panel-title">
                {tierEditId ? 'Edit Ticket Tier' : 'Add New Tier'}
              </h2>

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
                  <button type="submit" className="btn btn-primary flex-1">
                    {tierEditId ? 'Update Tier' : 'Add Tier to Event'}
                  </button>
                  {tierEditId && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setTierEditId(null);
                        setTierFormData({
                          name: '',
                          price: '2500',
                          total_quantity: '100',
                          type: 'PAID',
                          is_hidden: false,
                        });
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>
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

          <div className="split">
            {/* Promo Codes List */}
            <section className="card flex-1">
              <h2 className="panel-title">Active Promo Codes</h2>
              {loadingPromos ? (
                <div className="loading-state">Loading promo codes...</div>
              ) : promos.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">No promo codes active for this event.</p>
                  <p className="hint">Create a promotional code to run ticket discounts.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Discount</th>
                        <th>Usage / Limit</th>
                        <th>Expires</th>
                        <th className="text-right">Actions</th>
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
                                  className="btn btn-xs btn-danger"
                                  onClick={() => handleDeletePromo(p.id, p.code)}
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

            {/* Create Promo Form */}
            <section className="card w-modal-380">
              <h2 className="panel-title">Create Promo Code</h2>

              <form onSubmit={handleCreatePromo}>
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

                <button type="submit" className="btn btn-primary btn-block mt-08">
                  Publish Promo Code
                </button>
              </form>
            </section>
          </div>
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
              Guest roster, credentials, and live check-in overrides
            </span>
          </div>

          {/* Metrics Summary Banner */}
          <div className="kpi-grid">
            <article className="card kpi">
              <span className="muted">Total Tickets</span>
              <strong>{attendees.length}</strong>
              <span className="muted text-xs">Registered attendees</span>
            </article>

            <article className="card kpi">
              <span className="muted">Checked In</span>
              <strong>{attendeeCheckedInCount}</strong>
              <span className="note good text-xs">Admitted at door</span>
            </article>

            <article className="card kpi">
              <span className="muted">Attendance Rate</span>
              <strong>{attendanceRate}</strong>
              <span className="muted text-xs">Turnout percentage</span>
            </article>
          </div>

          {/* Attendee Roster Table */}
          <section className="card">
            <div className="toolbar flex-wrap gap-sm">
              <div className="search-input-wrapper flex-1-240">
                <input
                  type="text"
                  className="input"
                  placeholder="Search attendee by name, email, or barcode..."
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
                  All ({attendees.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${attendeeStatusFilter === 'CHECKED_IN' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAttendeeStatusFilter('CHECKED_IN')}
                >
                  Admitted ({attendeeCheckedInCount})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${attendeeStatusFilter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAttendeeStatusFilter('PENDING')}
                >
                  Pending ({attendees.length - attendeeCheckedInCount})
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
              </div>
            </div>

            {/* Quick QR & Barcode Door Scanner Console */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
                <div>
                  <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span>📷 Máy Quét Vé Cổng Soát Vé (Door QR / Barcode Scanner)</span>
                    <span className="badge badge-success text-xs font-normal">Chống Quét Trùng (Anti-Passback) Active</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Quét trực tiếp bằng camera, đầu đọc mã vạch chuyên dụng hoặc nhập mã barcode (ví dụ: TKT-100-200) rồi nhấn Enter.
                  </p>
                </div>
                <button
                  type="button"
                  className={`btn ${cameraScanning ? 'btn-danger' : 'btn-secondary'} btn-sm flex items-center gap-xs`}
                  onClick={toggleCameraScanner}
                >
                  <span>{cameraScanning ? '⏹️ Tắt Camera Quét QR' : '📷 Mở Camera Quét QR'}</span>
                </button>
              </div>

              {cameraScanning && (
                <div className="live-qr-scanner-wrapper mb-md mt-sm">
                  <div id="live-qr-reader" className="mx-auto max-w-400 rounded-lg overflow-hidden border border-default" />
                  <p className="text-xs muted text-center mt-xs">Hướng camera về phía mã QR trên vé của người tham dự để tự động soát vé.</p>
                </div>
              )}

              <form onSubmit={handleBarcodeScan} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Quét hoặc nhập mã Barcode vé (vd: TKT-...)..."
                  className="form-control flex-1 font-mono text-sm uppercase"
                  value={scannerInput}
                  onChange={(e) => setScannerInput(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={scanning || !scannerInput.trim()}
                  className="btn btn-primary text-sm whitespace-nowrap px-4 py-2"
                >
                  {scanning ? 'Đang xác thực...' : 'Soát Vé (Check-in)'}
                </button>
              </form>

              {scanResult && (
                <div
                  className={`mt-3 p-3 rounded-lg text-sm font-medium ${
                    scanResult.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800'
                  }`}
                >
                  {scanResult.message}
                </div>
              )}
            </div>

            {loadingAttendees ? (
              <div className="loading-state">Loading attendee roster...</div>
            ) : filteredAttendees.length === 0 ? (
              <div className="empty-state">
                <p className="muted">No attendees found for this event or matching your search.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Attendee</th>
                      <th>Email</th>
                      <th>Tier</th>
                      <th>Ticket Barcode</th>
                      <th>Status</th>
                      <th>Check-in Time</th>
                      <th className="text-right">One-Click Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAttendees.map((a) => {
                      const isCheckedIn = a.status === 'CHECKED_IN';
                      const fullName =
                        `${a.first_name || ''} ${a.last_name || ''}`.trim() ||
                        a.name ||
                        'Ticket Holder';
                      return (
                        <tr key={a.id || a.barcode}>
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
                            <span className="badge-barcode">
                              {a.barcode}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${isCheckedIn ? 'badge-status-live' : 'badge-status-draft'}`}
                            >
                              {isCheckedIn ? 'Checked In' : 'Not Checked In'}
                            </span>
                          </td>
                          <td className="muted text-xs">
                            {a.checked_in_at ? formatDateTime(a.checked_in_at) : '—'}
                          </td>
                          <td>
                            <div className="table-actions justify-end">
                              {isCheckedIn ? (
                                <span className="badge badge-success font-semibold">
                                  ✓ Đã vào cửa
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-primary"
                                  onClick={() => handleToggleCheckin(a.id, a.barcode)}
                                >
                                  Soát vé vào
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

      {/* =========================================================================
          TAB 6: Escrow & Payout Management (Phân hệ 2.14)
         ========================================================================= */}
      {activeTab === 'escrow' && (
        <div className="stack">
          {/* Event Picker Bar */}
          <div className="card toolbar">
            <div className="flex items-center gap-sm flex-1">
              <label htmlFor="escrowEvSelect" className="font-bold whitespace-nowrap">
                Select Event:
              </label>
              <select
                id="escrowEvSelect"
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
            <div className="flex gap-sm items-center">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    await api.events.exportSales(selectedEventId);
                  } catch (e) {
                    alert('Lỗi xuất báo cáo doanh thu: ' + e.message);
                  }
                }}
                title="Xuất báo cáo bán hàng & doanh thu sự kiện dạng CSV"
              >
                Xuất Báo Cáo Doanh Thu (CSV)
              </button>
            </div>
          </div>

          {loadingEscrow ? (
            <div className="card loading-state">Đang tải đối soát doanh thu Escrow...</div>
          ) : !escrowSummary ? (
            <div className="card empty-state">Không tìm thấy thông tin tài chính Escrow cho sự kiện này.</div>
          ) : (
            <div className="stack">
              {/* Financial Statement KPI Cards */}
              <div className="kpi-grid">
                <article className="card kpi">
                  <span className="muted">Tổng Doanh Thu Vé (Gross)</span>
                  <strong>{money(escrowSummary.gross_sales, escrowSummary.currency)}</strong>
                  <span className="muted text-xs">
                    {escrowSummary.completed_orders_count || 0} đơn thành công
                  </span>
                </article>

                <article className="card kpi">
                  <span className="muted">Hoa Hồng Sàn (5%)</span>
                  <strong>{money(escrowSummary.commission_amount, escrowSummary.currency)}</strong>
                  <span className="note text-xs">
                    Phí nền tảng Ticketflow (5%)
                  </span>
                </article>

                <article className="card kpi">
                  <span className="muted">Đã Hoàn Hủy Tự Phục Vụ</span>
                  <strong className="text-danger">
                    {money(escrowSummary.total_refunded, escrowSummary.currency)}
                  </strong>
                  <span className="muted text-xs">
                    {escrowSummary.refunded_orders_count || 0} đơn đã hoàn tiền
                  </span>
                </article>

                <article className="card kpi">
                  <span className="muted">Số Dư Thực Nhận (Net Payout)</span>
                  <strong className="note good text-title-md">
                    {money(escrowSummary.net_payout_amount, escrowSummary.currency)}
                  </strong>
                  <span className="muted text-xs">
                    Khả dụng sau thời gian đóng băng
                  </span>
                </article>
              </div>

              {/* Escrow Cooling-Off Notice */}
              <div className="card escrow-callout-card">
                <h3 className="text-base-plus mb-sm">
                  🛡️ Quy chế Bảo chứng Escrow Plan A (100% Online-only)
                </h3>
                <p className="muted text-sm m-0">
                  Toàn bộ tiền bán vé được bảo lưu 100% trong tài khoản phong tỏa của sàn suốt thời gian bán vé nhằm bảo vệ quyền lợi người mua.
                  Thời gian kết thúc giải ngân: <strong>3-5 ngày sau khi sự kiện kết thúc thành công</strong> để xử lý khiếu nại (nếu có).
                </p>
                <div className="mt-075">
                  Trạng thái giải ngân hiện tại:{' '}
                  <span className="badge badge-primary">
                    {escrowSummary.eligibility_status === 'ELIGIBLE_FOR_PAYOUT'
                      ? '✅ ĐÃ ĐỦ ĐIỀU KIỆN QUYẾT TOÁN'
                      : escrowSummary.eligibility_status === 'DISPUTE_COOLING_OFF'
                      ? `⏳ Đang trong thời gian bảo chứng đóng băng (còn ~${escrowSummary.days_until_eligible} ngày)`
                      : `🔒 Đang mở bán vé / Sự kiện chưa kết thúc (còn ~${escrowSummary.days_until_eligible} ngày)`}
                  </span>
                </div>
              </div>

              <div className="split">
                {/* Existing Payout Requests List */}
                <section className="card flex-1">
                  <h2 className="panel-title">Lịch sử Yêu cầu Quyết toán</h2>
                  {!escrowSummary.existing_payouts || escrowSummary.existing_payouts.length === 0 ? (
                    <div className="empty-state">
                      <p className="muted">Chưa có yêu cầu quyết toán nào cho sự kiện này.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Mã yêu cầu</th>
                            <th>Số tiền thực nhận</th>
                            <th>Tài khoản thụ hưởng</th>
                            <th>Trạng thái</th>
                            <th>Ngày tạo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {escrowSummary.existing_payouts.map((p) => (
                            <tr key={p.id}>
                              <td><strong>#PAY-{p.id}</strong></td>
                              <td><strong className="note good">{money(p.net_amount || p.requested_amount)}</strong></td>
                              <td>
                                <div>{p.bank_name}</div>
                                <span className="muted text-xs">
                                  STK: {p.bank_account_number} ({p.bank_account_name})
                                </span>
                              </td>
                              <td>
                                <span className={`badge badge-status-${(p.status || 'REQUESTED').toLowerCase()}`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="muted text-xs">
                                {formatDateTime(p.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Submit Payout Request Form */}
                <section className="card w-modal-380">
                  <h2 className="panel-title">Yêu cầu Rút Doanh thu</h2>
                  <p className="muted text-sm">
                    Nhập tài khoản ngân hàng của đơn vị tổ chức để sàn đối soát và giải ngân tiền bán vé.
                  </p>

                  <form onSubmit={handleRequestPayout}>
                    <div className="form-group">
                      <label htmlFor="payoutBankName">Ngân hàng thụ hưởng *</label>
                      <input
                        id="payoutBankName"
                        type="text"
                        className="input"
                        required
                        placeholder="Vietcombank, Techcombank, MB Bank..."
                        value={payoutForm.bank_name}
                        onChange={(e) => setPayoutForm({ ...payoutForm, bank_name: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="payoutAccNum">Số tài khoản ngân hàng *</label>
                      <input
                        id="payoutAccNum"
                        type="text"
                        className="input"
                        required
                        placeholder="0123456789"
                        value={payoutForm.bank_account_number}
                        onChange={(e) => setPayoutForm({ ...payoutForm, bank_account_number: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="payoutAccHolder">Tên chủ tài khoản (In hoa không dấu) *</label>
                      <input
                        id="payoutAccHolder"
                        type="text"
                        className="input"
                        required
                        placeholder="NGUYEN VAN A"
                        value={payoutForm.bank_account_name}
                        onChange={(e) => setPayoutForm({ ...payoutForm, bank_account_name: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="payoutNotes">Ghi chú đối soát (Tùy chọn)</label>
                      <textarea
                        id="payoutNotes"
                        className="textarea"
                        rows="2"
                        placeholder="Đề nghị quyết toán đợt 1..."
                        value={payoutForm.notes}
                        onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                      />
                    </div>

                    <div className="audit-note-box">
                      <div className="flex justify-between">
                        <span>Số dư giải ngân:</span>
                        <strong>{money(escrowSummary.net_payout_amount, escrowSummary.currency)}</strong>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary btn-block mt-md"
                      disabled={submittingPayout || escrowSummary.net_payout_amount <= 0}
                    >
                      {submittingPayout ? 'Đang gửi yêu cầu...' : 'Gửi Yêu Cầu Quyết Toán'}
                    </button>
                  </form>
                </section>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 7: Helpdesk & Support Tickets (Phân hệ 2.16)
         ========================================================================= */}
      {activeTab === 'helpdesk' && (
        <div className="stack">
          <div className="toolbar">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="input"
                placeholder="Tìm phiếu hỗ trợ theo tiêu đề, email, mã phiếu..."
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
              />
            </div>

            <div className="filter-pills">
              <span className="muted text-xs mr-02">
                Trạng thái:
              </span>
              {['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`filter-pill ${ticketStatusFilter === st ? 'active' : ''}`}
                  onClick={() => setTicketStatusFilter(st)}
                >
                  {st === 'ALL' ? 'Tất cả' : st}
                </button>
              ))}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={loadTickets}>
              Làm mới
            </button>
          </div>

          <div className="split">
            {/* Tickets Table */}
            <section className="card flex-1">
              <h2 className="panel-title">Danh sách Phiếu Hỗ trợ & Tranh chấp</h2>
              {loadingTickets ? (
                <div className="loading-state">Đang tải phiếu hỗ trợ...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">Không có phiếu hỗ trợ nào cần xử lý.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Mã phiếu</th>
                        <th>Chủ đề / Yêu cầu</th>
                        <th>Người gửi</th>
                        <th>Độ ưu tiên</th>
                        <th>Trạng thái</th>
                        <th>Ngày tạo</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.map((t) => (
                        <tr key={t.id}>
                          <td><strong>{t.short_id || `#TCK-${t.id}`}</strong></td>
                          <td>
                            <div className="font-semibold">{t.subject}</div>
                            <span className="muted text-xs">{t.category}</span>
                          </td>
                          <td>
                            <div>{t.contact_name}</div>
                            <span className="muted text-xs">{t.contact_email}</span>
                          </td>
                          <td>
                            <span className={`badge ${t.priority === 'URGENT' || t.priority === 'HIGH' ? 'badge-danger' : 'badge-primary'}`}>
                              {t.priority}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-status-${(t.status || 'OPEN').toLowerCase()}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="muted text-xs">
                            {formatDate(t.created_at)}
                          </td>
                          <td>
                            <div className="table-actions justify-end">
                              <button
                                type="button"
                                className="btn btn-xs btn-primary"
                                onClick={() => handleOpenTicket(t)}
                              >
                                Xem & Phản hồi
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Ticket Thread & Reply Panel */}
            {selectedTicket && (
              <section className="card w-modal-420">
                <div className="flex justify-between items-center mb-075">
                  <h2 className="panel-title m-0">
                    {selectedTicket.short_id || `#${selectedTicket.id}`}
                  </h2>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setSelectedTicket(null)}
                  >
                    ✕ Đóng
                  </button>
                </div>

                <div className="stack gap-xs border-b-line pb-075 mb-md">
                  <div className="font-bold text-base-plus">{selectedTicket.subject}</div>
                  <div className="flex gap-xs flex-wrap">
                    <span className="badge badge-info">{selectedTicket.category}</span>
                    <span className="badge badge-primary">{selectedTicket.priority}</span>
                    <span className={`badge badge-status-${(selectedTicket.status || 'OPEN').toLowerCase()}`}>
                      {selectedTicket.status}
                    </span>
                  </div>
                  <p className="dispute-summary-preview">
                    {selectedTicket.description}
                  </p>
                  {selectedTicket.evidence_url && (
                    <div className="text-xs">
                      Bằng chứng đính kèm:{' '}
                      <a href={selectedTicket.evidence_url} target="_blank" rel="noopener noreferrer">
                        Xem tài liệu
                      </a>
                    </div>
                  )}
                </div>

                {/* Messages History */}
                <h3 className="text-sm mb-sm">Trao đổi & Hòa giải:</h3>
                <div className="stack gap-xs dispute-history-scroll">
                  {(!selectedTicket.messages || selectedTicket.messages.length === 0) ? (
                    <p className="muted text-xs">Chưa có tin nhắn phản hồi nào.</p>
                  ) : (
                    selectedTicket.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`ticket-bubble ${
                          m.sender_role === 'ORGANIZER'
                            ? 'ticket-bubble-organizer'
                            : m.sender_role === 'ADMIN'
                            ? 'ticket-bubble-admin'
                            : 'ticket-bubble-default'
                        }`}>
                        <div className="flex justify-between text-xs mb-02">
                          <strong>{m.sender_name} ({m.sender_role})</strong>
                          <span className="muted">{formatDateTime(m.created_at)}</span>
                        </div>
                        <div>{m.message}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendTicketReply}>
                  <div className="form-group">
                    <label htmlFor="ticketReplyMsg">Phản hồi của Ban Tổ Chức:</label>
                    <textarea
                      id="ticketReplyMsg"
                      className="textarea"
                      rows="3"
                      required
                      placeholder="Nhập nội dung hướng dẫn hoặc giải quyết khiếu nại cho khách..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={sendingReply || !replyText.trim()}
                  >
                    {sendingReply ? 'Đang gửi...' : 'Gửi Phản Hồi Cho Khách'}
                  </button>
                </form>
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default OrganizerPage;
