import http from 'node:http';
import { URL } from 'node:url';

/**
 * In-memory reference oracle server implementing the exact API contracts
 * from ORIGINAL_REQUEST.md and PROJECT.md.
 * Used for opaque-box verification and offline E2E test suite validation.
 */
export function createMockServer() {
  // State
  let nextUserId = 1;
  let nextEventId = 1;
  let nextTierId = 1;
  let nextOrderId = 1;
  let nextPromoId = 1;
  let nextAttendeeId = 1;

  const users = new Map(); // id -> user
  const events = new Map(); // id -> event
  const ticketTiers = new Map(); // id -> tier
  const orders = new Map(); // id -> order
  const promos = new Map(); // id -> promo
  const attendees = new Map(); // id -> attendee
  const rateLimitBuckets = new Map(); // ip_endpoint -> [timestamps]

  // Pre-seed some default accounts
  const seedAdmin = { id: nextUserId++, name: 'Super Admin', email: 'admin@ticketflow.local', password: 'password123', role: 'ADMIN', account_id: 1, is_active: true };
  const seedOrganizer = { id: nextUserId++, name: 'Demo Organizer', email: 'organizer@ticketflow.local', password: 'password123', role: 'ORGANIZER', account_id: 2, is_active: true };
  const seedAttendee = { id: nextUserId++, name: 'John Doe', email: 'attendee@ticketflow.local', password: 'password123', role: 'ATTENDEE', account_id: 3, is_active: true };
  users.set(seedAdmin.id, seedAdmin);
  users.set(seedOrganizer.id, seedOrganizer);
  users.set(seedAttendee.id, seedAttendee);

  // Pre-seed a sample live event
  const seedEvent = {
    id: nextEventId++,
    account_id: seedOrganizer.account_id,
    title: 'Global Tech Summit 2026',
    description: 'Premier developer conference on cloud, AI and distributed systems.',
    status: 'LIVE',
    starts_at: '2026-12-01T09:00:00Z',
    ends_at: '2026-12-03T18:00:00Z',
  };
  events.set(seedEvent.id, seedEvent);

  // Pre-seed ticket tiers
  const tier1 = {
    id: nextTierId++,
    event_id: seedEvent.id,
    name: 'General Admission',
    type: 'PAID',
    price: 4900, // minor units ($49.00)
    total_quantity: 100,
    remaining_quantity: 100,
    min_per_order: 1,
    max_per_order: 5,
    is_hidden: false,
  };
  const tier2 = {
    id: nextTierId++,
    event_id: seedEvent.id,
    name: 'Free Community Pass',
    type: 'FREE',
    price: 0,
    total_quantity: 50,
    remaining_quantity: 50,
    min_per_order: 1,
    max_per_order: 2,
    is_hidden: false,
  };
  ticketTiers.set(tier1.id, tier1);
  ticketTiers.set(tier2.id, tier2);

  // Pre-seed promo code
  const promo1 = {
    id: nextPromoId++,
    event_id: seedEvent.id,
    code: 'SAVE20',
    discount_type: 'PERCENTAGE',
    discount_amount: 20, // 20%
    max_uses: 50,
    used_count: 0,
    is_active: true,
  };
  promos.set(promo1.id, promo1);

  function stripHtmlTags(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/<[^>]*>/g, '');
  }

  function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:[^"']*/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/on\w+\s*=\s*(?:[^\s>]+|"[^"]*"|'[^']*')/gi, '');
  }

  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  }

  function getUserFromAuthHeader(req) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.substring(7);
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      const user = users.get(decoded.id);
      if (!user || user.is_active === false) return null;
      return user;
    } catch {
      return null;
    }
  }

  function parseCookies(req) {
    const header = req.headers['cookie'] || '';
    const cookies = {};
    for (const pair of header.split(';')) {
      const parts = pair.trim().split('=');
      if (parts.length >= 2) {
        cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    }
    return cookies;
  }

  function isRateLimited(key, maxLimit = 15, windowMs = 60000) {
    const now = Date.now();
    const timestamps = rateLimitBuckets.get(key) || [];
    const valid = timestamps.filter(t => now - t < windowMs);
    if (valid.length >= maxLimit) {
      rateLimitBuckets.set(key, valid);
      return true;
    }
    valid.push(now);
    rateLimitBuckets.set(key, valid);
    return false;
  }

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = parsedUrl.pathname;
    const method = req.method;

    // Read body
    let bodyText = '';
    for await (const chunk of req) {
      bodyText += chunk;
    }
    let body = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
        sanitizeObject(body);
      } catch {
        body = { raw: bodyText };
      }
    }

    const sendJson = (status, data, setCookieHeader = null) => {
      const headers = { 'Content-Type': 'application/json' };
      if (setCookieHeader) {
        headers['Set-Cookie'] = setCookieHeader;
      }
      res.writeHead(status, headers);
      res.end(JSON.stringify(data));
    };

    const clientIp = req.socket.remoteAddress || '127.0.0.1';

    // ----------------------------------------------------
    // Frontend SPA Routes Simulation
    // ----------------------------------------------------
    if (!path.startsWith('/api')) {
      if (path === '/' || path.startsWith('/events') || path.startsWith('/checkout') || path.startsWith('/admin') || path.startsWith('/login') || path.startsWith('/register')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><title>Ticketflow</title></head><body><div id="root">SPA Route: ${path}</div></body></html>`);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // ----------------------------------------------------
    // Auth Routes
    // ----------------------------------------------------
    if (path === '/api/auth/register' && method === 'POST') {
      if (isRateLimited(`auth_${clientIp}`, 20)) {
        return sendJson(429, { error: 'Too Many Requests' });
      }
      const { name, email, password, role = 'ATTENDEE' } = body;
      if (!email || !password || !name) {
        return sendJson(400, { error: 'Missing required registration fields' });
      }
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) {
          return sendJson(409, { error: 'Email already registered' });
        }
      }
      const newUser = {
        id: nextUserId++,
        name,
        email: email.toLowerCase(),
        password, // In real backend bcrypt is used
        role: role.toUpperCase(),
        account_id: nextUserId * 10,
        is_active: true,
      };
      users.set(newUser.id, newUser);
      const tokenPayload = { id: newUser.id, email: newUser.email, role: newUser.role, account_id: newUser.account_id };
      const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
      const refreshToken = Buffer.from(JSON.stringify({ id: newUser.id, type: 'refresh' })).toString('base64');

      return sendJson(201, {
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
        token,
      }, `refreshToken=${refreshToken}; HttpOnly; Path=/api/auth; SameSite=Lax`);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      if (isRateLimited(`auth_${clientIp}`, 15)) {
        return sendJson(429, { error: 'Too Many Requests' });
      }
      const { email, password } = body;
      if (!email || !password) {
        return sendJson(400, { error: 'Email and password required' });
      }
      let foundUser = null;
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) {
          foundUser = u;
          break;
        }
      }
      if (!foundUser || foundUser.password !== password) {
        return sendJson(401, { error: 'Invalid credentials' });
      }
      if (foundUser.is_active === false) {
        return sendJson(403, { error: 'Account suspended' });
      }

      const tokenPayload = { id: foundUser.id, email: foundUser.email, role: foundUser.role, account_id: foundUser.account_id };
      const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
      const refreshToken = Buffer.from(JSON.stringify({ id: foundUser.id, type: 'refresh' })).toString('base64');

      return sendJson(200, {
        user: { id: foundUser.id, name: foundUser.name, email: foundUser.email, role: foundUser.role },
        token,
      }, `refreshToken=${refreshToken}; HttpOnly; Path=/api/auth; SameSite=Lax`);
    }

    if (path === '/api/auth/refresh' && method === 'POST') {
      const cookies = parseCookies(req);
      const refreshToken = cookies['refreshToken'];
      if (!refreshToken) {
        return sendJson(401, { error: 'Missing refresh token cookie' });
      }
      try {
        const decoded = JSON.parse(Buffer.from(refreshToken, 'base64').toString('utf8'));
        const user = users.get(decoded.id);
        if (!user || user.is_active === false) {
          return sendJson(401, { error: 'Invalid refresh token' });
        }
        const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id };
        const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
        return sendJson(200, { token });
      } catch {
        return sendJson(401, { error: 'Malformed refresh token' });
      }
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = getUserFromAuthHeader(req);
      if (!user) {
        return sendJson(401, { error: 'Unauthorized' });
      }
      return sendJson(200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return sendJson(200, { message: 'Logged out successfully' }, 'refreshToken=; HttpOnly; Path=/api/auth; Max-Age=0');
    }

    // ----------------------------------------------------
    // Admin Routes
    // ----------------------------------------------------
    if (path.startsWith('/api/admin')) {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      if (user.role !== 'ADMIN') return sendJson(403, { error: 'Forbidden: Admin access required' });

      if (path === '/api/admin/stats' && method === 'GET') {
        return sendJson(200, {
          total_users: users.size,
          total_events: events.size,
          total_orders: orders.size,
          gross_sales: 125000,
        });
      }

      const suspendMatch = path.match(/^\/api\/admin\/users\/(\d+)\/suspend$/);
      if (suspendMatch && method === 'POST') {
        const targetId = parseInt(suspendMatch[1], 10);
        const targetUser = users.get(targetId);
        if (!targetUser) return sendJson(404, { error: 'User not found' });
        targetUser.is_active = false;
        return sendJson(200, { message: 'User suspended successfully', user: { id: targetUser.id, is_active: false } });
      }
    }

    // ----------------------------------------------------
    // Events Routes
    // ----------------------------------------------------
    if (path === '/api/events' && method === 'GET') {
      const list = [];
      for (const ev of events.values()) {
        const tiers = [];
        for (const t of ticketTiers.values()) {
          if (t.event_id === ev.id && !t.is_hidden) {
            tiers.push(t);
          }
        }
        list.push({ ...ev, ticket_tiers: tiers });
      }
      return sendJson(200, { events: list });
    }

    const singleEventMatch = path.match(/^\/api\/events\/(\d+)$/);
    if (singleEventMatch && method === 'GET') {
      const evId = parseInt(singleEventMatch[1], 10);
      const ev = events.get(evId);
      if (!ev) return sendJson(404, { error: 'Event not found' });

      // Eliminates N+1: aggregate ticket tiers into event JSON
      const tiers = [];
      for (const t of ticketTiers.values()) {
        if (t.event_id === ev.id) {
          tiers.push(t);
        }
      }
      return sendJson(200, { event: { ...ev, ticket_tiers: tiers } });
    }

    if (path === '/api/events' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') {
        return sendJson(403, { error: 'Forbidden: Organizer or Admin role required' });
      }
      const { title, description, starts_at, ends_at, status = 'LIVE' } = body;
      if (!title) return sendJson(400, { error: 'Event title is required' });

      const newEvent = {
        id: nextEventId++,
        account_id: user.account_id,
        title: sanitizeString(title),
        description: sanitizeString(description || ''),
        status,
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || new Date(Date.now() + 86400000).toISOString(),
      };
      events.set(newEvent.id, newEvent);
      return sendJson(201, { event: newEvent });
    }

    if (singleEventMatch && method === 'PUT') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      const evId = parseInt(singleEventMatch[1], 10);
      const ev = events.get(evId);
      if (!ev) return sendJson(404, { error: 'Event not found' });
      if (user.role !== 'ADMIN' && ev.account_id !== user.account_id) {
        return sendJson(403, { error: 'Forbidden: Event does not belong to user account' });
      }

      if (body.title) ev.title = sanitizeString(body.title);
      if (body.description) ev.description = sanitizeString(body.description);
      if (body.status) ev.status = body.status;
      return sendJson(200, { event: ev });
    }

    if (singleEventMatch && method === 'DELETE') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      const evId = parseInt(singleEventMatch[1], 10);
      const ev = events.get(evId);
      if (!ev) return sendJson(404, { error: 'Event not found' });
      if (user.role !== 'ADMIN' && ev.account_id !== user.account_id) {
        return sendJson(403, { error: 'Forbidden: Event does not belong to user account' });
      }
      events.delete(evId);
      return sendJson(200, { message: 'Event deleted' });
    }

    // ----------------------------------------------------
    // Ticket Tiers Routes
    // ----------------------------------------------------
    const tiersMatch = path.match(/^\/api\/events\/(\d+)\/tiers$/);
    if (tiersMatch && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') return sendJson(403, { error: 'Forbidden' });

      const evId = parseInt(tiersMatch[1], 10);
      const ev = events.get(evId);
      if (!ev) return sendJson(404, { error: 'Event not found' });

      const { name, type = 'PAID', price = 0, total_quantity = 10, min_per_order = 1, max_per_order = 10, is_hidden = false } = body;
      if (!name) return sendJson(400, { error: 'Tier name is required' });
      if (price < 0) return sendJson(400, { error: 'Price cannot be negative' });
      if (total_quantity <= 0) return sendJson(400, { error: 'Total quantity must be greater than zero' });
      if (min_per_order > max_per_order) return sendJson(400, { error: 'min_per_order cannot exceed max_per_order' });

      const tier = {
        id: nextTierId++,
        event_id: evId,
        name: sanitizeString(name),
        type,
        price: type === 'FREE' ? 0 : price,
        total_quantity,
        remaining_quantity: total_quantity,
        min_per_order,
        max_per_order,
        is_hidden,
      };
      ticketTiers.set(tier.id, tier);
      return sendJson(201, { tier });
    }

    if (tiersMatch && method === 'GET') {
      const evId = parseInt(tiersMatch[1], 10);
      const tiers = [];
      for (const t of ticketTiers.values()) {
        if (t.event_id === evId) tiers.push(t);
      }
      return sendJson(200, { tiers });
    }

    // ----------------------------------------------------
    // Promo Codes Routes
    // ----------------------------------------------------
    const promosMatch = path.match(/^\/api\/events\/(\d+)\/promos$/);
    if (promosMatch && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') return sendJson(403, { error: 'Forbidden' });

      const evId = parseInt(promosMatch[1], 10);
      const { code, discount_type = 'PERCENTAGE', discount_amount = 10, max_uses = 100, ticket_tier_id } = body;
      if (!code) return sendJson(400, { error: 'Code is required' });
      if (discount_amount <= 0 || (discount_type === 'PERCENTAGE' && discount_amount > 100)) {
        return sendJson(400, { error: 'Invalid discount amount' });
      }

      const promo = {
        id: nextPromoId++,
        event_id: evId,
        code: stripHtmlTags(code).toUpperCase().trim(),
        discount_type,
        discount_amount,
        max_uses,
        used_count: 0,
        ticket_tier_id: ticket_tier_id || null,
        is_active: true,
      };
      promos.set(promo.id, promo);
      return sendJson(201, { promo });
    }

    const validatePromoMatch = path.match(/^\/api\/events\/(\d+)\/promos\/validate$/);
    if (validatePromoMatch && method === 'POST') {
      const evId = parseInt(validatePromoMatch[1], 10);
      const { code, subtotal = 0 } = body;
      if (!code) return sendJson(400, { error: 'Code is required' });

      let found = null;
      for (const p of promos.values()) {
        if (p.event_id === evId && p.code === code.toUpperCase().trim() && p.is_active) {
          found = p;
          break;
        }
      }

      if (!found) return sendJson(404, { error: 'Invalid or inactive promo code' });
      if (found.used_count >= found.max_uses) {
        return sendJson(422, { error: 'Promo code usage limit reached' });
      }

      // Calculate discount in minor units using integer division
      let discount = 0;
      if (found.discount_type === 'PERCENTAGE') {
        discount = Math.floor((subtotal * found.discount_amount) / 100);
      } else {
        discount = Math.min(subtotal, found.discount_amount);
      }

      return sendJson(200, {
        valid: true,
        promo: found,
        discount,
        new_total: Math.max(0, subtotal - discount),
      });
    }

    // ----------------------------------------------------
    // Concurrency & Order Reservation Routes
    // Atomic ticket decrement prevents race conditions
    // ----------------------------------------------------
    const reserveMatch = path.match(/^\/api\/(?:public\/events\/(\d+)\/order|orders\/reserve)$/);
    if (reserveMatch && method === 'POST') {
      if (isRateLimited(`reserve_${clientIp}`, 25)) {
        return sendJson(429, { error: 'Too Many Requests: Rate limit exceeded on reservations' });
      }

      const { items = [], event_id: reqEventId, promo_code } = body;
      const evId = reserveMatch[1] ? parseInt(reserveMatch[1], 10) : reqEventId;

      if (!items || items.length === 0) {
        return sendJson(400, { error: 'Cart must contain at least one ticket item' });
      }

      // Validate quantities and check bounds
      for (const it of items) {
        if (!it.ticket_tier_id || typeof it.quantity !== 'number' || it.quantity <= 0) {
          return sendJson(400, { error: 'Invalid ticket tier ID or quantity <= 0' });
        }
        const tier = ticketTiers.get(it.ticket_tier_id);
        if (!tier) return sendJson(404, { error: `Ticket tier ${it.ticket_tier_id} not found` });
        if (it.quantity > tier.max_per_order) {
          return sendJson(400, { error: `Quantity ${it.quantity} exceeds maximum allowed of ${tier.max_per_order}` });
        }
        if (it.quantity < tier.min_per_order) {
          return sendJson(400, { error: `Quantity ${it.quantity} below minimum required of ${tier.min_per_order}` });
        }
      }

      // Atomic inventory check and decrement
      // Equivalent to: UPDATE ticket_tiers SET remaining_quantity = remaining_quantity - $1 WHERE id = $2 AND remaining_quantity >= $1
      const reservedItems = [];
      let subtotal = 0;
      let conflict = false;

      // Lock simulation
      for (const it of items) {
        const tier = ticketTiers.get(it.ticket_tier_id);
        if (tier.remaining_quantity < it.quantity) {
          conflict = true;
          break;
        }
      }

      if (conflict) {
        return sendJson(409, {
          error: 'InventoryExhaustedError',
          message: 'One or more ticket tiers are sold out or have insufficient quantity',
        });
      }

      // Atomic decrement
      for (const it of items) {
        const tier = ticketTiers.get(it.ticket_tier_id);
        tier.remaining_quantity -= it.quantity;
        const itemTotal = tier.price * it.quantity;
        subtotal += itemTotal;
        reservedItems.push({
          ticket_tier_id: tier.id,
          name: tier.name,
          quantity: it.quantity,
          unit_price: tier.price,
          total_price: itemTotal,
        });
      }

      // Calculate promo discount if provided
      let discount = 0;
      let appliedPromo = null;
      if (promo_code) {
        for (const p of promos.values()) {
          if (p.event_id === evId && p.code === promo_code.toUpperCase().trim() && p.is_active && p.used_count < p.max_uses) {
            appliedPromo = p;
            if (p.discount_type === 'PERCENTAGE') {
              discount = Math.floor((subtotal * p.discount_amount) / 100);
            } else {
              discount = Math.min(subtotal, p.discount_amount);
            }
            p.used_count += 1;
            break;
          }
        }
      }

      const total = Math.max(0, subtotal - discount);
      const user = getUserFromAuthHeader(req);
      const orderId = nextOrderId++;
      const orderShortId = `ORD-${1000 + orderId}`;

      const order = {
        id: orderId,
        orderShortId,
        event_id: evId,
        user_id: user ? user.id : null,
        items: reservedItems,
        subtotal,
        discount,
        total,
        promo_code: appliedPromo ? appliedPromo.code : null,
        status: 'RESERVED',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
      orders.set(order.id, order);

      return sendJson(201, {
        orderId: order.id,
        order_id: order.id,
        orderShortId: order.orderShortId,
        order,
        expires_at: order.expires_at,
        total: order.total,
        status: order.status,
      });
    }

    // ----------------------------------------------------
    // Order Finalization / Checkout
    // ----------------------------------------------------
    const checkoutMatch = path.match(/^\/api\/orders\/(\d+)\/(?:checkout|finalize)$/);
    if (checkoutMatch && method === 'POST') {
      const orderId = parseInt(checkoutMatch[1], 10);
      const order = orders.get(orderId);
      if (!order) return sendJson(404, { error: 'Order not found' });
      if (order.status !== 'RESERVED') {
        return sendJson(400, { error: `Cannot checkout order in ${order.status} state` });
      }

      const { buyer = {}, attendees: attendeeList = [], payment_method = 'OFFLINE', payment_intent_id } = body;
      if (!buyer.name || !buyer.email) {
        return sendJson(400, { error: 'Buyer name and email are required' });
      }

      order.buyer = {
        name: sanitizeString(buyer.name),
        email: buyer.email.toLowerCase().trim(),
      };
      order.payment_method = payment_method;
      order.payment_intent_id = payment_intent_id || null;

      // Assign attendees and generate barcodes
      const createdAttendees = [];
      for (const att of attendeeList) {
        const attendeeRecord = {
          id: nextAttendeeId++,
          order_id: order.id,
          event_id: order.event_id,
          name: sanitizeString(att.name || buyer.name),
          email: (att.email || buyer.email).toLowerCase().trim(),
          ticket_tier_id: att.ticket_tier_id || order.items[0].ticket_tier_id,
          barcode: `TKT-${order.id}-${nextAttendeeId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          status: 'ACTIVE',
        };
        attendees.set(attendeeRecord.id, attendeeRecord);
        createdAttendees.push(attendeeRecord);
      }

      order.attendees = createdAttendees;
      order.status = 'COMPLETED';
      return sendJson(200, { order, attendees: createdAttendees });
    }

    // ----------------------------------------------------
    // Order Retrieval & IDOR Defense
    // ----------------------------------------------------
    const singleOrderMatch = path.match(/^\/api\/orders\/(\d+)$/);
    if (singleOrderMatch && method === 'GET') {
      const orderId = parseInt(singleOrderMatch[1], 10);
      const order = orders.get(orderId);
      if (!order) return sendJson(404, { error: 'Order not found' });

      const user = getUserFromAuthHeader(req);
      // IDOR check: If order has an owner, user must match owner or be ADMIN
      if (order.user_id) {
        if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
          return sendJson(403, { error: 'Forbidden: You do not own this order' });
        }
      }

      return sendJson(200, { order });
    }

    // ----------------------------------------------------
    // Order Cancellation & Inventory Release (IDOR Protected)
    // ----------------------------------------------------
    const cancelOrderMatch = path.match(/^\/api\/orders\/(\d+)\/cancel$/);
    if (cancelOrderMatch && method === 'POST') {
      const orderId = parseInt(cancelOrderMatch[1], 10);
      const order = orders.get(orderId);
      if (!order) return sendJson(404, { error: 'Order not found' });

      const user = getUserFromAuthHeader(req);
      if (order.user_id) {
        if (!user || (user.id !== order.user_id && user.role !== 'ADMIN')) {
          return sendJson(403, { error: 'Forbidden: You do not own this order' });
        }
      }

      if (order.status === 'CANCELLED') {
        return sendJson(400, { error: 'Order already cancelled' });
      }

      // Restore inventory
      for (const item of order.items) {
        const tier = ticketTiers.get(item.ticket_tier_id);
        if (tier) {
          tier.remaining_quantity += item.quantity;
        }
      }

      // Restore promo code usage if used
      if (order.promo_code) {
        for (const p of promos.values()) {
          if (p.code === order.promo_code && p.used_count > 0) {
            p.used_count -= 1;
            break;
          }
        }
      }

      order.status = 'CANCELLED';
      return sendJson(200, { message: 'Order cancelled and inventory restored', order });
    }

    // ----------------------------------------------------
    // Attendee Check-in Routes
    // ----------------------------------------------------
    const checkinMatch = path.match(/^\/api\/events\/(\d+)\/attendees\/check-in$/);
    if (checkinMatch && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendJson(401, { error: 'Unauthorized' });
      if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') return sendJson(403, { error: 'Forbidden' });

      const evId = parseInt(checkinMatch[1], 10);
      const { barcode, attendee_id } = body;
      if (!barcode && !attendee_id) {
        return sendJson(400, { error: 'Barcode or attendee_id is required' });
      }

      let targetAttendee = null;
      for (const att of attendees.values()) {
        if (att.event_id === evId) {
          if ((barcode && att.barcode === barcode) || (attendee_id && att.id === attendee_id)) {
            targetAttendee = att;
            break;
          }
        }
      }

      if (!targetAttendee) {
        return sendJson(404, { error: 'Attendee ticket not found' });
      }

      if (targetAttendee.status === 'CHECKED_IN') {
        return sendJson(409, { error: 'AlreadyCheckedInError', message: 'Attendee has already been checked in' });
      }

      targetAttendee.status = 'CHECKED_IN';
      targetAttendee.checked_in_at = new Date().toISOString();
      return sendJson(200, {
        message: 'Attendee checked in successfully',
        attendee: targetAttendee,
      });
    }

    // Default 404
    return sendJson(404, { error: `Route ${method} ${path} not found` });
  });

  return {
    server,
    listen: (port = 0) => new Promise(resolve => {
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        resolve({
          port: addr.port,
          url: `http://127.0.0.1:${addr.port}/api`,
          close: () => new Promise(res => server.close(res)),
        });
      });
    }),
  };
}
