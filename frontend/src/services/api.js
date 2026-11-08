/**
 * Native Fetch HTTP Client Wrapper
 * Implements explicit status checks, AbortController timeout, Bearer header, and credentials: 'include'.
 */

const API_BASE = '/api';

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
};

export default api;
