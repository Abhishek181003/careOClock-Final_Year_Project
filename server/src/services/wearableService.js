/**
 * CareOClock — Wearable Integration Service (Phase 11 Architectural Placeholder)
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL MANDATE: NFR4 Compliance (Zero-Wearable Independence)
 * ════════════════════════════════════════════════════════════════════════════════
 * Non-Functional Requirement 4 (NFR4) dictates:
 * "Universal manual entry fallback; never dependent on wearable hardware."
 *
 * The Core System (Phases 1 through 10) must operate with 100% feature completeness
 * and zero reliance on external sensors, Bluetooth low energy (BLE), or third-party
 * wearable cloud endpoints.
 *
 * In Phase 11 ("Wearable Integration"), this module will implement the pluggable
 * `WearableProvider` adapter interface wired to the Oura Developer Sandbox
 * (or Apple HealthKit / Google Health Connect REST APIs).
 *
 * Incoming wearable sync events will populate the same `vitals` collection with
 * `source: 'oauth'` instead of `source: 'manual'`.
 *
 * AT NO POINT will manual vitals entry be blocked or altered by wearable status.
 */

/**
 * Check if a patient has an active wearable provider linked.
 * In Phase 3, this always returns false (no wearables connected).
 *
 * @param {string} patientId - MongoDB ObjectId of the patient
 * @returns {Promise<{ isConnected: boolean, provider: string|null, message: string }>}
 */
export async function checkWearableConnectionStatus(_patientId) {
  // Phase 11 placeholder hook
  return {
    isConnected: false,
    provider: null,
    message:
      'Zero external wearables connected. Manual vitals entry is fully active (NFR4 compliant).',
    phase: 11,
    targetProvider: 'oura-sandbox',
  };
}

/**
 * Placeholder synchronization hook for wearable auto-fill integration.
 *
 * @param {string} patientId - MongoDB ObjectId of the patient
 * @param {string} [provider='oura'] - Target wearable provider
 * @returns {Promise<{ success: boolean, syncedCount: number, message: string }>}
 */
export async function syncWearableVitalsPlaceholder(patientId, provider = 'oura') {
  // PHASE 11 HOOK: In Phase 11, this function will execute OAuth token refresh,
  // call Oura API v2 (/v2/usercollection/daily_activity, /v2/usercollection/heart_rate),
  // and map incoming JSON payloads to the Vitals schema.

  return {
    success: false,
    syncedCount: 0,
    message:
      'Wearable auto-sync is scheduled for Phase 11. Manual entry remains the primary, universal system path.',
    provider,
    patientId,
    timestamp: new Date().toISOString(),
  };
}

export default {
  checkWearableConnectionStatus,
  syncWearableVitalsPlaceholder,
};
