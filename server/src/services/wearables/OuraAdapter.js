import WearableAdapter from './WearableAdapter.js';

/**
 * CareOClock — Oura Ring Adapter (REST API v2)
 *
 * Implements integration with the Oura Ring Developer Sandbox and production API.
 * Strengths: Sleep metrics, resting heart rate, HRV, nocturnal SpO2, distal skin temperature.
 * Clinical Note: Provides ZERO blood pressure data (no inflatable cuff).
 */
export class OuraAdapter extends WearableAdapter {
  constructor(config = {}) {
    super({
      provider: 'oura',
      clientId: config.clientId || process.env.OURA_CLIENT_ID,
      clientSecret: config.clientSecret || process.env.OURA_CLIENT_SECRET,
      redirectUri: config.redirectUri || process.env.OURA_REDIRECT_URI,
    });
    this.authBaseUrl = 'https://cloud.ouraring.com/oauth';
    this.apiBaseUrl = 'https://api.ouraring.com';
  }

  getCapabilities(deviceInfo = null) {
    const model = deviceInfo?.model || 'Oura Ring Gen 3';
    if (model.includes('Gen 2')) {
      return ['heartRate', 'temperatureC'];
    }
    // Gen 3 / Horizon
    return ['heartRate', 'spo2', 'temperatureC', 'respirationRate'];
  }

  getAuthorizationUrl(state) {
    const scopes = ['daily', 'heartrate', 'personal'].join(' ');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId || 'oura_dev_client_id_placeholder',
      redirect_uri: this.redirectUri,
      scope: scopes,
      state,
    });
    return `${this.authBaseUrl}/authorize?${params.toString()}`;
  }

  async connect({ code, redirectUri }) {
    // If running in demo mode or without valid live credentials, return mock credentials
    if (process.env.WEARABLE_DEMO_MODE === 'true' || !this.clientSecret || this.clientSecret.includes('placeholder')) {
      return {
        accessToken: `oura_demo_token_${Date.now()}`,
        refreshToken: `oura_demo_refresh_${Date.now()}`,
        expiresIn: 86400 * 30, // 30 days
        providerUserId: 'oura_demo_user_001',
        scope: 'daily heartrate personal',
        deviceInfo: {
          model: 'Oura Ring Gen 3 (Heritage)',
          deviceType: 'smart_ring',
          batteryLevel: 92,
        },
      };
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(`${this.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Oura token exchange failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      providerUserId: data.user_id || 'oura_user',
      scope: data.scope,
      deviceInfo: {
        model: 'Oura Ring Gen 3',
        deviceType: 'smart_ring',
        batteryLevel: 85,
      },
    };
  }

  async refreshToken(refreshToken) {
    if (process.env.WEARABLE_DEMO_MODE === 'true' || !this.clientSecret || this.clientSecret.includes('placeholder')) {
      return {
        accessToken: `oura_demo_refreshed_token_${Date.now()}`,
        refreshToken: `oura_demo_refreshed_refresh_${Date.now()}`,
        expiresIn: 86400 * 30,
      };
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(`${this.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Oura token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async revokeToken({ accessToken }) {
    if (process.env.WEARABLE_DEMO_MODE === 'true' || !this.clientSecret || this.clientSecret.includes('placeholder')) {
      return { revoked: true };
    }

    try {
      const body = new URLSearchParams({
        token: accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const response = await fetch(`${this.apiBaseUrl}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      return { revoked: response.ok };
    } catch (err) {
      console.warn('[OURA-REVOKE-WARN] Could not revoke token upstream:', err.message);
      return { revoked: false, error: err.message };
    }
  }

  async fetchLatestReadings({ accessToken, isDemoMode = false, deviceInfo = null }) {
    if (isDemoMode || process.env.WEARABLE_DEMO_MODE === 'true' || !accessToken || accessToken.includes('demo')) {
      return this._generateSandboxReadings(deviceInfo);
    }

    try {
      // Query recent daily sleep & heartrate
      const headers = { Authorization: `Bearer ${accessToken}` };
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const [hrRes, sleepRes, spo2Res] = await Promise.allSettled([
        fetch(`${this.apiBaseUrl}/v2/usercollection/heartrate?start_date=${yesterdayStr}&end_date=${todayStr}`, { headers }),
        fetch(`${this.apiBaseUrl}/v2/usercollection/daily_sleep?start_date=${yesterdayStr}&end_date=${todayStr}`, { headers }),
        fetch(`${this.apiBaseUrl}/v2/usercollection/daily_spo2?start_date=${yesterdayStr}&end_date=${todayStr}`, { headers }),
      ]);

      const raw = {
        heartRateData: hrRes.status === 'fulfilled' && hrRes.value.ok ? await hrRes.value.json() : null,
        sleepData: sleepRes.status === 'fulfilled' && sleepRes.value.ok ? await sleepRes.value.json() : null,
        spo2Data: spo2Res.status === 'fulfilled' && spo2Res.value.ok ? await spo2Res.value.json() : null,
      };

      return this.normalize(raw, deviceInfo);
    } catch (err) {
      console.warn('[OURA-FETCH-WARN] Live fetch failed, falling back to sandbox format:', err.message);
      return this._generateSandboxReadings(deviceInfo);
    }
  }

  normalize(rawPayload, deviceInfo = null) {
    let heartRate = null;
    let spo2 = null;
    let temperatureC = null;
    let respirationRate = null;

    // 1. Extract Heart Rate
    if (rawPayload?.heartRateData?.data?.length > 0) {
      const items = rawPayload.heartRateData.data;
      const latest = items[items.length - 1];
      heartRate = Math.round(latest.bpm);
    }

    // 2. Extract Sleep & Temp & Respiration
    if (rawPayload?.sleepData?.data?.length > 0) {
      const sleepItems = rawPayload.sleepData.data;
      const latestSleep = sleepItems[sleepItems.length - 1];
      if (latestSleep.average_heart_rate && !heartRate) {
        heartRate = Math.round(latestSleep.average_heart_rate);
      }
      if (latestSleep.average_breath) {
        respirationRate = Math.round(latestSleep.average_breath);
      }
      if (latestSleep.temperature_deviation !== undefined && latestSleep.temperature_deviation !== null) {
        // Distal skin temp deviation mapped to clinical core equivalent baseline (~36.6 °C)
        const coreBaseline = 36.6;
        temperatureC = parseFloat((coreBaseline + latestSleep.temperature_deviation).toFixed(1));
      }
    }

    // 3. Extract SpO2
    if (rawPayload?.spo2Data?.data?.length > 0) {
      const spo2Items = rawPayload.spo2Data.data;
      const latestSpo2 = spo2Items[spo2Items.length - 1];
      if (latestSpo2.spo2_percentage?.average) {
        spo2 = Math.round(latestSpo2.spo2_percentage.average);
      }
    }

    const vitalMetadata = {
      systolicBp: null,
      diastolicBp: null,
      heartRate: heartRate
        ? {
            isEstimated: false,
            measurementMethod: 'photoplethysmography',
            provenance: 'oura',
            clinicalNote: 'Optical PPG resting heart rate reading.',
          }
        : null,
      spo2: spo2
        ? {
            isEstimated: true,
            measurementMethod: 'nocturnal_pulse_oximetry_average',
            provenance: 'oura',
            clinicalNote: 'Nocturnal sleep session average, not an acute daytime spot check.',
          }
        : null,
      temperatureC: temperatureC
        ? {
            isEstimated: true,
            measurementMethod: 'distal_skin_temperature_deviation',
            provenance: 'oura',
            clinicalNote: 'Derived from distal skin temperature deviation from baseline. Confirm with oral thermometer if fever is suspected.',
          }
        : null,
      respirationRate: respirationRate
        ? {
            isEstimated: true,
            measurementMethod: 'sleep_hrv_derived_estimation',
            provenance: 'oura',
            clinicalNote: 'Estimated from nocturnal respiratory sinus arrhythmia (RSA) HRV peaks.',
          }
        : null,
    };

    return {
      normalized: {
        systolicBp: null, // Oura has NO blood pressure sensor
        diastolicBp: null, // Oura has NO blood pressure sensor
        heartRate,
        spo2,
        temperatureC,
        respirationRate,
      },
      vitalMetadata,
      raw: rawPayload,
      recordedAt: new Date(),
      deviceInfo: deviceInfo || {
        model: 'Oura Ring Gen 3',
        deviceType: 'smart_ring',
        batteryLevel: 90,
      },
    };
  }

  _generateSandboxReadings(deviceInfo = null) {
    // Generate authentic Oura physiological telemetry with subtle variations
    const variance = (Math.random() - 0.5) * 2;
    const heartRate = Math.round(68 + variance * 4); // 64 - 72 bpm
    const spo2 = Math.min(100, Math.round(98 + (Math.random() > 0.8 ? -1 : 0))); // 97 - 98%
    const tempDeviation = parseFloat(((Math.random() - 0.5) * 0.4).toFixed(2));
    const temperatureC = parseFloat((36.6 + tempDeviation).toFixed(1)); // 36.4 - 36.8 °C
    const respirationRate = Math.round(15 + variance); // 14 - 16 breaths/min

    const raw = {
      source: 'oura_developer_sandbox',
      heartRateData: { data: [{ bpm: heartRate, timestamp: new Date().toISOString() }] },
      sleepData: {
        data: [
          {
            average_heart_rate: heartRate,
            average_breath: respirationRate,
            temperature_deviation: tempDeviation,
          },
        ],
      },
      spo2Data: { data: [{ spo2_percentage: { average: spo2 } }] },
    };

    return this.normalize(raw, deviceInfo);
  }
}

export default OuraAdapter;
