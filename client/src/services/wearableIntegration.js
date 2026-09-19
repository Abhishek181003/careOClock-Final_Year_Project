/**
 * CareOClock — Frontend Wearable Integration Service (Phase 11)
 *
 * Provides client-side methods to communicate with CareOClock's
 * provider-agnostic wearable sync layer (/api/wearables).
 *
 * Adheres to Non-Functional Requirement 4 (NFR4):
 * "Universal manual entry fallback; never dependent on wearable hardware."
 */

const API_BASE = '/api/wearables';

function getAuthHeaders(token) {
  const authToken = token || localStorage.getItem('careoclock_token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

/**
 * Fetch the current patient's connected wearable status & capabilities
 * @param {string} [token]
 * @param {string} [patientId] - Optional patientId for doctor/caregiver query
 * @returns {Promise<Object>}
 */
export async function fetchWearablesStatus(token, patientId = '') {
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
  const response = await fetch(`${API_BASE}/status${query}`, {
    method: 'GET',
    headers: getAuthHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch wearable connection status.');
  }

  return data;
}

/**
 * Fetch OAuth authorization redirect URL for a given provider
 * @param {string} provider - 'oura' | 'withings' | 'google_health'
 * @param {string} [token]
 * @returns {Promise<string>} authUrl
 */
export async function getOAuthAuthorizeUrl(provider, token) {
  const response = await fetch(`${API_BASE}/${provider}/auth-url`, {
    method: 'GET',
    headers: getAuthHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to generate auth URL for ${provider}.`);
  }

  return data.authUrl;
}

/**
 * Connect a wearable provider in 1-click Sandbox / Demo Mode
 * @param {string} provider - 'oura' | 'withings' | 'google_health'
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function connectDemoWearable(provider, token) {
  const response = await fetch(`${API_BASE}/${provider}/connect-demo`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to connect ${provider} in demo mode.`);
  }

  return data;
}

/**
 * Disconnect a wearable provider and revoke upstream access
 * @param {string} provider - 'oura' | 'withings' | 'google_health'
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function disconnectWearable(provider, token) {
  const response = await fetch(`${API_BASE}/${provider}/disconnect`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to disconnect ${provider}.`);
  }

  return data;
}

/**
 * Synchronize and fetch latest merged telemetry from all connected wearables
 * @param {string} [token]
 * @param {string} [patientId]
 * @returns {Promise<Object>} { vitals, vitalMetadata, sources, vitalDisagreements, isDemoReading }
 */
export async function fetchWearablesLatestReadings(token, patientId = '') {
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
  const response = await fetch(`${API_BASE}/latest-readings${query}`, {
    method: 'GET',
    headers: getAuthHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to sync wearable telemetry.');
  }

  return data;
}

/**
 * Legacy fallback helper for demo testing when no hardware is linked
 */
export async function simulateWearableSyncPlaceholder(provider = 'oura') {
  return {
    provider: `${provider}-sandbox`,
    source: 'wearable',
    slot: new Date().getHours() < 14 ? 'morning' : 'evening',
    vitals: {
      systolicBp: 122,
      diastolicBp: 78,
      heartRate: 68,
      spo2: 98,
      temperatureC: 36.6,
      respirationRate: 15,
      notes: `Auto-populated from ${provider.toUpperCase()} sandbox telemetry. Patient verified.`,
    },
    message: 'Wearable data loaded into form for review. You may edit any field before submitting.',
  };
}
