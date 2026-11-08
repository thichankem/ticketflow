import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true';

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests' },
});

export const orderReservationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 25,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests: Rate limit exceeded on reservations' },
});

export default {
  authRateLimiter,
  orderReservationRateLimiter,
};
