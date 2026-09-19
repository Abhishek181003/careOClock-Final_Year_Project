import crypto from 'crypto';

/**
 * CareOClock — At-Rest Token Encryption Utility (AES-256-GCM)
 *
 * Implements authenticated field-level encryption for OAuth access and refresh tokens
 * to comply with India DPDP Act / Rules 2025 and satisfy audit security mandates.
 *
 * Structure of encrypted payload string:
 *   `<hex(iv)>:<hex(authTag)>:<hex(ciphertext)>`
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits authentication tag

/**
 * Derives a deterministic 256-bit encryption key.
 * Prioritizes TOKEN_ENCRYPTION_KEY from environment; falls back to SHA-256 HKDF from JWT_SECRET.
 * @returns {Buffer} 32-byte key buffer
 */
function getEncryptionKey() {
  const customKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (customKey && customKey.length >= 32) {
    return Buffer.from(crypto.createHash('sha256').update(customKey).digest());
  }

  const jwtSecret = process.env.JWT_SECRET || 'careoclock-default-fallback-encryption-key-32b';
  return Buffer.from(crypto.createHash('sha256').update(`${jwtSecret}:token-encryption-salt`).digest());
}

/**
 * Encrypt a plaintext token string with AES-256-GCM
 * @param {string} plaintext - Raw token string
 * @returns {string} Encrypted string in format "iv:authTag:ciphertext"
 */
export function encryptToken(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an AES-256-GCM encrypted token string
 * @param {string} encryptedString - String in format "iv:authTag:ciphertext"
 * @returns {string} Decrypted plaintext token
 */
export function decryptToken(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    return encryptedString;
  }

  // If not in encrypted format (e.g. legacy or unencrypted string), return as is
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    return encryptedString;
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  // Validate hex formatting
  if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]*$/.test(ciphertextHex)) {
    return encryptedString;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
      return encryptedString;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[TOKEN-DECRYPTION-FAIL] Could not decrypt stored token:', err.message);
    throw new Error('Authentication token decryption failed. Credentials may be corrupted.');
  }
}
