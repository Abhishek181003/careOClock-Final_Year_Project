import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Strict limiter for sensitive authentication endpoints (Login & Register)
 * Mitigates OWASP API4:2023 and automated credential-stuffing attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.headers['x-test-rate-limit']) return 5;
    return isProduction ? 30 : 100;
  },
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skip: (req) => {
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) return true;
    if (process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
    retryAfterMinutes: 15,
  },
});

/**
 * Moderate limiter for clinical data submissions and queries
 */
export const clinicalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProduction ? 120 : 600, // 120 req/min in prod, 600 in dev
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true',
  message: {
    error: 'Too many clinical requests. Please slow down your submissions.',
  },
});

/**
 * General API limiter for all other routes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 300 : 5000, // 300 in production, 5000 in dev
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.DISABLE_RATE_LIMIT === 'true') return true;
    // Do not double-throttle login and register which have their own dedicated authLimiter
    if (
      req.path === '/auth/login' ||
      req.path === '/auth/register' ||
      req.originalUrl?.includes('/auth/login') ||
      req.originalUrl?.includes('/auth/register')
    ) {
      return true;
    }
    return false;
  },
  message: {
    error: 'Too many requests from this IP. Please try again later.',
  },
});
