/**
 * AI Engine Microservice Client
 * Handles concurrent evaluation of Layer 1 (NEWS2 rule engine) and Layer 2 (Isolation Forest).
 *
 * Implements:
 * - H-1 Single-pass concurrency (Promise.allSettled)
 * - H-2 Timeout / Outage detection (layer2Failed)
 * - H-4 Internal service key authorization (X-Internal-Service-Key)
 * - NFR2 Round-trip latency profiling (< 800ms budget)
 */

import { logAiPerformance } from '../middleware/timingLogger.js';

const getAiServiceUrl = () => process.env.AI_SERVICE_URL || 'http://localhost:8000';
const getAiEngineInternalKey = () =>
  process.env.AI_ENGINE_INTERNAL_KEY || 'careoclock-internal-secret-key-dev';

/**
 * Helper to fetch with an AbortController timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 600) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Score single vitals reading through Layer 1 (Modified Home-NEWS)
 */
export async function scoreLayer1(reading) {
  const payload = {
    patientId: reading.patientId?.toString(),
    recordedAt: reading.recordedAt ? new Date(reading.recordedAt).toISOString() : new Date().toISOString(),
    slot: reading.slot || 'morning',
    source: reading.source || 'manual',
    systolicBp: reading.systolicBp,
    diastolicBp: reading.diastolicBp,
    heartRate: reading.heartRate,
    spo2: reading.spo2,
    temperatureC: reading.temperatureC,
    respirationRate: reading.respirationRate ?? null,
    spo2Scale: reading.spo2Scale ?? (reading.hasCopdOrHypercapnia ? 2 : 1),
    onSupplementalOxygen: reading.onSupplementalOxygen ?? false,
    hasCopdOrHypercapnia: reading.hasCopdOrHypercapnia ?? (reading.spo2Scale === 2),
    requestingRole: reading.requestingRole || (reading.enteredByRole || 'patient'),
    symptomFlags: reading.symptomFlags || [],
    adherenceRate7d:
      reading.adherenceRate7d != null
        ? reading.adherenceRate7d > 1
          ? reading.adherenceRate7d / 100
          : reading.adherenceRate7d
        : null,
  };

  const res = await fetchWithTimeout(
    `${getAiServiceUrl()}/api/v1/score/layer1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': getAiEngineInternalKey(),
      },
      body: JSON.stringify(payload),
    },
    450
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Layer 1 scoring failed with HTTP ${res.status}: ${JSON.stringify(errorData.detail || errorData)}`
    );
  }

  return await res.json();
}

/**
 * Score incoming reading against patient rolling baseline through Layer 2
 */
export async function scoreLayer2(patientId, reading, history = []) {
  const formattedHistory = (history || []).map((h) => ({
    patientId: h.patientId?.toString() || patientId.toString(),
    recordedAt: new Date(h.recordedAt).toISOString(),
    slot: h.slot || 'morning',
    systolicBp: h.systolicBp,
    diastolicBp: h.diastolicBp,
    heartRate: h.heartRate,
    spo2: h.spo2,
    temperatureC: h.temperatureC,
    respirationRate: h.respirationRate ?? null,
  }));

  const currentPayload = {
    patientId: patientId.toString(),
    recordedAt: reading.recordedAt ? new Date(reading.recordedAt).toISOString() : new Date().toISOString(),
    slot: reading.slot || 'morning',
    source: reading.source || 'manual',
    systolicBp: reading.systolicBp,
    diastolicBp: reading.diastolicBp,
    heartRate: reading.heartRate,
    spo2: reading.spo2,
    temperatureC: reading.temperatureC,
    respirationRate: reading.respirationRate ?? null,
    requestingRole: reading.requestingRole || (reading.enteredByRole || 'patient'),
  };

  const currentDate = new Date(reading.recordedAt || Date.now()).toISOString().split('T')[0];

  const payload = {
    patientId: patientId.toString(),
    history: formattedHistory,
    currentReading: currentPayload,
    currentDate,
  };

  // Strict 500ms abort budget for Layer 2 (A-9 / NFR2)
  const res = await fetchWithTimeout(
    `${getAiServiceUrl()}/api/v1/score/layer2`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': getAiEngineInternalKey(),
      },
      body: JSON.stringify(payload),
    },
    500
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Layer 2 scoring failed with HTTP ${res.status}: ${JSON.stringify(errorData.detail || errorData)}`
    );
  }

  return await res.json();
}

/**
 * High-performance concurrent evaluation (H-1)
 * Evaluates Layer 1 and Layer 2 in parallel via Promise.allSettled to avoid
 * sequential latency stacking.
 */
export async function evaluateVitals(patientId, reading, history = []) {
  const start = process.hrtime.bigint();

  const [l1Result, l2Result] = await Promise.allSettled([
    scoreLayer1(reading),
    scoreLayer2(patientId, reading, history),
  ]);

  const end = process.hrtime.bigint();
  const networkLatencyMs = Math.round(Number(end - start) / 1e6);

  logAiPerformance(networkLatencyMs, { patientId });

  return {
    layer1: l1Result.status === 'fulfilled' ? l1Result.value : null,
    layer1Error: l1Result.status === 'rejected' ? l1Result.reason?.message : null,
    layer2: l2Result.status === 'fulfilled' ? l2Result.value : null,
    layer2Failed: l2Result.status === 'rejected', // Distinguishes timeout/outage from cold-start (H-2)
    layer2Error: l2Result.status === 'rejected' ? l2Result.reason?.message : null,
    networkLatencyMs,
  };
}
