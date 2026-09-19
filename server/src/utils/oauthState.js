import crypto from 'crypto';

/**
 * CareOClock — OAuth State CSRF Protection Utility
 *
 * Generates and cryptographically verifies HMAC-signed state tokens to prevent
 * OAuth account-linking CSRF attacks (binding state strictly to patient session).
 */

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes validity

function getHmacSecret() {
  return process.env.JWT_SECRET || 'careoclock-default-fallback-encryption-key-32b';
}

/**
 * Generates a signed OAuth state token
 * @param {Object} params
 * @param {string} params.patientId - The authenticated patient's ID
 * @param {string} params.provider - The target wearable provider ('oura' | 'withings' | 'google_health')
 * @returns {string} Base64URL-encoded signed state string
 */
export function createOAuthState({ patientId, provider }) {
  if (!patientId || !provider) {
    throw new Error('patientId and provider are required to generate OAuth state');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const expiresAt = issuedAt + STATE_TTL_MS;

  const payload = {
    patientId: patientId.toString(),
    provider,
    nonce,
    issuedAt,
    expiresAt,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');

  const signature = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('hex');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a signed OAuth state token
 * @param {string} stateString - The received state token
 * @param {string} [expectedPatientId] - The authenticated patient's ID (optional if session matched later)
 * @param {string} [expectedProvider] - The provider for which callback was invoked
 * @returns {Object} Decoded state payload
 */
export function verifyOAuthState(stateString, expectedPatientId = null, expectedProvider = null) {
  if (!stateString || typeof stateString !== 'string') {
    throw new Error('Missing or invalid OAuth state parameter.');
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed OAuth state parameter.');
  }

  const [payloadB64, receivedSig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('hex');

  // Timing-safe signature check
  const sigBufferA = Buffer.from(receivedSig, 'hex');
  const sigBufferB = Buffer.from(expectedSig, 'hex');

  if (sigBufferA.length !== sigBufferB.length || !crypto.timingSafeEqual(sigBufferA, sigBufferB)) {
    throw new Error('OAuth state CSRF signature verification failed. Untrusted state parameter.');
  }

  let payload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error('Could not parse OAuth state payload.');
  }

  // Check expiration
  if (!payload.expiresAt || Date.now() > payload.expiresAt) {
    throw new Error('OAuth state has expired. Please initiate connection again.');
  }

  // Check expected provider
  if (expectedProvider && payload.provider !== expectedProvider) {
    throw new Error(`OAuth state provider mismatch: expected ${expectedProvider}, got ${payload.provider}`);
  }

  // Check expected patient
  if (expectedPatientId && payload.patientId !== expectedPatientId.toString()) {
    throw new Error('OAuth state patient mismatch: state was initiated by a different account (account-linking CSRF detected).');
  }

  return payload;
}
