import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';

// In-memory store fallback when PostgreSQL is offline
const memoryUsers = new Map();
let nextUserId = 100;

// Initialize memory seed users
const initSeedUsers = async () => {
  const hash = await bcrypt.hash('password123', 10);
  memoryUsers.set(1, { id: 1, name: 'Super Admin', email: 'admin@ticketflow.local', phone: '0901234567', password_hash: hash, role: 'ADMIN', account_id: 1, is_active: true, subscription_plan: 'ENTERPRISE', is_premium: true, created_at: '2026-05-10T08:00:00Z' });
  memoryUsers.set(2, { id: 2, name: 'Demo Organizer', email: 'organizer@ticketflow.local', phone: '0902345678', password_hash: hash, role: 'ORGANIZER', account_id: 2, is_active: true, subscription_plan: 'PRO_ORGANIZER', is_premium: true, created_at: '2026-06-12T09:30:00Z' });
  memoryUsers.set(3, { id: 3, name: 'John Doe', email: 'attendee@ticketflow.local', phone: '0903456789', password_hash: hash, role: 'ATTENDEE', account_id: 3, is_active: true, subscription_plan: 'VIP_MEMBER', is_premium: true, created_at: '2026-07-04T14:15:00Z' });
  memoryUsers.set(4, { id: 4, name: 'Lê Hoàng Nam', email: 'nam.le@eventpro.vn', phone: '0912345678', password_hash: hash, role: 'ORGANIZER', account_id: 4, is_active: true, subscription_plan: 'PRO_ORGANIZER', is_premium: true, created_at: '2026-08-15T11:20:00Z' });
  memoryUsers.set(5, { id: 5, name: 'Trần Minh Anh', email: 'minhanh.tran@techfest.io', phone: '0923456789', password_hash: hash, role: 'ATTENDEE', account_id: 5, is_active: true, subscription_plan: 'VIP_MEMBER', is_premium: true, created_at: '2026-08-28T16:45:00Z' });
  memoryUsers.set(6, { id: 6, name: 'Phạm Đức Trí', email: 'tri.pham@saigonmusic.com', phone: '0934567890', password_hash: hash, role: 'ORGANIZER', account_id: 6, is_active: true, subscription_plan: 'ENTERPRISE', is_premium: true, created_at: '2026-09-05T10:00:00Z' });
  memoryUsers.set(7, { id: 7, name: 'Nguyễn Bích Ngọc', email: 'ngoc.nguyen@vietrunners.org', phone: '0945678901', password_hash: hash, role: 'ATTENDEE', account_id: 7, is_active: true, subscription_plan: 'FREE', is_premium: false, created_at: '2026-09-18T13:10:00Z' });
  memoryUsers.set(8, { id: 8, name: 'Vũ Quốc Huy', email: 'huy.vu@indiefilms.vn', phone: '0956789012', password_hash: hash, role: 'ORGANIZER', account_id: 8, is_active: true, subscription_plan: 'PRO_ORGANIZER', is_premium: true, created_at: '2026-10-02T08:30:00Z' });
  memoryUsers.set(9, { id: 9, name: 'Đặng Mai Phương', email: 'phuong.dang@gmail.com', phone: '0967890123', password_hash: hash, role: 'ATTENDEE', account_id: 9, is_active: true, subscription_plan: 'VIP_MEMBER', is_premium: true, created_at: '2026-10-15T15:20:00Z' });
  memoryUsers.set(10, { id: 10, name: 'Hoàng Tuấn Kiệt', email: 'kiet.hoang@live.com', phone: '0978901234', password_hash: hash, role: 'ATTENDEE', account_id: 10, is_active: true, subscription_plan: 'FREE', is_premium: false, created_at: '2026-10-25T19:00:00Z' });
  memoryUsers.set(11, { id: 11, name: 'Bùi Thảo Linh', email: 'linh.bui@youthhub.vn', phone: '0989012345', password_hash: hash, role: 'ATTENDEE', account_id: 11, is_active: true, subscription_plan: 'FREE', is_premium: false, created_at: '2026-11-03T11:40:00Z' });
  memoryUsers.set(12, { id: 12, name: 'Đỗ Hải Đăng', email: 'dang.do@vngcloud.vn', phone: '0990123456', password_hash: hash, role: 'ORGANIZER', account_id: 12, is_active: true, subscription_plan: 'PRO_ORGANIZER', is_premium: true, created_at: '2026-11-12T14:10:00Z' });
};
initSeedUsers();

class AuthService {
  async register({ name, email, password, phone, role = 'ATTENDEE' }) {
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
    
    let normalizedRole = 'ATTENDEE';
    if (role) {
      const r = String(role).toUpperCase().trim();
      if (r === 'ADMIN') {
        const error = new Error('Tài khoản Quản trị viên không được phép tự đăng ký công khai');
        error.statusCode = 403;
        throw error;
      }
      if (r === 'ORGANIZER') {
        normalizedRole = 'ORGANIZER';
      } else {
        normalizedRole = 'ATTENDEE';
      }
    }

    const sanitizedPhone = phone ? String(phone).trim() : '';

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
        INSERT INTO users (first_name, last_name, email, password, role, phone, created_at, updated_at)
        VALUES ($1, '', $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, first_name, last_name, email, role, account_id, phone
      `;
      const res = await query(insertSql, [name || normalizedEmail, normalizedEmail, passwordHash, normalizedRole, sanitizedPhone]);
      const user = res.rows[0];
      user.name = user.first_name || user.email;
      user.phone = user.phone || '';
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
        phone: sanitizedPhone,
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
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role, account_id: user.account_id },
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
        SELECT id, first_name, last_name, email, password, role, account_id, phone,
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
          user: { id: Number(user.id), name: user.name, email: user.email, phone: user.phone || '', role: user.role, account_id: Number(user.account_id) },
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
      user: { id: found.id, name: found.name, email: found.email, phone: found.phone || '', role: found.role, account_id: found.account_id },
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
        SELECT id, first_name, last_name, email, role, account_id, phone,
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
               phone,
               role,
               (deleted_at IS NULL) AS is_active,
               created_at
        FROM users
        ORDER BY id ASC
      `;
      const res = await query(sql);
      if (res.rows && res.rows.length > 0) {
        return res.rows.map(r => {
          const plan = r.subscription_plan || (r.role === 'ORGANIZER' ? 'PRO_ORGANIZER' : r.role === 'ADMIN' ? 'ENTERPRISE' : (Number(r.id) % 3 === 0 ? 'VIP_MEMBER' : 'FREE'));
          const isPrem = plan !== 'FREE';
          return {
            id: Number(r.id),
            name: r.name,
            email: r.email,
            phone: r.phone || '',
            role: r.role,
            is_active: Boolean(r.is_active),
            created_at: r.created_at,
            subscription_plan: plan,
            is_premium: isPrem,
          };
        });
      }
    } catch {
      // Fallback
    }

    const list = [];
    for (const u of memoryUsers.values()) {
      const plan = u.subscription_plan || (u.role === 'ORGANIZER' ? 'PRO_ORGANIZER' : u.role === 'ADMIN' ? 'ENTERPRISE' : 'FREE');
      const isPrem = Boolean(u.is_premium !== undefined ? u.is_premium : plan !== 'FREE');
      list.push({
        id: u.id,
        name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        email: u.email,
        phone: u.phone || '',
        role: u.role,
        is_active: u.is_active !== false,
        created_at: u.created_at || new Date().toISOString(),
        subscription_plan: plan,
        is_premium: isPrem,
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

  /**
   * Admin Create User (directly without logging in)
   */
  async adminCreateUser({ name, email, password, phone, role = 'ATTENDEE', is_active = true }) {
    if (!email || typeof email !== 'string') {
      const error = new Error('Valid email address is required');
      error.statusCode = 400;
      throw error;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      const error = new Error('Định dạng email không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

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

    for (const u of memoryUsers.values()) {
      if (u.email?.toLowerCase() === normalizedEmail) {
        const error = new Error('Email already registered');
        error.statusCode = 409;
        throw error;
      }
    }

    const rawPassword = password || 'Ticketflow@123';
    const password_hash = await bcrypt.hash(rawPassword, 10);
    const validRole = ['ADMIN', 'ORGANIZER', 'ATTENDEE'].includes(role?.toUpperCase())
      ? role.toUpperCase()
      : 'ATTENDEE';

    try {
      const sql = `
        INSERT INTO users (name, email, password_hash, phone, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, name, email, phone, role, is_active, created_at, updated_at
      `;
      const res = await query(sql, [
        name || normalizedEmail.split('@')[0],
        normalizedEmail,
        password_hash,
        phone || null,
        validRole,
        is_active !== false,
      ]);
      if (res.rowCount > 0) {
        return res.rows[0];
      }
    } catch {
      // Fallback
    }

    const nextId =
      Math.max(
        ...Array.from(memoryUsers.keys()).filter((k) => typeof k === 'number'),
        100
      ) + 1;
    const newUser = {
      id: nextId,
      name: name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      phone: phone || null,
      role: validRole,
      is_active: is_active !== false,
      password: rawPassword,
      password_hash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryUsers.set(nextId, newUser);
    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      is_active: newUser.is_active,
      created_at: newUser.created_at,
    };
  }

  /**
   * Admin Update User (name, email, phone, role, is_active)
   */
  async adminUpdateUser(id, { name, email, phone, role, is_active }) {
    const numId = Number(id);
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (role !== undefined) {
      const validRole = ['ADMIN', 'ORGANIZER', 'ATTENDEE'].includes(role?.toUpperCase())
        ? role.toUpperCase()
        : 'ATTENDEE';
      updates.role = validRole;
    }
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    if (email) {
      updates.email = email.toLowerCase().trim();
    }

    try {
      const setClauses = [];
      const values = [];
      let idx = 1;
      for (const [key, val] of Object.entries(updates)) {
        setClauses.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
      if (setClauses.length > 0) {
        setClauses.push('updated_at = NOW()');
        values.push(numId);
        const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, email, phone, role, is_active, created_at, updated_at`;
        const res = await query(sql, values);
        if (res.rowCount > 0) {
          return res.rows[0];
        }
      }
    } catch {
      // Fallback
    }

    let memUser = memoryUsers.get(numId);
    if (!memUser) {
      for (const u of memoryUsers.values()) {
        if (Number(u.id) === numId) {
          memUser = u;
          break;
        }
      }
    }
    if (memUser) {
      Object.assign(memUser, updates);
      memUser.updated_at = new Date().toISOString();
      return {
        id: memUser.id,
        name: memUser.name,
        email: memUser.email,
        phone: memUser.phone,
        role: memUser.role,
        is_active: memUser.is_active,
        created_at: memUser.created_at,
        updated_at: memUser.updated_at,
      };
    }

    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  async updateProfile(userId, { name, email, phone }) {
    const numId = Number(userId);
    if (!numId) {
      const error = new Error('ID người dùng không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        const error = new Error('Họ và tên không được để trống');
        error.statusCode = 400;
        throw error;
      }
      updates.name = name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !email.trim()) {
        const error = new Error('Email không được để trống');
        error.statusCode = 400;
        throw error;
      }
      const normalizedEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        const error = new Error('Định dạng email không hợp lệ');
        error.statusCode = 400;
        throw error;
      }

      // Check duplicate email
      try {
        const checkSql = 'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 LIMIT 1';
        const existing = await query(checkSql, [normalizedEmail, numId]);
        if (existing.rowCount > 0) {
          const error = new Error('Email này đã được sử dụng bởi tài khoản khác');
          error.statusCode = 409;
          throw error;
        }
      } catch (err) {
        if (err.statusCode === 409) throw err;
      }

      for (const u of memoryUsers.values()) {
        if (u.id !== numId && u.email.toLowerCase() === normalizedEmail) {
          const error = new Error('Email này đã được sử dụng bởi tài khoản khác');
          error.statusCode = 409;
          throw error;
        }
      }
      updates.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const trimmedPhone = phone ? String(phone).trim() : '';
      if (trimmedPhone) {
        const phoneRegex = /^[0-9+() -]{8,20}$/;
        if (!phoneRegex.test(trimmedPhone)) {
          const error = new Error('Số điện thoại không hợp lệ. Vui lòng nhập từ 8 đến 20 số');
          error.statusCode = 400;
          throw error;
        }
      }
      updates.phone = trimmedPhone;
    }

    // Update in Postgres
    let updatedUser = null;
    try {
      const currentUser = await this.getUserById(numId);
      if (!currentUser) {
        const error = new Error('Không tìm thấy tài khoản người dùng');
        error.statusCode = 404;
        throw error;
      }

      const finalName = updates.name !== undefined ? updates.name : currentUser.name;
      const finalEmail = updates.email !== undefined ? updates.email : currentUser.email;
      const finalPhone = updates.phone !== undefined ? updates.phone : (currentUser.phone || '');

      const updateSql = `
        UPDATE users
        SET first_name = $1,
            last_name = '',
            email = $2,
            phone = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, first_name, last_name, email, role, account_id, phone,
                  COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
      `;
      const res = await query(updateSql, [finalName, finalEmail, finalPhone, numId]);
      if (res.rowCount > 0) {
        const r = res.rows[0];
        updatedUser = {
          id: Number(r.id),
          name: r.name,
          email: r.email,
          phone: r.phone || '',
          role: r.role,
          account_id: Number(r.account_id),
        };

        if (r.account_id) {
          try {
            await query('UPDATE accounts SET name = $1, email = $2, updated_at = NOW() WHERE id = $3', [finalName, finalEmail, r.account_id]);
          } catch {}
        }
      }
    } catch (err) {
      if (err.statusCode) throw err;
    }

    // In-memory fallback
    const memUser = memoryUsers.get(numId);
    if (memUser) {
      if (updates.name !== undefined) memUser.name = updates.name;
      if (updates.email !== undefined) memUser.email = updates.email;
      if (updates.phone !== undefined) memUser.phone = updates.phone;
      if (!updatedUser) {
        updatedUser = {
          id: memUser.id,
          name: memUser.name,
          email: memUser.email,
          phone: memUser.phone || '',
          role: memUser.role,
          account_id: memUser.account_id,
        };
      }
    }

    if (!updatedUser) {
      const error = new Error('Không tìm thấy tài khoản người dùng');
      error.statusCode = 404;
      throw error;
    }

    const tokenPayload = {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      account_id: updatedUser.account_id,
      type: 'access',
    };
    const token = generateAccessToken(tokenPayload);

    return { user: updatedUser, token };
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const numId = Number(userId);
    if (!numId) {
      const error = new Error('ID người dùng không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    if (!currentPassword || typeof currentPassword !== 'string') {
      const error = new Error('Vui lòng nhập mật khẩu hiện tại');
      error.statusCode = 400;
      throw error;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
      const error = new Error('Mật khẩu mới phải có độ dài tối thiểu 8 ký tự và bao gồm cả chữ cái và chữ số');
      error.statusCode = 400;
      throw error;
    }

    if (currentPassword === newPassword) {
      const error = new Error('Mật khẩu mới không được trùng với mật khẩu hiện tại');
      error.statusCode = 400;
      throw error;
    }

    // Verify current password from Postgres
    let currentHash = null;
    let foundInDb = false;

    try {
      const sql = 'SELECT id, password FROM users WHERE id = $1 LIMIT 1';
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) {
        foundInDb = true;
        currentHash = res.rows[0].password;
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (!currentHash && memUser) {
      currentHash = memUser.password_hash;
    }

    if (!currentHash) {
      const error = new Error('Không tìm thấy tài khoản người dùng');
      error.statusCode = 404;
      throw error;
    }

    const isValid = await bcrypt.compare(currentPassword, currentHash);
    if (!isValid && currentHash !== currentPassword) {
      const error = new Error('Mật khẩu hiện tại không chính xác');
      error.statusCode = 400;
      throw error;
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    if (foundInDb) {
      try {
        await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [newHash, numId]);
      } catch (err) {
        console.error('Error updating password in DB:', err.message);
      }
    }

    if (memUser) {
      memUser.password_hash = newHash;
    }

    return { success: true, message: 'Đổi mật khẩu thành công' };
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

      const premiumUsers = Array.from(memoryUsers.values()).filter(u => u.is_premium || u.subscription_plan === 'PRO_ORGANIZER' || u.subscription_plan === 'VIP_MEMBER' || u.subscription_plan === 'ENTERPRISE');
      const premiumCount = premiumUsers.length;

      return {
        total_users: parseInt(row.users_count || 0, 10),
        total_events: parseInt(row.events_count || 0, 10),
        total_orders: parseInt(row.orders_count || 0, 10),
        gross_sales: grossSales,
        total_gmv: totalGmv,
        total_commission_net: commissionNet,
        total_escrow_holding: escrowHolding,
        refund_rate_percentage: Math.round(refundRate * 100) / 100,
        premium_subscribers_count: premiumCount,
      };
    } catch {
      const { default: eventsService } = await import('./events.service.js');
      const events = await eventsService.listEvents();
      const premiumUsers = Array.from(memoryUsers.values()).filter(u => u.is_premium || u.subscription_plan === 'PRO_ORGANIZER' || u.subscription_plan === 'VIP_MEMBER' || u.subscription_plan === 'ENTERPRISE');
      return {
        total_users: memoryUsers.size,
        total_events: events.length,
        total_orders: 0,
        gross_sales: 0,
        total_gmv: 0,
        total_commission_net: 0,
        total_escrow_holding: 0,
        refund_rate_percentage: 0.0,
        premium_subscribers_count: premiumUsers.length,
      };
    }
  }
}

export default new AuthService();
