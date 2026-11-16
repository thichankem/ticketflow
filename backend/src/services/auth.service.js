import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';
import adminService, { memoryUsers } from './admin.service.js';

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

/**
 * Cohesive AuthService
 * Manages user registration (strictly ATTENDEE self-registration), login,
 * dual-token generation, user profile updates, and password changes.
 */
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

    // Strict Attendee-Only Public Self-Registration (Principle 6 & REQ-SEC-02)
    const normalizedRole = 'ATTENDEE';
    const sanitizedPhone = phone ? String(phone).trim() : '';

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
      for (const u of memoryUsers.values()) {
        if (u.email?.toLowerCase() === normalizedEmail) {
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

    try {
      const sql = `
        SELECT id, first_name, last_name, email, password, role, account_id, phone,
               COALESCE(is_suspended, false) AS is_suspended,
               deleted_at,
               (deleted_at IS NULL AND COALESCE(is_suspended, false) = false) AS is_active,
               COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
        FROM users 
        WHERE LOWER(email) = $1 
        LIMIT 1
      `;
      const res = await query(sql, [normalizedEmail]);
      if (res.rowCount > 0) {
        const user = res.rows[0];

        if (user.is_suspended || user.is_active === false || user.deleted_at) {
          const error = new Error('Tài khoản đã bị tạm ngưng hoặc khóa quyền truy cập');
          error.statusCode = 401;
          error.code = 'AUTH_TOKEN_INVALID';
          throw error;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          const error = new Error('Mật khẩu không chính xác');
          error.statusCode = 401;
          error.code = 'AUTH_TOKEN_INVALID';
          throw error;
        }

        const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id, type: 'access' };
        const token = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: user.id, type: 'refresh' });

        return {
          user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role, account_id: user.account_id },
          token,
          refreshToken,
        };
      }
    } catch (err) {
      if (err.statusCode === 401) throw err;
    }

    for (const u of memoryUsers.values()) {
      if (u.email.toLowerCase() === normalizedEmail) {
        if (u.is_suspended || u.is_active === false || u.status === 'SUSPENDED') {
          const error = new Error('Tài khoản đã bị tạm ngưng hoặc khóa quyền truy cập');
          error.statusCode = 401;
          error.code = 'AUTH_TOKEN_INVALID';
          throw error;
        }

        const valid = await bcrypt.compare(password, u.password_hash || u.password);
        if (!valid) {
          const error = new Error('Mật khẩu không chính xác');
          error.statusCode = 401;
          error.code = 'AUTH_TOKEN_INVALID';
          throw error;
        }

        const tokenPayload = { id: u.id, email: u.email, role: u.role, account_id: u.account_id, type: 'access' };
        const token = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: u.id, type: 'refresh' });

        return {
          user: { id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: u.role, account_id: u.account_id },
          token,
          refreshToken,
        };
      }
    }

    const error = new Error('Tài khoản không tồn tại trong hệ thống');
    error.statusCode = 401;
    error.code = 'AUTH_TOKEN_INVALID';
    throw error;
  }

  async refreshToken(token) {
    if (!token) {
      const error = new Error('Refresh token is required');
      error.statusCode = 401;
      error.code = 'AUTH_TOKEN_INVALID';
      throw error;
    }

    try {
      const decoded = verifyRefreshToken(token);
      const user = await this.getUserById(decoded.id);

      if (user.is_suspended || user.is_active === false) {
        const error = new Error('Tài khoản đã bị tạm ngưng');
        error.statusCode = 401;
        error.code = 'AUTH_TOKEN_INVALID';
        throw error;
      }

      const tokenPayload = { id: user.id, email: user.email, role: user.role, account_id: user.account_id, type: 'access' };
      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken({ id: user.id, type: 'refresh' });

      return {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user,
      };
    } catch {
      const error = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      error.code = 'AUTH_TOKEN_INVALID';
      throw error;
    }
  }

  async getUserById(id) {
    const numId = Number(id);

    try {
      const sql = `
        SELECT id, first_name, last_name, email, role, account_id, phone,
               COALESCE(is_suspended, false) AS is_suspended,
               (deleted_at IS NULL AND COALESCE(is_suspended, false) = false) AS is_active,
               COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
        FROM users 
        WHERE id = $1 
        LIMIT 1
      `;
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        return {
          id: Number(u.id),
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: u.role,
          account_id: u.account_id ? Number(u.account_id) : null,
          is_suspended: Boolean(u.is_suspended),
          is_active: Boolean(u.is_active),
        };
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      return {
        id: memUser.id,
        name: memUser.name,
        email: memUser.email,
        phone: memUser.phone || '',
        role: memUser.role,
        account_id: memUser.account_id,
        is_suspended: Boolean(memUser.is_suspended),
        is_active: memUser.is_active !== false,
      };
    }

    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  async updateProfile(userId, { name, email, phone }) {
    const numId = Number(userId);
    if (!name && !email && phone === undefined) {
      const err = new Error('At least one field (name, email, phone) is required to update profile');
      err.statusCode = 400;
      throw err;
    }

    let normalizedEmail = undefined;
    if (email) {
      normalizedEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        const err = new Error('Định dạng email không hợp lệ');
        err.statusCode = 400;
        throw err;
      }
      try {
        const checkSql = 'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 LIMIT 1';
        const existing = await query(checkSql, [normalizedEmail, numId]);
        if (existing.rowCount > 0) {
          const err = new Error('Email đã được sử dụng bởi tài khoản khác');
          err.statusCode = 409;
          throw err;
        }
      } catch (checkErr) {
        if (checkErr.statusCode === 409) throw checkErr;
      }
    }

    const sanitizedPhone = phone !== undefined ? String(phone).trim() : undefined;

    try {
      const sql = `
        UPDATE users
        SET first_name = COALESCE($1, first_name),
            email = COALESCE($2, email),
            phone = COALESCE($3, phone),
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, first_name, last_name, email, role, account_id, phone, is_suspended
      `;
      const res = await query(sql, [name || null, normalizedEmail || null, sanitizedPhone !== undefined ? sanitizedPhone : null, numId]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        return {
          id: Number(u.id),
          name: u.first_name || u.email,
          email: u.email,
          phone: u.phone || '',
          role: u.role,
          account_id: u.account_id ? Number(u.account_id) : null,
          is_suspended: Boolean(u.is_suspended),
        };
      }
    } catch (err) {
      if (err.statusCode === 409) throw err;
    }

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      if (name) memUser.name = name;
      if (normalizedEmail) memUser.email = normalizedEmail;
      if (sanitizedPhone !== undefined) memUser.phone = sanitizedPhone;
      memUser.updated_at = new Date().toISOString();
      return {
        id: memUser.id,
        name: memUser.name,
        email: memUser.email,
        phone: memUser.phone || '',
        role: memUser.role,
        account_id: memUser.account_id,
        is_suspended: Boolean(memUser.is_suspended),
      };
    }

    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  async changePassword(userId, payload = {}) {
    const numId = Number(userId);
    const current_password = payload.current_password || payload.currentPassword;
    const new_password = payload.new_password || payload.newPassword;
    if (!current_password || !new_password) {
      const err = new Error('Mật khẩu hiện tại và mật khẩu mới là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    if (typeof new_password !== 'string' || new_password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(new_password)) {
      const err = new Error('Mật khẩu mới phải có độ dài tối thiểu 8 ký tự và bao gồm cả chữ cái và chữ số');
      err.statusCode = 400;
      throw err;
    }

    try {
      const res = await query('SELECT password FROM users WHERE id = $1 LIMIT 1', [numId]);
      if (res.rowCount > 0) {
        const currentHash = res.rows[0].password;
        const valid = await bcrypt.compare(current_password, currentHash);
        if (!valid) {
          const err = new Error('Mật khẩu hiện tại không chính xác');
          err.statusCode = 400;
          throw err;
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [newHash, numId]);
        return { success: true, message: 'Đổi mật khẩu thành công' };
      }
    } catch (err) {
      if (err.statusCode === 400) throw err;
    }

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      const valid = await bcrypt.compare(current_password, memUser.password_hash || memUser.password);
      if (!valid) {
        const err = new Error('Mật khẩu hiện tại không chính xác');
        err.statusCode = 400;
        throw err;
      }
      memUser.password_hash = await bcrypt.hash(new_password, 10);
      memUser.password = memUser.password_hash;
      memUser.updated_at = new Date().toISOString();
      return { success: true, message: 'Đổi mật khẩu thành công' };
    }

    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // Delegations to cohesive AdminService (Composition)
  async getAllUsers() {
    return adminService.getAllUsers();
  }

  async adminCreateUser(userData) {
    return adminService.adminCreateUser(userData);
  }

  async adminUpdateUser(userId, userData) {
    return adminService.adminUpdateUser(userId, userData);
  }

  async updateUserRole(userId, newRole) {
    return adminService.updateUserRole(userId, newRole);
  }

  async toggleUserStatus(userId) {
    return adminService.toggleUserStatus(userId);
  }

  async suspendUser(userId) {
    return adminService.suspendUser(userId);
  }

  async deleteUser(userId) {
    return adminService.deleteUser(userId);
  }

  async getStats() {
    return adminService.getStats();
  }

  getMemoryUsers() {
    return Array.from(memoryUsers.values());
  }
}

export default new AuthService();
