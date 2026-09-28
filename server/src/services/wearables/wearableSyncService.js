import Patient from '../../models/Patient.js';
import AuditLog from '../../models/AuditLog.js';
import { encryptToken, decryptToken } from '../../utils/tokenEncryption.js';
import { createOAuthState, verifyOAuthState } from '../../utils/oauthState.js';
import OuraAdapter from './OuraAdapter.js';
import WithingsAdapter from './WithingsAdapter.js';
import GoogleHealthAdapter from './GoogleHealthAdapter.js';

/**
 * CareOClock — Provider-Agnostic Wearable Synchronization Service
 *
 * Coordinates multi-provider connections, encrypted token lifecycle,
 * concurrent parallel telemetry sync via Promise.allSettled, deterministic
 * multi-device parameter merging, and cross-device physiological disagreement detection.
 */

// Adapter Registry
const adapters = {
  oura: new OuraAdapter(),
  withings: new WithingsAdapter(),
  google_health: new GoogleHealthAdapter(),
};

/**
 * Get adapter instance by provider key
 * @param {string} provider - 'oura' | 'withings' | 'google_health'
 * @returns {WearableAdapter}
 */
export function getAdapter(provider) {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Unsupported wearable provider: '${provider}'. Allowed: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

/**
 * Get wearable connection status and capabilities for a patient
 * Strips all tokens from the response to prevent credential leakage.
 * @param {string|mongoose.Types.ObjectId} patientId
 * @returns {Promise<Object>} Status report with provider details and coverage matrix
 */
export async function getPatientWearableStatus(patientId) {
  const patient = await Patient.findById(patientId).select('connectedProviders');
  if (!patient) {
    throw new Error('Patient profile not found.');
  }

  const connectedList = (patient.connectedProviders || []).map((cp) => {
    const adapter = adapters[cp.provider];
    const capabilities = adapter ? adapter.getCapabilities(cp.deviceInfo) : [];

    return {
      provider: cp.provider,
      connectedAt: cp.connectedAt,
      lastSyncAt: cp.lastSyncAt,
      isDemoMode: cp.isDemoMode,
      deviceInfo: cp.deviceInfo || {},
      capabilities,
    };
  });

  // Calculate unique automated vital coverage across all connected devices
  const coveredVitalsSet = new Set();
  for (const c of connectedList) {
    for (const cap of c.capabilities) {
      coveredVitalsSet.add(cap);
    }
  }

  const supportedCanonicalVitals = ['systolicBp', 'diastolicBp', 'heartRate', 'spo2', 'temperatureC', 'respirationRate'];
  const coveragePercent = Math.round((coveredVitalsSet.size / supportedCanonicalVitals.length) * 100);

  return {
    patientId,
    connectedCount: connectedList.length,
    connectedProviders: connectedList,
    coveredVitals: Array.from(coveredVitalsSet),
    coveragePercent,
    isFullyAutomated: coveredVitalsSet.size === supportedCanonicalVitals.length,
    allSupportedProviders: [
      {
        provider: 'oura',
        name: 'Oura Ring',
        description: 'Smart ring telemetry: sleep, resting HR, nocturnal SpO2, and distal skin temperature.',
        brandCapabilities: ['heartRate', 'spo2', 'temperatureC', 'respirationRate'],
      },
      {
        provider: 'withings',
        name: 'Withings Health',
        description: 'Clinically validated arm cuff (BPM Connect) for Blood Pressure & ScanWatch for SpO2.',
        brandCapabilities: ['systolicBp', 'diastolicBp', 'heartRate', 'spo2'],
      },
      {
        provider: 'google_health',
        name: 'Google Health API',
        description: 'Testing Mode cloud integration for Google Pixel Watch and Fitbit devices.',
        brandCapabilities: ['heartRate', 'spo2', 'respirationRate'],
      },
    ],
  };
}

/**
 * Generate OAuth authorization URL with HMAC-signed CSRF state token
 * @param {string|mongoose.Types.ObjectId} patientId
 * @param {string} provider
 * @returns {string} Authorization URL
 */
export function getOAuthAuthorizeUrl(patientId, provider) {
  const adapter = getAdapter(provider);
  const state = createOAuthState({ patientId, provider });
  return adapter.getAuthorizationUrl(state);
}

/**
 * Connect a provider via standard OAuth2 authorization code callback
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.patientId
 * @param {string} params.provider
 * @param {string} params.code
 * @param {string} [params.redirectUri]
 * @param {string} params.state
 * @param {string} [params.userId]
 * @returns {Promise<Object>}
 */
export async function connectProvider({ patientId, provider, code, redirectUri, state, userId = null }) {
  // Verify CSRF state token
  verifyOAuthState(state, patientId, provider);

  const adapter = getAdapter(provider);
  const tokenPayload = await adapter.connect({ code, redirectUri });

  // Encrypt sensitive tokens before database persistence
  const encryptedAccessToken = encryptToken(tokenPayload.accessToken);
  const encryptedRefreshToken = tokenPayload.refreshToken ? encryptToken(tokenPayload.refreshToken) : null;

  const expiresAt = tokenPayload.expiresIn
    ? new Date(Date.now() + tokenPayload.expiresIn * 1000)
    : new Date(Date.now() + 86400 * 30 * 1000);

  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error('Patient profile not found.');
  }

  // Remove existing provider record if reconnecting
  patient.connectedProviders = (patient.connectedProviders || []).filter((p) => p.provider !== provider);

  // Add new connected provider
  patient.connectedProviders.push({
    provider,
    providerUserId: tokenPayload.providerUserId || null,
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    tokenExpiresAt: expiresAt,
    scope: tokenPayload.scope || null,
    connectedAt: new Date(),
    isDemoMode: false,
    deviceInfo: tokenPayload.deviceInfo || {},
  });

  await patient.save();

  await AuditLog.logEvent({
    action: 'WEARABLE_CONNECTED',
    userId: userId || patient.userId,
    role: 'patient',
    details: {
      patientId: patient._id,
      provider,
      isDemoMode: false,
      deviceModel: tokenPayload.deviceInfo?.model || 'Generic',
    },
  });

  return {
    success: true,
    provider,
    connectedAt: new Date(),
    deviceInfo: tokenPayload.deviceInfo,
  };
}

/**
 * 1-Click Sandbox / Demo Mode Connection for rapid testing and evaluation
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.patientId
 * @param {string} params.provider
 * @param {string} [params.userId]
 * @returns {Promise<Object>}
 */
export async function connectDemoProvider({ patientId, provider, userId = null }) {
  const adapter = getAdapter(provider);
  const tokenPayload = await adapter.connect({ code: 'demo_auth_code', redirectUri: 'demo://callback' });

  const encryptedAccessToken = encryptToken(tokenPayload.accessToken);
  const encryptedRefreshToken = tokenPayload.refreshToken ? encryptToken(tokenPayload.refreshToken) : null;

  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error('Patient profile not found.');
  }

  patient.connectedProviders = (patient.connectedProviders || []).filter((p) => p.provider !== provider);

  patient.connectedProviders.push({
    provider,
    providerUserId: tokenPayload.providerUserId || 'demo_user',
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    tokenExpiresAt: new Date(Date.now() + 86400 * 30 * 1000),
    scope: tokenPayload.scope || 'demo',
    connectedAt: new Date(),
    isDemoMode: true,
    deviceInfo: tokenPayload.deviceInfo || {},
  });

  await patient.save();

  await AuditLog.logEvent({
    action: 'WEARABLE_CONNECTED',
    userId: userId || patient.userId,
    role: 'patient',
    details: {
      patientId: patient._id,
      provider,
      isDemoMode: true,
      deviceModel: tokenPayload.deviceInfo?.model,
    },
  });

  return {
    success: true,
    provider,
    isDemoMode: true,
    connectedAt: new Date(),
    deviceInfo: tokenPayload.deviceInfo,
  };
}

/**
 * Disconnect a wearable provider, revoking upstream tokens and deleting local credentials
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.patientId
 * @param {string} params.provider
 * @param {string} [params.userId]
 * @returns {Promise<Object>}
 */
export async function disconnectProvider({ patientId, provider, userId = null }) {
  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error('Patient profile not found.');
  }

  const existing = (patient.connectedProviders || []).find((p) => p.provider === provider);
  if (!existing) {
    return { success: true, message: `Provider '${provider}' was not connected.` };
  }

  // Decrypt token for upstream revocation
  let providerRevoked = false;
  try {
    const rawAccessToken = decryptToken(existing.accessToken);
    const rawRefreshToken = existing.refreshToken ? decryptToken(existing.refreshToken) : null;
    const adapter = getAdapter(provider);

    // Call upstream revocation with 5-second timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upstream revocation timeout')), 5000)
    );
    const revokePromise = adapter.revokeToken({ accessToken: rawAccessToken, refreshToken: rawRefreshToken });

    const res = await Promise.race([revokePromise, timeoutPromise]);
    providerRevoked = res?.revoked !== false;
  } catch (err) {
    console.warn(`[WEARABLE-REVOKE-WARN] Upstream token revocation failed for ${provider}:`, err.message);
  }

  // Remove provider from patient record
  patient.connectedProviders = patient.connectedProviders.filter((p) => p.provider !== provider);
  await patient.save();

  await AuditLog.logEvent({
    action: 'WEARABLE_DISCONNECTED',
    userId: userId || patient.userId,
    role: 'patient',
    details: {
      patientId: patient._id,
      provider,
      providerRevoked,
    },
  });

  return {
    success: true,
    provider,
    providerRevoked,
    disconnectedAt: new Date(),
  };
}

/**
 * Synchronize latest telemetry across all connected providers for a patient.
 * Uses Promise.allSettled for concurrent parallel fetching, merges deterministically
 * by parameter priority, and calculates cross-device disagreement.
 *
 * @param {string|mongoose.Types.ObjectId} patientId
 * @returns {Promise<Object>}
 */
export async function syncPatientReadings(patientId) {
  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new Error('Patient profile not found.');
  }

  const activeProviders = patient.connectedProviders || [];
  if (activeProviders.length === 0) {
    return {
      vitals: {
        systolicBp: null,
        diastolicBp: null,
        heartRate: null,
        spo2: null,
        temperatureC: null,
        respirationRate: null,
      },
      vitalMetadata: {},
      sources: {},
      vitalDisagreements: [],
      connectedCount: 0,
      providers: [],
      isDemoReading: false,
      timestamp: new Date().toISOString(),
      message: 'No wearable devices currently connected. Manual vitals entry remains fully available.',
    };
  }

  // Fetch all connected providers concurrently with 4-second individual timeouts
  const fetchTasks = activeProviders.map(async (cp) => {
    const adapter = getAdapter(cp.provider);
    let accessToken = decryptToken(cp.accessToken);

    // Check token expiration and auto-refresh if needed
    if (cp.tokenExpiresAt && new Date() >= new Date(cp.tokenExpiresAt.getTime() - 60000)) {
      if (cp.refreshToken) {
        try {
          const rawRefresh = decryptToken(cp.refreshToken);
          const refreshed = await adapter.refreshToken(rawRefresh);
          accessToken = refreshed.accessToken;
          cp.accessToken = encryptToken(refreshed.accessToken);
          if (refreshed.refreshToken) {
            cp.refreshToken = encryptToken(refreshed.refreshToken);
          }
          if (refreshed.expiresIn) {
            cp.tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
          }
          await patient.save();
        } catch (refErr) {
          console.warn(`[TOKEN-REFRESH-WARN] Could not refresh token for ${cp.provider}:`, refErr.message);
        }
      }
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout querying ${cp.provider} API`)), 7000)
    );

    const fetchPromise = adapter.fetchLatestReadings({
      accessToken,
      isDemoMode: cp.isDemoMode,
      deviceInfo: cp.deviceInfo,
    });

    const readingResult = await Promise.race([fetchPromise, timeoutPromise]);
    cp.lastSyncAt = new Date();

    return {
      provider: cp.provider,
      isDemoMode: cp.isDemoMode,
      reading: readingResult,
    };
  });

  const settledResults = await Promise.allSettled(fetchTasks);
  await patient.save(); // save any lastSyncAt updates

  const successfulReadings = [];
  const providerErrors = [];

  for (const r of settledResults) {
    if (r.status === 'fulfilled') {
      successfulReadings.push(r.value);
    } else {
      providerErrors.push(r.reason?.message || 'Provider query failed');
    }
  }

  // Update patient body metrics if supplied by wearables (Google Fit / Withings)
  let metricsUpdated = false;
  for (const s of successfulReadings) {
    const cp = patient.connectedProviders.find((p) => p.provider === s.provider);
    if (cp && s.reading?.deviceInfo) {
      cp.deviceInfo = { ...(cp.deviceInfo || {}), ...s.reading.deviceInfo };
      metricsUpdated = true;
    }

    const norm = s.reading?.normalized;
    if (norm?.weightKg && (!patient.weightKg || patient.weightKg !== norm.weightKg)) {
      patient.weightKg = norm.weightKg;
      metricsUpdated = true;
    }
    if (norm?.heightCm && (!patient.heightCm || patient.heightCm !== norm.heightCm)) {
      patient.heightCm = norm.heightCm;
      metricsUpdated = true;
    }
  }
  if (metricsUpdated) {
    await patient.save();
    console.log(`[WEARABLE-SYNC] Updated patient metrics: Weight ${patient.weightKg} kg, Height ${patient.heightCm} cm`);
  }

  // ── Multi-Device Merge Engine & Disagreement Detection ──────────────────────
  const mergedVitals = {
    systolicBp: null,
    diastolicBp: null,
    heartRate: null,
    spo2: null,
    temperatureC: null,
    respirationRate: null,
  };
  const mergedMetadata = {};
  const sources = {};
  const collectedReadingsByVital = {
    systolicBp: [],
    diastolicBp: [],
    heartRate: [],
    spo2: [],
    temperatureC: [],
    respirationRate: [],
  };

  // Collect all returned readings by vital
  for (const s of successfulReadings) {
    const { provider, reading } = s;
    const norm = reading?.normalized || {};
    const meta = reading?.vitalMetadata || {};

    for (const [vitalKey, value] of Object.entries(norm)) {
      if (value !== null && value !== undefined && !isNaN(value)) {
        if (!collectedReadingsByVital[vitalKey]) {
          collectedReadingsByVital[vitalKey] = [];
        }
        collectedReadingsByVital[vitalKey].push({
          provider,
          value,
          metadata: meta[vitalKey] || { isEstimated: false, provenance: provider },
        });
      }
    }
  }

  // Parameter Priority Hierarchy (Section 4.1):
  // 1. systolicBp / diastolicBp -> Withings BPM (Rank 1)
  // 2. heartRate -> Withings BPM spot check (1) > Oura resting HR (2) > Google Health (3)
  // 3. spo2 -> Withings ScanWatch (1) > Oura nocturnal (2) > Google Health (3)
  // 4. temperatureC -> Oura (1)
  // 5. respirationRate -> Oura (1) > Google Health (2)

  const priorityOrder = {
    systolicBp: ['withings', 'google_health'],
    diastolicBp: ['withings', 'google_health'],
    heartRate: ['withings', 'google_health', 'oura'],
    spo2: ['google_health', 'withings', 'oura'],
    temperatureC: ['oura', 'google_health'],
    respirationRate: ['google_health', 'oura'],
  };

  for (const [vitalKey, candidates] of Object.entries(collectedReadingsByVital)) {
    if (candidates.length === 0) continue;

    const ranking = priorityOrder[vitalKey] || [];
    // Sort candidates:
    // 1. Prioritize authentic direct measurements over calibrated baselines
    // 2. Fall back to priority ranking
    candidates.sort((a, b) => {
      const isRealA = !a.metadata?.isEstimated && a.metadata?.measurementMethod !== 'calibrated_bpm_connect';
      const isRealB = !b.metadata?.isEstimated && b.metadata?.measurementMethod !== 'calibrated_bpm_connect';
      if (isRealA && !isRealB) return -1;
      if (!isRealA && isRealB) return 1;

      const rankA = ranking.indexOf(a.provider);
      const rankB = ranking.indexOf(b.provider);
      const posA = rankA === -1 ? 999 : rankA;
      const posB = rankB === -1 ? 999 : rankB;
      return posA - posB;
    });

    const chosen = candidates[0];
    mergedVitals[vitalKey] = chosen.value;
    mergedMetadata[vitalKey] = chosen.metadata;
    sources[vitalKey] = chosen.provider;
  }

  // Disagreement Detection (Section 4.2)
  const vitalDisagreements = [];

  // Heart Rate Disagreement Check
  if (collectedReadingsByVital.heartRate?.length >= 2) {
    const readings = collectedReadingsByVital.heartRate;
    const hrValues = readings.map((r) => r.value);
    const maxHr = Math.max(...hrValues);
    const minHr = Math.min(...hrValues);
    const diff = maxHr - minHr;

    if (diff > 15) {
      const pNames = readings.map((r) => `${r.provider} (${r.value} bpm)`).join(' vs ');
      vitalDisagreements.push({
        vital: 'heartRate',
        diff,
        message: `Heart rate variance of ${diff} bpm detected across devices: ${pNames}. Verify sensor fit or proper placement.`,
      });
    }
  }

  // SpO2 Disagreement Check
  if (collectedReadingsByVital.spo2?.length >= 2) {
    const readings = collectedReadingsByVital.spo2;
    const spo2Values = readings.map((r) => r.value);
    const maxSpO2 = Math.max(...spo2Values);
    const minSpO2 = Math.min(...spo2Values);
    const diff = maxSpO2 - minSpO2;

    if (diff > 3) {
      const pNames = readings.map((r) => `${r.provider} (${r.value}%)`).join(' vs ');
      vitalDisagreements.push({
        vital: 'spo2',
        diff,
        message: `Oxygen saturation variance of ${diff}% detected across devices: ${pNames}.`,
      });
    }
  }

  // Tag as demo reading if all active providers are in demo mode
  const isDemoReading = activeProviders.every((cp) => cp.isDemoMode);

  await AuditLog.logEvent({
    action: 'WEARABLE_SYNC_EXECUTED',
    userId: patient.userId,
    role: 'patient',
    details: {
      patientId: patient._id,
      providers: activeProviders.map((cp) => cp.provider),
      isDemoReading,
      vitalsFound: Object.keys(sources),
      disagreementsCount: vitalDisagreements.length,
    },
  });

  return {
    vitals: mergedVitals,
    vitalMetadata: mergedMetadata,
    sources,
    vitalDisagreements,
    isDemoReading,
    connectedCount: activeProviders.length,
    providers: activeProviders.map((cp) => cp.provider),
    bodyMetrics: {
      weightKg: patient.weightKg || null,
      heightCm: patient.heightCm || null,
    },
    deviceReadings: successfulReadings.map((s) => ({
      provider: s.provider,
      deviceInfo: s.reading?.deviceInfo,
      normalized: s.reading?.normalized,
    })),
    errors: providerErrors.length > 0 ? providerErrors : undefined,
    timestamp: new Date().toISOString(),
    message:
      successfulReadings.length > 0
        ? `Successfully fetched and synchronized telemetry from ${successfulReadings.map((r) => r.provider).join(' and ')}.`
        : 'Could not retrieve readings from connected providers.',
  };
}

export default {
  getAdapter,
  getPatientWearableStatus,
  getOAuthAuthorizeUrl,
  connectProvider,
  connectDemoProvider,
  disconnectProvider,
  syncPatientReadings,
};
