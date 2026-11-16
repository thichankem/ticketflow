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

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const requestHeaders = {
    ...headers,
  };
  if (!isFormData && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (authToken && !requestHeaders['Authorization']) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      credentials: 'include', // Include HttpOnly cookies
      signal: controller.signal,
      ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
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
    createUser: (data) => apiFetch('/admin/users', { method: 'POST', body: data }),
    updateUser: (id, data) => apiFetch(`/admin/users/${id}`, { method: 'PUT', body: data }),
    updateUserRole: (id, role) => apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: { role } }),
    toggleUserStatus: (id) => apiFetch(`/admin/users/${id}/toggle-status`, { method: 'POST' }),
    suspendUser: (id) => apiFetch(`/admin/users/${id}/suspend`, { method: 'POST' }),
    deleteUser: (id) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    getEvents: () => apiFetch('/admin/events'),
    updateEventStatus: (id, status) => apiFetch(`/admin/events/${id}/status`, { method: 'PUT', body: { status } }),
    deleteEvent: (id) => apiFetch(`/admin/events/${id}`, { method: 'DELETE' }),
    getOrders: () => apiFetch('/admin/orders'),
    exportAuditReport: () => api.downloadCsv(`${API_BASE_URL}/admin/export/audit`, 'platform_financial_audit.csv'),
    getAnnouncements: () => apiFetch('/admin/announcements'),
    createAnnouncement: (data) => apiFetch('/admin/announcements', { method: 'POST', body: data }),
    deleteAnnouncement: (id) => apiFetch(`/admin/announcements/${id}`, { method: 'DELETE' }),
  },

  // Broadcast Announcements (Public / In-App)
  announcements: {
    list: () => apiFetch('/events/announcements'),
  },

  // In-App Notifications APIs
  notifications: {
    list: () => apiFetch('/events/notifications'),
    markRead: (id) => apiFetch(`/events/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => apiFetch('/events/notifications/read-all', { method: 'PUT' }),
    delete: (id) => apiFetch(`/events/notifications/${id}`, { method: 'DELETE' }),
    clearAll: () => apiFetch('/events/notifications', { method: 'DELETE' }),
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
    uploadImage: (payload) => {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        return apiFetch('/events/upload-image', { method: 'POST', body: payload });
      }
      if (payload?.file) {
        const formData = new FormData();
        formData.append('file', payload.file);
        if (payload.eventId) formData.append('eventId', payload.eventId);
        if (payload.mediaType) formData.append('mediaType', payload.mediaType);
        if (payload.fileName) formData.append('fileName', payload.fileName);
        return apiFetch('/events/upload-image', { method: 'POST', body: formData });
      }
      return apiFetch('/events/upload-image', { method: 'POST', body: payload });
    },
    deleteImage: (data) => {
      const endpoint = data?.eventId ? `/events/${data.eventId}/images` : '/events/images';
      return apiFetch(endpoint, { method: 'DELETE', body: data });
    },

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
    updatePromo: (id, promoId, data) => apiFetch(`/events/${id}/promos/${promoId}`, { method: 'PUT', body: data }),
    deletePromo: (id, promoId) => apiFetch(`/events/${id}/promos/${promoId}`, { method: 'DELETE' }),

    // Attendees & Orders
    getAttendees: (id) => apiFetch(`/events/${id}/attendees`),
    createAttendee: (id, data) => apiFetch(`/events/${id}/attendees`, { method: 'POST', body: data }),
    updateAttendee: (id, attendeeId, data) => apiFetch(`/events/${id}/attendees/${attendeeId}`, { method: 'PUT', body: data }),
    deleteAttendee: (id, attendeeId) => apiFetch(`/events/${id}/attendees/${attendeeId}`, { method: 'DELETE' }),
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

  // Auth & Profile APIs
  auth: {
    getProfile: () => apiFetch('/auth/me'),
    updateProfile: (data) => apiFetch('/auth/profile', { method: 'PUT', body: data }),
    changePassword: (data) => apiFetch('/auth/password', { method: 'PUT', body: data }),
  },
};

export default api;
