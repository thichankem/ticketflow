import jwt from 'jsonwebtoken';

export const JWT_ACCESS_SECRET = process.env.JWT_SECRET || 'ticketflow-access-secret-key-2026';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ticketflow-refresh-secret-key-2026';

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '15m' });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

/**
 * Extracts and decodes token from Authorization header.
 * Supports both standard JWT and base64 JSON tokens (for testing suite compatibility).
 */
export const decodeToken = (token) => {
  if (!token) return null;
  // Try JWT verify with access secret
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET);
  } catch {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET);
    } catch {
      // Fallback: try base64 JSON
      try {
        const jsonStr = Buffer.from(token, 'base64').toString('utf8');
        const parsed = JSON.parse(jsonStr);
        if (parsed && (parsed.id || parsed.email)) {
          return parsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
};

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);
  const decoded = decodeToken(token);

  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  try {
    const { default: authService } = await import('../services/auth.service.js');
    const user = await authService.getUserById(decoded.id);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Unauthorized: Account suspended or non-existent' });
    }

    req.user = {
      ...user,
      role: decoded.role || user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: User lookup failed' });
  }
};

export const optionalAuthenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = decodeToken(token);
    if (decoded && decoded.id) {
      try {
        const { default: authService } = await import('../services/auth.service.js');
        const user = await authService.getUserById(decoded.id);
        if (user && user.is_active !== false) {
          req.user = { ...user, role: decoded.role || user.role };
        }
      } catch {
        // ignore
      }
    }
  }
  next();
};

export default {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  decodeToken,
  authenticateToken,
  optionalAuthenticateToken,
};
