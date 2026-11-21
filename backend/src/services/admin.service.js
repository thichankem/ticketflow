import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

export const memoryUsers = new Map();

/**
 * Cohesive Admin Platform Domain Service
 * Encapsulates administrative user management, status toggles, platform statistics,
 * and financial audit exports.
 */
export class AdminService {
  async getStats() {
    try {
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND UPPER(status) != 'DRAFT') AS total_events,
          (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND UPPER(status) IN ('LIVE', 'OPEN', 'PUBLISHED')) AS open_events,
          (SELECT COUNT(*) FROM orders) AS total_orders,
          (SELECT COALESCE(SUM(total_gross), 0) FROM orders WHERE status = 'COMPLETED') AS total_revenue
      `;
      const res = await query(statsQuery);
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        return {
          total_users: Number(row.total_users || 0),
          total_events: Number(row.total_events || 0),
          open_events: Number(row.open_events || 0),
          total_orders: Number(row.total_orders || 0),
          total_revenue: Number(row.total_revenue || 0),
        };
      }
    } catch {}

    return {
      total_users: memoryUsers.size,
      total_events: 0,
      open_events: 0,
      total_orders: 0,
      total_revenue: 0,
    };
  }

  async getAllUsers() {
    try {
      const sql = `
        SELECT id, first_name, last_name, email, phone, role, is_suspended, created_at, updated_at
        FROM users
        ORDER BY id ASC
      `;
      const res = await query(sql);
      return (res.rows || []).map((u) => ({
        id: Number(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        email: u.email,
        phone: u.phone || null,
        role: u.role,
        is_suspended: Boolean(u.is_suspended),
        status: u.is_suspended ? 'SUSPENDED' : 'ACTIVE',
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));
    } catch (err) {
      console.warn('[AdminService.getAllUsers] DB fallback:', err.message);
    }

    const list = Array.from(memoryUsers.values()).map((u) => ({
      id: u.id,
      name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
      email: u.email,
      phone: u.phone || null,
      role: u.role,
      is_suspended: Boolean(u.is_suspended),
      status: u.is_suspended ? 'SUSPENDED' : 'ACTIVE',
      created_at: u.created_at || new Date().toISOString(),
      updated_at: u.updated_at || new Date().toISOString(),
    }));
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async adminCreateUser({ name, email, password, phone, role = 'ATTENDEE', is_active = true }) {
    if (!email || typeof email !== 'string') {
      const error = new Error('Valid email address is required');
      error.statusCode = 400;
      throw error;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      const error = new Error('Invalid email format');
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

    if (role && role.toUpperCase() === 'ADMIN') {
      const error = new Error('Administrators cannot grant or create another administrator (ADMIN)');
      error.statusCode = 403;
      throw error;
    }

    const rawPassword = password || 'Ticketflow@123';
    const password_hash = await bcrypt.hash(rawPassword, 10);
    const validRole = ['ORGANIZER', 'ATTENDEE'].includes(role?.toUpperCase())
      ? role.toUpperCase()
      : 'ATTENDEE';

    try {
      const sql = `
        INSERT INTO users (first_name, last_name, email, password, phone, role, created_at, updated_at)
        VALUES ($1, '', $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, first_name, last_name, email, phone, role, account_id, created_at, updated_at
      `;
      const res = await query(sql, [
        name || normalizedEmail.split('@')[0],
        normalizedEmail,
        password_hash,
        phone || null,
        validRole,
      ]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        u.name = u.first_name || u.email;
        u.is_active = is_active !== false;
        try {
          const accSql = `INSERT INTO accounts (name, email, short_id, currency_code, timezone, created_at, updated_at) VALUES ($1, $2, $3, 'VND', 'UTC', NOW(), NOW()) RETURNING id`;
          const accRes = await query(accSql, [u.name, normalizedEmail, `acc_${Date.now()}`]);
          if (accRes.rowCount > 0) {
            u.account_id = Number(accRes.rows[0].id);
            await query('UPDATE users SET account_id = $1 WHERE id = $2', [u.account_id, u.id]);
            await query(
              `INSERT INTO account_users (account_id, user_id, role, is_account_owner, status) VALUES ($1, $2, $3, true, 'ACTIVE')`,
              [u.account_id, u.id, validRole]
            );
          }
        } catch {}
        return u;
      }
    } catch {}

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
      password: password_hash,
      role: validRole,
      is_active: is_active !== false,
      is_suspended: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryUsers.set(nextId, newUser);
    return newUser;
  }

  async adminUpdateUser(userId, { name, email, phone, role, is_active }) {
    const numId = Number(userId);
    let updated = null;

    if (role && role.toUpperCase() === 'ADMIN') {
      const error = new Error('Administrators cannot assign another user as administrator (ADMIN)');
      error.statusCode = 403;
      throw error;
    }

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const checkSql = 'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 LIMIT 1';
      const existing = await query(checkSql, [normalizedEmail, numId]).catch(() => null);
      if (existing && existing.rowCount > 0) {
        const error = new Error('Email already taken by another user');
        error.statusCode = 409;
        throw error;
      }
    }

    try {
      const sql = `
        UPDATE users
        SET first_name = COALESCE($1, first_name),
            email = COALESCE($2, email),
            phone = COALESCE($3, phone),
            role = COALESCE($4, role),
            updated_at = NOW()
        WHERE id = $5
        RETURNING id, first_name, last_name, email, phone, role, is_suspended, created_at, updated_at
      `;
      const res = await query(sql, [
        name,
        email ? email.toLowerCase().trim() : null,
        phone,
        role ? role.toUpperCase() : null,
        numId,
      ]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        updated = {
          id: Number(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          is_suspended: Boolean(u.is_suspended),
          status: u.is_suspended ? 'SUSPENDED' : 'ACTIVE',
          created_at: u.created_at,
          updated_at: u.updated_at,
        };
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      if (name) memUser.name = name;
      if (email) memUser.email = email.toLowerCase().trim();
      if (phone !== undefined) memUser.phone = phone;
      if (role) memUser.role = role.toUpperCase();
      if (is_active !== undefined) memUser.is_active = is_active;
      memUser.updated_at = new Date().toISOString();
      if (!updated) updated = memUser;
    }

    if (!updated) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return updated;
  }

  async updateUserRole(userId, newRole) {
    const roleUpper = (newRole || '').toUpperCase();
    if (roleUpper === 'ADMIN') {
      const error = new Error('Administrators cannot promote or assign another user as administrator (ADMIN)');
      error.statusCode = 403;
      throw error;
    }

    const validRoles = ['ORGANIZER', 'ATTENDEE'];
    if (!validRoles.includes(roleUpper)) {
      const error = new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const numId = Number(userId);

    const memUserCheck = memoryUsers.get(numId);
    if (memUserCheck && memUserCheck.role === 'ADMIN') {
      const error = new Error('Cannot change the role of an administrator');
      error.statusCode = 403;
      throw error;
    }
    let updated = null;

    try {
      const sql = `
        UPDATE users
        SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, first_name, last_name, email, phone, role, created_at, updated_at
      `;
      const res = await query(sql, [roleUpper, numId]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        updated = {
          id: Number(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          created_at: u.created_at,
          updated_at: u.updated_at,
        };
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      memUser.role = roleUpper;
      memUser.updated_at = new Date().toISOString();
      if (!updated) updated = memUser;
    }

    if (!updated) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return updated;
  }

  async toggleUserStatus(userId) {
    const numId = Number(userId);
    let updated = null;

    try {
      const sql = `
        UPDATE users
        SET is_suspended = NOT COALESCE(is_suspended, FALSE), updated_at = NOW()
        WHERE id = $1
        RETURNING id, first_name, last_name, email, role, is_suspended, created_at, updated_at
      `;
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        updated = {
          id: Number(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          role: u.role,
          is_suspended: Boolean(u.is_suspended),
          status: u.is_suspended ? 'SUSPENDED' : 'ACTIVE',
          created_at: u.created_at,
          updated_at: u.updated_at,
        };
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      memUser.is_suspended = !memUser.is_suspended;
      memUser.status = memUser.is_suspended ? 'SUSPENDED' : 'ACTIVE';
      memUser.updated_at = new Date().toISOString();
      if (!updated) updated = memUser;
    }

    if (!updated) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return updated;
  }

  async suspendUser(userId) {
    const numId = Number(userId);
    let updated = null;

    try {
      const sql = `
        UPDATE users
        SET is_suspended = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING id, first_name, last_name, email, role, is_suspended, created_at, updated_at
      `;
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) {
        const u = res.rows[0];
        updated = {
          id: Number(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          role: u.role,
          is_suspended: true,
          status: 'SUSPENDED',
          created_at: u.created_at,
          updated_at: u.updated_at,
        };
      }
    } catch {}

    const memUser = memoryUsers.get(numId);
    if (memUser) {
      memUser.is_suspended = true;
      memUser.status = 'SUSPENDED';
      memUser.updated_at = new Date().toISOString();
      if (!updated) updated = memUser;
    }

    if (!updated) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return updated;
  }

  async deleteUser(userId) {
    const numId = Number(userId);
    let found = false;

    try {
      const sql = 'DELETE FROM users WHERE id = $1 RETURNING id';
      const res = await query(sql, [numId]);
      if (res.rowCount > 0) found = true;
    } catch {}

    if (memoryUsers.has(numId)) {
      memoryUsers.delete(numId);
      found = true;
    }

    if (!found) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return { success: true, message: 'User deleted successfully' };
  }
}

export default new AdminService();
