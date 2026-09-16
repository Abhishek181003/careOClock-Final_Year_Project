import { verifyToken } from '../utils/token.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Middleware: Verify JWT from Authorization Header and validate against database state
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication token is missing.',
    });
  }

  try {
    const decoded = verifyToken(token);

    // Database re-verification (P2-5 & P2-4): Ensure user exists, account is active, and token has not been revoked
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized: User account no longer exists.',
      });
    }

    if (user.isLocked()) {
      return res.status(423).json({
        error: 'Account locked: Too many failed login attempts. Please try again later.',
      });
    }

    // Check token version to support instant revocation on logout or role change
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        error: 'Unauthorized: Token has been revoked or invalidated by a newer session.',
      });
    }

    // Attach verified user data directly from DB state
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role, // Live role from database
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired token.',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Middleware: Server-Side Role-Based Access Control (RBAC)
 * Enforces role check on every protected route and logs violations (NFR1).
 * @param {string[]} allowedRoles - Array of roles permitted (e.g. ['doctor'], ['patient', 'doctor'])
 */
export function requireRole(allowedRoles) {
  return async (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Unauthorized: No authenticated user role found.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Log RBAC violation for security compliance auditing (NFR1)
      await AuditLog.logEvent({
        action: 'RBAC_ACCESS_DENIED',
        userId: req.user.id,
        role: req.user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: {
          path: req.originalUrl,
          method: req.method,
          requiredRoles: allowedRoles,
          userRole: req.user.role,
        },
      });

      const responseBody = {
        error: `Forbidden: Role '${req.user.role}' is not authorized to access this resource.`,
      };

      // Gate detailed role metadata in production to avoid information disclosure (P2-6)
      if (process.env.NODE_ENV !== 'production') {
        responseBody.requiredRoles = allowedRoles;
        responseBody.userRole = req.user.role;
      }

      return res.status(403).json(responseBody);
    }

    next();
  };
}
