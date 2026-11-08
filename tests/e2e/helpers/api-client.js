/**
 * Opaque-box HTTP API client for E2E testing
 * Supports Cookie Jar (for HttpOnly refresh tokens), Bearer tokens, and structured JSON parsing.
 */
export class ApiClient {
  constructor(baseUrl = process.env.API_URL || 'http://localhost:3000/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = new Map();
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
  }

  getCookie(name) {
    return this.cookies.get(name);
  }

  clearCookies() {
    this.cookies.clear();
  }

  _buildCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  _parseSetCookie(headers) {
    let setCookieHeaders = [];
    if (typeof headers.getSetCookie === 'function') {
      setCookieHeaders = headers.getSetCookie();
    } else {
      const raw = headers.get('set-cookie');
      if (raw) setCookieHeaders = [raw];
    }

    for (const cookieStr of setCookieHeaders) {
      const parts = cookieStr.split(';')[0].trim().split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        this.cookies.set(key, val);
      }
    }
  }

  async request(method, path, options = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const cookieHeader = this._buildCookieHeader();
    if (cookieHeader && !headers['Cookie']) {
      headers['Cookie'] = cookieHeader;
    }

    const fetchOptions = {
      method,
      headers,
    };

    if (options.body !== undefined) {
      fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    this._parseSetCookie(response.headers);

    const contentType = response.headers.get('content-type') || '';
    let body = null;
    let rawText = '';
    try {
      rawText = await response.text();
      if (contentType.includes('application/json') || (rawText.startsWith('{') || rawText.startsWith('['))) {
        body = JSON.parse(rawText);
      } else {
        body = rawText;
      }
    } catch {
      body = rawText;
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body,
      rawText,
    };
  }

  get(path, options = {}) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }
}
