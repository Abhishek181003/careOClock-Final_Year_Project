/**
 * CareOClock — Provider-Agnostic Wearable Adapter Base Interface
 *
 * All third-party wearable provider adapters (Oura, Withings, Google Health)
 * MUST implement this standard contract. Layer 1 and Layer 2 clinical AI engines
 * NEVER need to know which provider a reading came from.
 */

export class WearableAdapter {
  constructor(config = {}) {
    this.provider = config.provider || 'unknown';
    this.clientId = config.clientId || null;
    this.clientSecret = config.clientSecret || null;
    this.redirectUri = config.redirectUri || null;
  }

  /**
   * Generates the provider's OAuth2 authorization URL
   * @param {string} state - Cryptographically signed CSRF state token
   * @returns {string} Fully-formed authorization URL
   */
  getAuthorizationUrl(_state) {
    throw new Error(`getAuthorizationUrl() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Exchanges an OAuth authorization code for tokens
   * @param {Object} params
   * @param {string} params.code - Authorization code from callback
   * @param {string} [params.redirectUri] - Redirect URI matching authorization
   * @returns {Promise<{ accessToken: string, refreshToken?: string, expiresIn?: number, providerUserId?: string, scope?: string, deviceInfo?: object }>}
   */
  async connect(_params) {
    throw new Error(`connect() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Refreshes an expired access token using the stored refresh token
   * @param {string} _refreshToken - Plaintext decrypted refresh token
   * @returns {Promise<{ accessToken: string, refreshToken?: string, expiresIn?: number }>}
   */
  async refreshToken(_refreshToken) {
    throw new Error(`refreshToken() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Revokes third-party access token on the provider's upstream servers
   * @param {Object} params
   * @param {string} params.accessToken
   * @param {string} [params.refreshToken]
   * @returns {Promise<{ revoked: boolean }>}
   */
  async revokeToken(_params) {
    throw new Error(`revokeToken() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Fetches latest physiological telemetry from the provider
   * @param {Object} params
   * @param {string} params.accessToken - Active decrypted access token
   * @param {string} [params.providerUserId] - Provider's internal user identifier
   * @param {boolean} [params.isDemoMode] - Whether to return synthetic sandbox telemetry
   * @param {Object} [params.deviceInfo] - Connected device metadata (model, etc.)
   * @returns {Promise<{ normalized: object, vitalMetadata: object, raw: object, recordedAt: Date, deviceInfo: object }>}
   */
  async fetchLatestReadings(_params) {
    throw new Error(`fetchLatestReadings() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Returns list of vital parameters supported by this provider for the specific connected device
   * @param {Object} [deviceInfo] - Specific hardware model (e.g. 'BPM Connect' vs 'ScanWatch')
   * @returns {string[]} Supported canonical keys
   */
  getCapabilities(_deviceInfo = null) {
    throw new Error(`getCapabilities() must be implemented by ${this.constructor.name}`);
  }
}

export default WearableAdapter;
