import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_ACCESS_SECRET && !process.env.JWT_SECRET) {
  console.warn('[SECURITY WARNING] Running in production mode without explicit JWT_SECRET or JWT_ACCESS_SECRET configured.');
}

export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'ticketflow-access-secret-key-2026';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ticketflow-refresh-secret-key-2026';

export const generateAccessToken = (payload = {}) => {
  return jwt.sign({ ...payload, type: 'access' }, JWT_ACCESS_SECRET, { expiresIn: '15m' });
};

export const generateRefreshToken = (payload = {}) => {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

/**
 * Extracts and verifies token from Authorization header.
 * Only accepts cryptographically valid Access JWT tokens.
 */
export const decodeToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    if (!decoded || decoded.type === 'refresh' || (decoded.type && decoded.type !== 'access')) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

/**
 * Verifies a Refresh Token for the refresh endpoint.
 * Strictly verifies against JWT_REFRESH_SECRET only.
 * Rejects tokens if signature invalid or type !== 'refresh'.
 */
export const verifyRefreshToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (!decoded || decoded.type !== 'refresh') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

export default {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  decodeToken,
  verifyRefreshToken,
};
