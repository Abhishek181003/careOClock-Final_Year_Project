import AuditLog from '../models/AuditLog.js';

/**
 * Checks whether an object or any of its nested keys contains
 * MongoDB query injection characters (e.g. '$' prefix or '.' path traversal).
 */
function hasProhibitedKeys(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  for (const key of Object.keys(obj)) {
    // Prohibit keys starting with '$' (e.g. $gt, $ne, $where, $regex) or containing '.'
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }

    const value = obj[key];
    if (typeof value === 'object' && value !== null) {
      if (hasProhibitedKeys(value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Global NoSQL Injection Sanitizer Middleware (Phase 10)
 * Rejects any request carrying prohibited MongoDB query operators in body, query, or params.
 */
export function sanitizeInput(req, res, next) {
  const sources = [
    { name: 'body', data: req.body },
    { name: 'query', data: req.query },
    { name: 'params', data: req.params },
  ];

  for (const source of sources) {
    if (hasProhibitedKeys(source.data)) {
      // Fire-and-forget audit event for security monitoring
      AuditLog.logEvent({
        action: 'IDOR_ACCESS_PREVENTED',
        userId: req.user?.id || null,
        role: req.user?.role || 'anonymous',
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: {
          securityAlert: 'NoSQL_INJECTION_ATTEMPT',
          source: source.name,
          method: req.method,
          path: req.originalUrl || req.url,
        },
      }).catch(() => {});

      return res.status(400).json({
        error: 'Malformed or prohibited query operator detected',
        message: "Input contains forbidden NoSQL injection characters ('$' or '.')",
      });
    }
  }

  next();
}

export default sanitizeInput;
