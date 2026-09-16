/**
 * CareOClock — Clinical Vitals API Client
 */

const API_BASE = '/api/clinical';

/**
 * Submit a manual or wearable vitals reading.
 * @param {object} payload - Vitals reading object
 * @param {string} token - JWT authentication token
 * @returns {Promise<object>}
 */
export async function submitVitals(payload, token) {
  const authToken = token || localStorage.getItem('careoclock_token');
  const response = await fetch(`${API_BASE}/vitals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data.details
      ? data.details.map((d) => d.message).join(' | ')
      : data.error || 'Failed to submit vitals reading';
    const err = new Error(errorMsg);
    err.status = response.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

/**
 * Fetch vitals history for the authenticated user or assigned patient.
 * @param {string} token - JWT authentication token
 * @param {string} [patientId] - Optional patientId (for doctor query)
 * @returns {Promise<object>}
 */
export async function fetchVitalsHistory(token, patientId = '') {
  const authToken = token || localStorage.getItem('careoclock_token');
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
  const response = await fetch(`${API_BASE}/vitals${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.error || 'Failed to retrieve vitals history');
    err.status = response.status;
    throw err;
  }

  return data;
}
