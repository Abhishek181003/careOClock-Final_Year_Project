import express from 'express';
import mongoose from 'mongoose';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import {
  getPatientWearableStatus,
  getOAuthAuthorizeUrl,
  connectProvider,
  connectDemoProvider,
  disconnectProvider,
  syncPatientReadings,
} from '../services/wearables/wearableSyncService.js';

const router = express.Router();

// Helper to resolve patient profile from request
async function resolvePatientFromRequest(req) {
  if (req.user.role === 'patient') {
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      const err = new Error('Patient profile not found.');
      err.status = 404;
      throw err;
    }
    return patient;
  }

  // Doctor or Caregiver query by ?patientId
  const patientId = req.query.patientId || req.body.patientId;
  if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
    const err = new Error('A valid patientId query parameter is required for non-patient roles.');
    err.status = 400;
    throw err;
  }

  if (req.user.role === 'doctor') {
    const patient = await Patient.findOne({ _id: patientId, assignedDoctorId: req.user.id });
    if (!patient) {
      const err = new Error('Forbidden: You are not the assigned doctor for this patient.');
      err.status = 403;
      throw err;
    }
    return patient;
  }

  if (req.user.role === 'caregiver') {
    const link = await CaregiverLink.findOne({
      caregiverId: req.user.id,
      patientId,
      status: 'active',
    });
    if (!link) {
      const err = new Error('Forbidden: You do not have active caregiver linking to this patient.');
      err.status = 403;
      throw err;
    }
    const patient = await Patient.findById(patientId);
    return patient;
  }

  const err = new Error('Unauthorized role.');
  err.status = 403;
  throw err;
}

// ── 1. GET /api/wearables/status ─────────────────────────────────────────────
router.get('/status', authenticateToken, requireRole(['patient', 'caregiver', 'doctor']), async (req, res, next) => {
  try {
    const patient = await resolvePatientFromRequest(req);
    const statusReport = await getPatientWearableStatus(patient._id);
    return res.status(200).json(statusReport);
  } catch (err) {
    next(err);
  }
});

// ── 2. GET /api/wearables/:provider/auth-url ────────────────────────────────
router.get('/:provider/auth-url', authenticateToken, requireRole(['patient']), async (req, res, next) => {
  try {
    const { provider } = req.params;
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found.' });
    }

    const authUrl = getOAuthAuthorizeUrl(patient._id, provider);
    return res.status(200).json({ provider, authUrl });
  } catch (err) {
    next(err);
  }
});

// ── 3. GET /api/wearables/:provider/callback (OAuth Redirect Endpoint) ──────
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  // Handle provider denial or error
  if (error) {
    console.warn(`[WEARABLE-OAUTH-ERR] Provider ${provider} returned error: ${error} (${error_description})`);
    const encodedMsg = encodeURIComponent(
      error === 'access_denied'
        ? `Access was denied by ${provider}. If using Google Health Testing mode, verify the account is on the pilot allowlist.`
        : (error_description || error)
    );
    return res.redirect(`${clientUrl}/app/wearable?status=error&provider=${provider}&message=${encodedMsg}`);
  }

  if (!code || !state) {
    return res.redirect(`${clientUrl}/app/wearable?status=error&provider=${provider}&message=Missing+code+or+state`);
  }

  try {
    // Decode state to get patientId
    const parts = state.split('.');
    const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const { patientId } = JSON.parse(payloadJson);

    await connectProvider({
      patientId,
      provider,
      code,
      state,
      redirectUri: process.env[`${provider.toUpperCase()}_REDIRECT_URI`],
    });

    return res.redirect(`${clientUrl}/app/wearable?status=connected&provider=${provider}`);
  } catch (err) {
    console.error(`[WEARABLE-CALLBACK-FAIL] Could not process callback for ${provider}:`, err.message);
    const msg = encodeURIComponent(err.message || 'OAuth authentication failed.');
    return res.redirect(`${clientUrl}/app/wearable?status=error&provider=${provider}&message=${msg}`);
  }
});

// ── 4. POST /api/wearables/:provider/connect-demo ───────────────────────────
router.post('/:provider/connect-demo', authenticateToken, requireRole(['patient']), async (req, res, next) => {
  try {
    const { provider } = req.params;
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found.' });
    }

    const result = await connectDemoProvider({
      patientId: patient._id,
      provider,
      userId: req.user.id,
    });

    return res.status(200).json({
      message: `Successfully connected ${provider} in Sandbox / Demo Mode.`,
      result,
    });
  } catch (err) {
    next(err);
  }
});

// ── 5. POST /api/wearables/:provider/disconnect ─────────────────────────────
router.post('/:provider/disconnect', authenticateToken, requireRole(['patient']), async (req, res, next) => {
  try {
    const { provider } = req.params;
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found.' });
    }

    const result = await disconnectProvider({
      patientId: patient._id,
      provider,
      userId: req.user.id,
    });

    return res.status(200).json({
      message: `Successfully disconnected ${provider}.`,
      result,
    });
  } catch (err) {
    next(err);
  }
});

// ── 6. GET /api/wearables/latest-readings ────────────────────────────────────
router.get('/latest-readings', authenticateToken, requireRole(['patient', 'doctor']), async (req, res, next) => {
  try {
    const patient = await resolvePatientFromRequest(req);
    const syncData = await syncPatientReadings(patient._id);
    return res.status(200).json(syncData);
  } catch (err) {
    next(err);
  }
});

// ── 7. GET /api/wearables/google_health/debug-sources (Dev-only diagnostic) ──
router.get('/google_health/debug-sources', authenticateToken, requireRole(['patient']), async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const ghProvider = (patient.connectedProviders || []).find(p => p.provider === 'google_health');
    if (!ghProvider) return res.status(400).json({ error: 'Google Health not connected' });

    const { decryptToken } = await import('../utils/tokenEncryption.js');
    const accessToken = decryptToken(ghProvider.accessToken);

    const apiBase = 'https://fitness.googleapis.com/fitness/v1/users/me';
    const headers = { Authorization: `Bearer ${accessToken}` };

    // List all data sources
    const sourcesRes = await fetch(`${apiBase}/dataSources`, { headers });
    if (!sourcesRes.ok) {
      return res.status(502).json({ error: `Google API returned ${sourcesRes.status}`, body: await sourcesRes.text() });
    }
    const sourcesData = await sourcesRes.json();
    const allSources = (sourcesData.dataSource || []).map(ds => ({
      dataType: ds.dataType?.name,
      streamId: ds.dataStreamId,
      app: ds.application?.packageName || 'N/A',
      device: ds.device?.model || 'N/A',
    }));

    // Query each source for data in last 24h
    const nowNanos = Date.now() * 1000000;
    const lookbackNanos = (Date.now() - 86400000) * 1000000;

    const sourcesWithData = [];
    for (const ds of sourcesData.dataSource || []) {
      try {
        const endpoint = `${apiBase}/dataSources/${encodeURIComponent(ds.dataStreamId)}/datasets/${lookbackNanos}-${nowNanos}`;
        const dsRes = await fetch(endpoint, { headers });
        if (dsRes.ok) {
          const dsData = await dsRes.json();
          if (dsData?.point?.length > 0) {
            sourcesWithData.push({
              dataType: ds.dataType?.name,
              streamId: ds.dataStreamId,
              app: ds.application?.packageName || 'N/A',
              pointCount: dsData.point.length,
              latestPoint: dsData.point[dsData.point.length - 1],
            });
          }
        }
      } catch { /* skip */ }
    }

    return res.status(200).json({
      totalSources: allSources.length,
      allSources,
      sourcesWithDataLast24h: sourcesWithData,
      isDemoMode: ghProvider.isDemoMode,
      tokenExpiresAt: ghProvider.tokenExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
