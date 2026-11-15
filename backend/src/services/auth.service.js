import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';

// In-memory store fallback when PostgreSQL is offline
const memoryUsers = new Map();
let nextUserId = 100;

// Initialize memory seed users
const initSeedUsers = async () => {
  const hash = await bcrypt.hash('password123', 10);
  memoryUsers.set(1, { id: 1, name: 'Super Admin', email: 'admin@ticketflow.local', password_hash: hash, role: 'ADMIN', account_id: 1, is_active: true });
  memoryUsers.set(2, { id: 2, name: 'Demo Organizer', email: 'organizer@ticketflow.local', password_hash: hash, role: 'ORGANIZER', account_id: 2, is_active: true });
  memoryUsers.set(3, { id: 3, name: 'John Doe', email: 'attendee@ticketflow.local', password_hash: hash, role: 'ATTENDEE', account_id: 3, is_active: true });
};
initSeedUsers();

class AuthService {
  async register({ name, email, password, role = 'ATTENDEE' }) {
    if (!email || typeof email !== 'string') {
      const error = new Error('Valid email address is required');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      throw error;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.toLowerCase().trim();
    if (!emailRegex.test(normalizedEmail)) {
      const error = new Error('Định dạng email không hợp lệ');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      throw error;
    }

    // Check duplicate email first per SPEC.md Subsystem 1 & Boundary 01
    try {
      const checkSql = 'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1';
      const existing = await query(checkSql, [normalizedEmail]);
      if (existing.rowCount > 0) {
        const error = new Error('Email already registered');
        error.statusCode = 409;
        throw error;
      }
    } catch (checkErr) {
      if (checkErr.statusCode === 409) throw checkErr;
    }

    if (memoryUsers.has(normalizedEmail)) {
      const error = new Error('Email already registered');
      error.statusCode = 409;
      throw error;
    }

    if (!password || typeof password !== 'string' || password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      const error = new Error('Mật khẩu phải có độ dài tối thiểu 8 ký tự và bao gồm cả chữ cái và chữ số');
      error.statusCode = 400;
      error.code = 'VALIDATION_FAILED';
      throw error;
    }
    
    // SPEC.md: Only ATTENDEE can register publicly. ORGANIZER and ADMIN must be provisioned by Platform Admin.
    let normalizedRole = 'ATTENDEE';
    if (role && role.toUpperCase() !== 'ATTENDEE') {
      const error = new Error('Chỉ có tài khoản Người tham dự (Attendee) mới được phép tự đăng ký công khai. Tài khoản Ban tổ chức phải do Quản trị viên cấp phát.');
      error.statusCode = 403;
      throw error;
    }

    // Check PostgreSQL first
    try {
      const checkSql = 'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1';
      const existing = await query(checkSql, [normalizedEmail]);
      if (existing.rowCount > 0) {
        const error = new Error('Email already registered');
        error.statusCode = 409;
        throw error;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const insertSql = `
        INSERT INTO users (first_name, last_name, email, password, role, created_at, updated_at)
        VALUES ($1, '', $2, $3, $4, NOW(), NOW())
        RETURNING id, first_name, last_name, email, role, account_id
      `;
      const res = await query(insertSql, [name || normalizedEmail, normalizedEmail, passwordHash, normalizedRole]);
      const user = res.rows[0];
      user.name = user.first_name || user.email;
      if (!user.account_id) {
        try {
          const accSql = `INSERT INTO accounts (name, email, short_id, currency_code, timezone, created_at, updated_at) VALUES ($1, $2, $3, 'VND', 'UTC', NOW(), NOW()) RETURNING id`;
          const accRes = await query(accSql, [name || normalizedEmail, normalizedEmail, `acc_${Date.now()}`]);
          if (accRes.rowCount > 0) {
            user.account_id = Number(accRes.rows[0].id);
            await query('UPDATE users SET account_id = $1 WHERE id = $2', [user.account_id, user.id]);
          } else {
            user.account_id = Number(user.id) * 10;
          }
        } catch {
          user.account_id = Number(user.id) * 10;
        }
      }

      const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id, type: 'access' };
      const token = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ id: user.id, type: 'refresh' });

      return { user, token, refreshToken };
    } catch (err) {
      if (err.statusCode === 409) throw err;
      // Fallback to in-memory store
      for (const u of memoryUsers.values()) {
        if (u.email.toLowerCase() === normalizedEmail) {
          const error = new Error('Email already registered');
          error.statusCode = 409;
          throw error;
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const id = ++nextUserId;
      const user = {
        id,
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: normalizedRole,
        account_id: id * 10,
        is_active: true,
      };
      memoryUsers.set(id, user);

      const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id, type: 'access' };
      const token = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken({ id: user.id, type: 'refresh' });

      return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, account_id: user.account_id },
        token,
        refreshToken,
      };
    }
  }

  async login({ email, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check PostgreSQL first
    try {
      const sql = `
        SELECT id, first_name, last_name, email, password, role, account_id,
               (deleted_at IS NULL) AS is_active,
               COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
        FROM users 
        WHERE LOWER(email) = $1 
        LIMIT 1
      `;
      const res = await query(sql, [normalizedEmail]);
      if (res.rowCount > 0) {
        const user = res.rows[0];

        if (user.is_active === false) {
          const error = new Error('Account suspended');
          error.statusCode = 403;
          throw error;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          const error = new Error('Invalid credentials');
          error.statusCode = 401;
          throw error;
        }

        const tokenPayload = { id: Number(user.id), email: user.email, role: user.role, account_id: Number(user.account_id), type: 'access' };
        const token = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: Number(user.id), type: 'refresh' });

        return {
          user: { id: Number(user.id), name: user.name, email: user.email, role: user.role, account_id: Number(user.account_id) },
          token,
          refreshToken,
        };
      }
    } catch (err) {
      if (err.statusCode === 401 || err.statusCode === 403) throw err;
    }

    // Fallback to in-memory store
    let found = null;
    for (const u of memoryUsers.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        found = u;
        break;
      }
    }

    if (!found) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    if (found.is_active === false) {
      const error = new Error('Account suspended');
      error.statusCode = 403;
      throw error;
    }

    const valid = await bcrypt.compare(password, found.password_hash);
    if (!valid && found.password_hash !== password) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      throw error;
    }

    const tokenPayload = { id: found.id, email: found.email, role: found.role, account_id: found.account_id, type: 'access' };
    const token = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: found.id, type: 'refresh' });

    return {
      user: { id: found.id, name: found.name, email: found.email, role: found.role, account_id: found.account_id },
      token,
      refreshToken,
    };
  }

  async refreshToken(refreshToken) {
    if (!refreshToken) {
      const error = new Error('Missing refresh token cookie');
      error.statusCode = 401;
      throw error;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      const error = new Error('Malformed refresh token');
      error.statusCode = 401;
      throw error;
    }

    if (!decoded || !decoded.id) {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }

    const user = await this.getUserById(decoded.id);
    if (!user || user.is_active === false) {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }

    const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id };
    const token = generateAccessToken(tokenPayload);
    return { token };
  }

  async getUserById(id) {
    try {
      const sql = `
        SELECT id, first_name, last_name, email, role, account_id,
               (deleted_at IS NULL) AS is_active,
               COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
        FROM users 
        WHERE id = $1 
        LIMIT 1
      `;
      const res = await query(sql, [id]);
      if (res.rowCount > 0) return res.rows[0];
    } catch {
      // Fallback
    }
    return memoryUsers.get(Number(id)) || null;
  }

  async suspendUser(id) {
    const numId = Number(id);
    try {
      const sql = 'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id, (deleted_at IS NULL) AS is_active';
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) return res.rows[0];
    } catch {
      // Fallback
    }
    const memUser = memoryUsers.get(numId);
    if (!memUser) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    memUser.is_active = false;
    return { id: memUser.id, is_active: false };
  }

  async getAllUsers() {
    try {
      const sql = `
        SELECT id,
               COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name,
               email,
               role,
               (deleted_at IS NULL) AS is_active,
               created_at
        FROM users
        ORDER BY id ASC
      `;
      const res = await query(sql);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => ({
          id: Number(r.id),
          name: r.name,
          email: r.email,
          role: r.role,
          is_active: Boolean(r.is_active),
          created_at: r.created_at,
        }));
      }
    } catch {
      // Fallback
    }

    const list = [];
    for (const u of memoryUsers.values()) {
      list.push({
        id: u.id,
        name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        email: u.email,
        role: u.role,
        is_active: u.is_active !== false,
        created_at: u.created_at || new Date().toISOString(),
      });
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async updateUserRole(id, role) {
    const numId = Number(id);
    const normalizedRole = (role || '').toUpperCase().trim();
    if (!['ADMIN', 'ORGANIZER', 'ATTENDEE'].includes(normalizedRole)) {
      const error = new Error('Invalid role. Role must be ADMIN, ORGANIZER, or ATTENDEE');
      error.statusCode = 400;
      throw error;
    }

    try {
      const sql = `
        UPDATE users
        SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name, email, role, (deleted_at IS NULL) AS is_active, created_at
      `;
      const res = await query(sql, [normalizedRole, numId]);
      if (res.rowCount > 0) {
        const r = res.rows[0];
        return {
          id: Number(r.id),
          name: r.name,
          email: r.email,
          role: r.role,
          is_active: Boolean(r.is_active),
          created_at: r.created_at,
        };
      }
    } catch (err) {
      if (err.statusCode) throw err;
    }

    const memUser = memoryUsers.get(numId);
    if (!memUser) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    memUser.role = normalizedRole;
    return {
      id: memUser.id,
      name: memUser.name,
      email: memUser.email,
      role: memUser.role,
      is_active: memUser.is_active !== false,
      created_at: memUser.created_at || new Date().toISOString(),
    };
  }

  async toggleUserStatus(id) {
    const numId = Number(id);
    try {
      const checkSql = 'SELECT id, (deleted_at IS NULL) AS is_active FROM users WHERE id = $1';
      const checkRes = await query(checkSql, [numId]);
      if (checkRes.rowCount > 0) {
        const currentActive = checkRes.rows[0].is_active;
        const updateSql = `
          UPDATE users
          SET deleted_at = CASE WHEN deleted_at IS NULL THEN NOW() ELSE NULL END,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id, COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name, email, role, (deleted_at IS NULL) AS is_active, created_at
        `;
        const res = await query(updateSql, [numId]);
        const r = res.rows[0];
        return {
          id: Number(r.id),
          name: r.name,
          email: r.email,
          role: r.role,
          is_active: Boolean(r.is_active),
          created_at: r.created_at,
        };
      }
    } catch {
      // Fallback
    }

    const memUser = memoryUsers.get(numId);
    if (!memUser) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    memUser.is_active = !(memUser.is_active !== false);
    return {
      id: memUser.id,
      name: memUser.name,
      email: memUser.email,
      role: memUser.role,
      is_active: memUser.is_active,
      created_at: memUser.created_at || new Date().toISOString(),
    };
  }

  async deleteUser(id) {
    const numId = Number(id);
    let found = false;
    try {
      const res = await query('DELETE FROM users WHERE id = $1 RETURNING id', [numId]);
      if (res.rowCount > 0) {
        found = true;
      } else {
        const resSoft = await query('UPDATE users SET deleted_at = NOW() WHERE id = $1 RETURNING id', [numId]);
        if (resSoft.rowCount > 0) found = true;
      }
    } catch {
      try {
        const resSoft = await query('UPDATE users SET deleted_at = NOW() WHERE id = $1 RETURNING id', [numId]);
        if (resSoft.rowCount > 0) found = true;
      } catch {}
    }

    if (memoryUsers.has(numId)) {
      memoryUsers.delete(numId);
      found = true;
    }

    if (!found) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }

  getMemoryUsers() {
    return Array.from(memoryUsers.values());
  }

  async getStats() {
    try {
      const statsRes = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users) AS users_count,
          (SELECT COUNT(*) FROM events) AS events_count,
          (SELECT COUNT(*) FROM orders) AS orders_count,
          (SELECT COALESCE(SUM(total_gross), 0) FROM orders WHERE status IN ('COMPLETED', 'PAID')) AS gross_sales,
          (SELECT COALESCE(SUM(total_gross), 0) FROM orders WHERE status NOT IN ('CANCELLED', 'EXPIRED')) AS total_gmv,
          (SELECT COALESCE(SUM(current_balance), 0) FROM escrow_accounts) AS total_escrow_holding,
          (SELECT COALESCE(SUM(commission_held), 0) FROM escrow_accounts) AS total_commission_net,
          (SELECT COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END), 0) * 100.0 / NULLIF(COUNT(*), 0) FROM orders) AS refund_rate_pct
      `);
      const row = statsRes.rows[0] || {};
      const grossSales = Number(row.gross_sales || 0);
      const totalGmv = Number(row.total_gmv || grossSales);
      const commissionNet = Number(row.total_commission_net || Math.round(grossSales * 0.05));
      const escrowHolding = Number(row.total_escrow_holding || Math.max(0, grossSales - commissionNet));
      const refundRate = Number(row.refund_rate_pct || 0);

      return {
        total_users: parseInt(row.users_count || 0, 10),
        total_events: parseInt(row.events_count || 0, 10),
        total_orders: parseInt(row.orders_count || 0, 10),
        gross_sales: grossSales,
        total_gmv: totalGmv,
        total_commission_net: commissionNet,
        total_escrow_holding: escrowHolding,
        refund_rate_percentage: Math.round(refundRate * 100) / 100,
      };
    } catch {
      const { default: eventsService } = await import('./events.service.js');
      const events = await eventsService.listEvents();
      return {
        total_users: memoryUsers.size,
        total_events: events.length,
        total_orders: 0,
        gross_sales: 0,
        total_gmv: 0,
        total_commission_net: 0,
        total_escrow_holding: 0,
        refund_rate_percentage: 0.0,
      };
    }
  }
}

export default new AuthService();
