/**
 * Native Fetch HTTP Client Wrapper
 * Implements explicit status checks, AbortController timeout, Bearer header, and credentials: 'include'.
 */

const API_BASE = '/api';
const API_BASE_URL = API_BASE;
export { API_BASE, API_BASE_URL };

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let authToken = localStorage.getItem('token') || null;

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
};

export const getAuthToken = () => authToken;

export const apiFetch = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    headers = {},
    timeoutMs = 15000,
    signal = null,
  } = options;

  // AbortController for timeout & cancellation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If external signal provided, forward it
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (authToken && !requestHeaders['Authorization']) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      credentials: 'include', // Include HttpOnly cookies
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    clearTimeout(timeoutId);

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    // Explicit HTTP status validation
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
      throw new ApiError(errorMsg, response.status, data);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out or cancelled by user', 408);
    }
    throw err;
  }
};

export const api = {
  get: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiFetch(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => apiFetch(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'DELETE' }),

  downloadCsv: async (url, filename) => {
    const token = getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const fullUrl = (url.startsWith('http') || url.startsWith('/')) ? url : `${API_BASE}/${url}`;
    const res = await fetch(fullUrl, { headers });
    if (!res.ok) throw new Error('Không thể tải file CSV');
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  },

  // Admin APIs
  admin: {
    getStats: () => apiFetch('/admin/stats'),
    getUsers: () => apiFetch('/admin/users'),
    updateUserRole: (id, role) => apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: { role } }),
    toggleUserStatus: (id) => apiFetch(`/admin/users/${id}/toggle-status`, { method: 'POST' }),
    suspendUser: (id) => apiFetch(`/admin/users/${id}/suspend`, { method: 'POST' }),
    deleteUser: (id) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    getEvents: () => apiFetch('/admin/events'),
    updateEventStatus: (id, status) => apiFetch(`/admin/events/${id}/status`, { method: 'PUT', body: { status } }),
    deleteEvent: (id) => apiFetch(`/admin/events/${id}`, { method: 'DELETE' }),
    getOrders: () => apiFetch('/admin/orders'),
    getDiagnostics: () => apiFetch('/admin/diagnostics'),
    exportAuditReport: () => api.downloadCsv(`${API_BASE_URL}/admin/export/audit`, 'platform_financial_audit.csv'),
  },

  // Events & Organizer APIs
  events: {
    list: (params) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/events${q}`);
    },
    getById: (id) => apiFetch(`/events/${id}`),
    getRecommendations: () => apiFetch('/events/recommendations'),
    create: (data) => apiFetch('/events', { method: 'POST', body: data }),
    update: (id, data) => apiFetch(`/events/${id}`, { method: 'PUT', body: data }),
    delete: (id) => apiFetch(`/events/${id}`, { method: 'DELETE' }),

    // Organizer Dashboard
    getOrganizerDashboard: () => apiFetch('/events/organizer/dashboard'),

    // CSV Exports (Phân hệ 2.14)
    exportAttendees: (id) => api.downloadCsv(`${API_BASE_URL}/events/${id}/export/attendees`, `attendees_event_${id}.csv`),
    exportSales: (id) => api.downloadCsv(`${API_BASE_URL}/events/${id}/export/sales`, `sales_report_event_${id}.csv`),

    // Tiers
    getTiers: (id) => apiFetch(`/events/${id}/tiers`),
    createTier: (id, data) => apiFetch(`/events/${id}/tiers`, { method: 'POST', body: data }),
    updateTier: (id, tierId, data) => apiFetch(`/events/${id}/tiers/${tierId}`, { method: 'PUT', body: data }),
    deleteTier: (id, tierId) => apiFetch(`/events/${id}/tiers/${tierId}`, { method: 'DELETE' }),

    // Promos
    getPromos: (id) => apiFetch(`/events/${id}/promos`),
    createPromo: (id, data) => apiFetch(`/events/${id}/promos`, { method: 'POST', body: data }),
    deletePromo: (id, promoId) => apiFetch(`/events/${id}/promos/${promoId}`, { method: 'DELETE' }),

    // Attendees & Orders
    getAttendees: (id) => apiFetch(`/events/${id}/attendees`),
    toggleCheckin: (id, attendeeId) => apiFetch(`/events/${id}/attendees/${attendeeId}/toggle-checkin`, { method: 'POST' }),
    checkInBarcode: (id, barcode, attendee_id) => apiFetch(`/events/${id}/attendees/check-in`, { method: 'POST', body: { barcode, attendee_id } }),
    getOrders: (id) => apiFetch(`/events/${id}/orders`),
  },

  // Location APIs
  location: {
    getProvinces: () => apiFetch('/location/provinces'),
    getDistance: (from, to) => apiFetch(`/location/distance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  },

  // Orders & Refunds APIs
  orders: {
    getMyOrders: () => apiFetch('/orders/my'),
    list: () => apiFetch('/orders'),
    getById: (id) => apiFetch(`/orders/${id}`),
    reserve: (eventId, data) => apiFetch(`/public/events/${eventId}/order`, { method: 'POST', body: data }),
    checkout: (id, data) => apiFetch(`/orders/${id}/checkout`, { method: 'POST', body: data }),
    refund: (id, data) => apiFetch(`/orders/${id}/refund`, { method: 'POST', body: data }),
    cancel: (id, data = {}) => apiFetch(`/orders/${id}/cancel`, { method: 'POST', body: data }),
    transferTicket: (attendeeId, data) => apiFetch(`/orders/attendees/${attendeeId}/transfer`, { method: 'POST', body: data }),
    processPayment: (id, data) => apiFetch(`/orders/${id}/payment`, { method: 'POST', body: data }),
    getReceipt: (id) => apiFetch(`/orders/${id}/receipt`),
  },

  // Escrow & Payout Management APIs (Phân hệ 2.14)
  escrow: {
    getEventSummary: (eventId) => apiFetch(`/escrow/events/${eventId}`),
    requestPayout: (eventId, data) => apiFetch(`/escrow/events/${eventId}/payout-request`, { method: 'POST', body: data }),
    getAllPayouts: () => apiFetch('/escrow/payouts'),
    updatePayoutStatus: (payoutId, status, notes = '') =>
      apiFetch(`/escrow/payouts/${payoutId}/status`, { method: 'PUT', body: { status, notes } }),
  },

  // Helpdesk & Dispute Mediation APIs (Phân hệ 2.16)
  helpdesk: {
    getFaqs: (category) => apiFetch(`/helpdesk/faqs${category ? `?category=${category}` : ''}`),
    createTicket: (data) => apiFetch('/helpdesk/tickets', { method: 'POST', body: data }),
    getTicket: (id) => apiFetch(`/helpdesk/tickets/${id}`),
    listTickets: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiFetch(`/helpdesk/tickets${q ? `?${q}` : ''}`);
    },
    addMessage: (ticketId, message) => apiFetch(`/helpdesk/tickets/${ticketId}/messages`, { method: 'POST', body: { message } }),
    updateStatus: (ticketId, status, resolution_notes) =>
      apiFetch(`/helpdesk/tickets/${ticketId}/status`, { method: 'PUT', body: { status, resolution_notes } }),
  },
};

export default api;
