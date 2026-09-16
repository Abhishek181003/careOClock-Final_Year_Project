import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';
import clinicalRoutes from './routes/clinicalRoutes.js';
import dataRightsRoutes from './routes/dataRightsRoutes.js';
import caregiverRoutes from './routes/caregiverRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { authLimiter, clinicalLimiter, apiLimiter } from './middleware/rateLimiter.js';

import sanitizeInput from './middleware/sanitize.js';

dotenv.config();

const app = express();

// ── Security & Middleware ──────────────────────────────────────────

// 1. Hardened Helmet for enterprise HTTP security headers (Phase 10)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  })
);

// 2. Strict CORS policy: Zero wildcard '*' permitted (Phase 10)
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];
const rawOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : defaultAllowedOrigins;

// Assert no wildcard origin is permitted
const configuredOrigins = rawOrigins.filter((o) => o !== '*' && o !== '');

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser server-to-server calls without Origin header
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        const corsErr = new Error(`CORS blocked for unauthorized origin: ${origin}`);
        corsErr.status = 403;
        callback(corsErr);
      }
    },
    credentials: true,
    maxAge: 86400, // Cache preflight requests for 24 hours
  })
);

// 3. Body parser with explicit payload size limit (P2-15)
app.use(express.json({ limit: '100kb' }));

// 4. Global NoSQL injection input sanitizer (Phase 10)
app.use(sanitizeInput);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate Limiting (OWASP API4:2023) ──────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/clinical', clinicalLimiter);
app.use('/api/medicines', clinicalLimiter);
app.use('/api/reports', clinicalLimiter);

// ── API Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/data-requests', dataRightsRoutes);
app.use('/api/caregiver', caregiverRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'careoclock-server',
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get('/', (_req, res) => {
  res.json({
    name: 'CareOClock Backend API',
    status: 'running',
    version: '0.1.0',
    documentation: '/api/docs',
  });
});

// ── Centralized Global Error Handler (P2-16) ────────────────────────
app.use((err, req, res, _next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled server error:', err);
  }

  const statusCode = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    details: process.env.NODE_ENV !== 'production' && err.details ? err.details : undefined,
  });
});

export default app;
