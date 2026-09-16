import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/**
 * Strict limiter for sensitive authentication endpoints (Login & Register)
 * Mitigates OWASP API4:2023 and automated credential-stuffing attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => (req.headers['x-test-rate-limit'] ? 5 : 30), // 5 for security test verification, 30 in production
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
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
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: 'Too many clinical requests. Please slow down your submissions.',
  },
});

/**
 * General API limiter for all other routes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: 'Too many requests from this IP. Please try again later.',
  },
});
