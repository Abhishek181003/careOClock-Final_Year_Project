/**
 * CareOClock — Frontend Wearable Integration Service (Phase 11 Placeholder)
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * NON-FUNCTIONAL REQUIREMENT 4 (NFR4) MANDATE:
 * "Universal manual entry fallback; never dependent on wearable hardware."
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * The manual entry form must work 100% independently at all times without requiring
 * paired smartwatches, Bluetooth Low Energy (BLE) peripherals, or third-party cloud
 * tokens.
 *
 * This service acts as an architectural hook for Phase 11 ("Wearable Integration"),
 * where CareOClock will integrate the Oura Developer Sandbox REST API.
 */

/**
 * Returns the current wearable connectivity status.
 * In Phase 3, this always reflects that NO wearable hardware is connected or required.
 */
export function getWearableConnectionStatus() {
  return {
    isConnected: false,
    provider: null,
    phase: 11,
    statusText: 'No wearable connected (NFR4: Manual entry is 100% autonomous)',
  };
}

/**
 * PHASE 11 HOOK:
 * Simulates fetching recent biometric readings from an external wearable device
 * (e.g. Oura Ring Generation 3 or Apple HealthKit sync).
 *
 * In Phase 3, this function provides a demonstration auto-fill mechanism
 * so architects and evaluators can verify how Phase 11 will feed the manual form
 * for patient review and override, without needing real hardware.
 *
 * @param {string} provider - 'oura' | 'apple_health'
 * @returns {Promise<{ vitals: object, provider: string, timestamp: string }>}
 */
export async function simulateWearableSyncPlaceholder(provider = 'oura') {
  // Artificial brief latency to simulate provider API round-trip
  await new Promise((resolve) => setTimeout(resolve, 650));

  const now = new Date();
  const currentHour = now.getHours();
  const slot = currentHour < 14 ? 'morning' : 'evening';

  return {
    provider: `${provider}-sandbox-preview`,
    source: 'oauth',
    slot,
    vitals: {
      systolicBp: 122,
      diastolicBp: 78,
      heartRate: 68,
      spo2: 98,
      temperatureC: 36.6,
      respirationRate: 15,
      notes: `Auto-populated from ${provider.toUpperCase()} sandbox hook (Phase 11 Preview). Patient verified.`,
    },
    message: 'Wearable data loaded into form for review. You may edit any field before submitting.',
  };
}
