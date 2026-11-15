import authService from '../services/auth.service.js';
import {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  decodeToken,
  verifyRefreshToken,
} from '../utils/token.js';

// Re-export token utilities for backward compatibility
export {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  decodeToken,
  verifyRefreshToken,
};

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid token',
      code: 'AUTH_TOKEN_INVALID',
      details: null,
    });
  }

  const token = authHeader.substring(7);
  const decoded = decodeToken(token);

  if (!decoded || !decoded.id || decoded.type === 'refresh' || (decoded.type && decoded.type !== 'access')) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired access token',
      code: 'AUTH_TOKEN_INVALID',
      details: null,
    });
  }

  try {
    const user = await authService.getUserById(decoded.id);
    if (!user || user.is_active === false) {
      return res.status(401).json({
        error: 'Unauthorized: Account suspended or non-existent',
        code: 'AUTH_TOKEN_INVALID',
        details: null,
      });
    }

    req.user = {
      ...user,
      role: user.role,
    };
    next();
  } catch {
    return res.status(401).json({
      error: 'Unauthorized: User lookup failed',
      code: 'AUTH_TOKEN_INVALID',
      details: null,
    });
  }
};

export const optionalAuthenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = decodeToken(token);
    if (decoded && decoded.id && decoded.type === 'access') {
      try {
        const user = await authService.getUserById(decoded.id);
        if (user && user.is_active !== false) {
          req.user = { ...user, role: user.role };
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
  verifyRefreshToken,
  authenticateToken,
  optionalAuthenticateToken,
};
