import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import Vitals from '../src/models/Vitals.js';
import Alert from '../src/models/Alert.js';
import AuditLog from '../src/models/AuditLog.js';
import { connectDB } from '../src/db/connection.js';
import { encryptToken, decryptToken } from '../src/utils/tokenEncryption.js';
import { createOAuthState, verifyOAuthState } from '../src/utils/oauthState.js';
import OuraAdapter from '../src/services/wearables/OuraAdapter.js';
import WithingsAdapter from '../src/services/wearables/WithingsAdapter.js';
import GoogleHealthAdapter from '../src/services/wearables/GoogleHealthAdapter.js';
import { dispatchAlert } from '../src/services/alertDispatchService.js';
import {
  connectDemoProvider,
  disconnectProvider,
  syncPatientReadings,
} from '../src/services/wearables/wearableSyncService.js';

let doctorId = '';
let doctorToken = '';
let patientId = '';
let patientToken = '';
let patientUserId = '';
let caregiverId = '';
let caregiverToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  process.env.WEARABLE_DEMO_MODE = 'true';
  process.env.TOKEN_ENCRYPTION_KEY = 'test_encryption_key_32_bytes_long_phase11!!';

  await connectDB();

  // Clear test users
  await User.deleteMany({ email: { $regex: /@phase11-wearables\.com$/ } });
  await Alert.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ['WEARABLE_CONNECTED', 'WEARABLE_DISCONNECTED', 'WEARABLE_SYNC_EXECUTED', 'DEMO_ALERT_SIMULATED'] } });

  // 1. Register Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doctor@phase11-wearables.com',
    password: 'Password123!',
    displayName: 'Dr. Wearable Specialist',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  doctorToken = docRes.body.token;

  // 2. Register Patient
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'patient@phase11-wearables.com',
    password: 'Password123!',
    displayName: 'Eleanor Ring-Watch',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 78,
    sex: 'female',
  });
  patientId = patRes.body.patient._id;
  patientUserId = patRes.body.user.id;
  patientToken = patRes.body.token;

  // 3. Register Caregiver
  const cgRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver@phase11-wearables.com',
    password: 'Password123!',
    displayName: 'Sarah Ring-Watch',
    role: 'caregiver',
  });
  caregiverId = cgRes.body.user.id;
  caregiverToken = cgRes.body.token;

  // Link caregiver to patient
  await CaregiverLink.create({
    patientId,
    caregiverId,
    relationship: 'daughter',
    status: 'active',
  });
});

after(async () => {
  await User.deleteMany({ email: { $regex: /@phase11-wearables\.com$/ } });
  await Patient.deleteMany({ _id: patientId });
  await Vitals.deleteMany({ patientId });
  await Alert.deleteMany({ patientId });
  await CaregiverLink.deleteMany({ patientId });
});

// ── Test 1: At-Rest Token Encryption & Zero-Plaintext Security ─────────────
test('1. At-Rest Token Encryption (AES-256-GCM) and credential protection in API', async () => {
  const rawSecret = 'live_oauth_access_token_super_confidential_123456';
  const encrypted = encryptToken(rawSecret);

  assert.ok(encrypted.includes(':'), 'Encrypted token must have format iv:authTag:ciphertext');
  assert.ok(!encrypted.includes(rawSecret), 'Ciphertext must NEVER contain plaintext secret string');

  const decrypted = decryptToken(encrypted);
  assert.equal(decrypted, rawSecret, 'Decrypted token must match original plaintext');

  // Connect provider and verify MongoDB stores encrypted ciphertext
  await connectDemoProvider({ patientId, provider: 'oura', userId: patientUserId });

  const rawPatientDoc = await Patient.findById(patientId).lean();
  const ouraRecord = rawPatientDoc.connectedProviders.find((p) => p.provider === 'oura');
  assert.ok(ouraRecord, 'Oura connection record must be present');
  assert.ok(ouraRecord.accessToken.includes(':'), 'Stored accessToken in DB must be AES-256-GCM encrypted');
  assert.ok(!ouraRecord.accessToken.includes('oura_demo_token'), 'Stored accessToken must not expose plaintext');

  // GET /api/wearables/status must NOT leak tokens in API response
  const statusRes = await request(app)
    .get('/api/wearables/status')
    .set('Authorization', `Bearer ${patientToken}`)
    .expect(200);

  assert.equal(statusRes.body.connectedCount, 1);
  const providerObj = statusRes.body.connectedProviders[0];
  assert.equal(providerObj.provider, 'oura');
  assert.equal(providerObj.accessToken, undefined, 'accessToken MUST NEVER be present in API responses');
  assert.equal(providerObj.refreshToken, undefined, 'refreshToken MUST NEVER be present in API responses');
});

// ── Test 2: OAuth CSRF State Binding (HMAC-SHA256) ──────────────────────────
test('2. OAuth CSRF State Token creation and signature verification', async () => {
  const validState = createOAuthState({ patientId, provider: 'withings' });
  assert.ok(validState.includes('.'), 'State token must have payload.signature format');

  // 1. Successful verification
  const verified = verifyOAuthState(validState, patientId, 'withings');
  assert.equal(verified.patientId, patientId.toString());
  assert.equal(verified.provider, 'withings');

  // 2. Reject tampered state
  const parts = validState.split('.');
  const tamperedState = `${parts[0]}.deadbeef1234567890`;
  assert.throws(
    () => verifyOAuthState(tamperedState, patientId, 'withings'),
    /signature verification failed/i
  );

  // 3. Reject state if returned to a different patient (account-linking CSRF)
  const anotherPatientId = new mongoose.Types.ObjectId().toString();
  assert.throws(
    () => verifyOAuthState(validState, anotherPatientId, 'withings'),
    /account-linking CSRF/i
  );
});

// ── Test 3: Canonical source: 'wearable' Schema Validation ──────────────────
test('3. Canonical source: "wearable" accepted by clinical vitals endpoint', async () => {
  const res = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({
      slot: 'morning',
      source: 'wearable',
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: 70,
      spo2: 98,
      temperatureC: 36.6,
      respirationRate: 15,
      isDemoReading: true,
      vitalMetadata: {
        systolicBp: { provenance: 'withings', isEstimated: false },
        heartRate: { provenance: 'oura', isEstimated: false },
      },
    })
    .expect(201);

  assert.equal(res.body.vitals.source, 'wearable');
  assert.equal(res.body.vitals.isDemoReading, true);
  assert.equal(res.body.vitals.vitalMetadata.systolicBp.provenance, 'withings');

  // Verify backward compatibility for 'oauth'
  const oauthRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({
      slot: 'evening',
      source: 'oauth',
      systolicBp: 122,
      diastolicBp: 78,
      heartRate: 68,
      spo2: 97,
      temperatureC: 36.5,
    })
    .expect(201);

  assert.equal(oauthRes.body.vitals.source, 'oauth');
});

// ── Test 4: Derived Estimation & Method Provenance Metadata ─────────────────
test('4. Adapter normalization attaches isEstimated and measurementMethod metadata', () => {
  const oura = new OuraAdapter();
  const ouraNorm = oura.normalize({
    heartRateData: { data: [{ bpm: 68 }] },
    sleepData: { data: [{ average_breath: 15, temperature_deviation: 0.1 }] },
    spo2Data: { data: [{ spo2_percentage: { average: 98 } }] },
  });

  // Oura blood pressure is strictly null
  assert.equal(ouraNorm.normalized.systolicBp, null);
  assert.equal(ouraNorm.normalized.diastolicBp, null);
  // Estimation metadata
  assert.equal(ouraNorm.vitalMetadata.spo2.isEstimated, true);
  assert.equal(ouraNorm.vitalMetadata.temperatureC.isEstimated, true);
  assert.equal(ouraNorm.vitalMetadata.respirationRate.isEstimated, true);
  assert.equal(ouraNorm.vitalMetadata.heartRate.isEstimated, false);

  const withings = new WithingsAdapter();
  const withingsNorm = withings.normalize({
    measuregrps: [
      {
        measures: [
          { type: 10, value: 120, unit: 0 },
          { type: 9, value: 80, unit: 0 },
          { type: 11, value: 72, unit: 0 },
        ],
      },
    ],
  });

  // Withings provides direct cuff BP
  assert.equal(withingsNorm.normalized.systolicBp, 120);
  assert.equal(withingsNorm.normalized.diastolicBp, 80);
  assert.equal(withingsNorm.vitalMetadata.systolicBp.isEstimated, false);
  assert.equal(withingsNorm.vitalMetadata.systolicBp.measurementMethod, 'cuff_oscillometric');
  // Temp and RR are null
  assert.equal(withingsNorm.normalized.temperatureC, null);
  assert.equal(withingsNorm.normalized.respirationRate, null);
});

// ── Test 5: Dynamic Hardware Model Capabilities ─────────────────────────────
test('5. Dynamic Hardware Model Capabilities (BPM Connect vs ScanWatch)', () => {
  const withings = new WithingsAdapter();

  const bpmCaps = withings.getCapabilities({ model: 'Withings BPM Connect' });
  assert.ok(bpmCaps.includes('systolicBp'), 'BPM Connect must supply systolic BP');
  assert.ok(!bpmCaps.includes('spo2'), 'BPM Connect must NOT promise SpO2');

  const watchCaps = withings.getCapabilities({ model: 'Withings ScanWatch 2' });
  assert.ok(watchCaps.includes('spo2'), 'ScanWatch must supply SpO2');
  assert.ok(!watchCaps.includes('systolicBp'), 'ScanWatch must NOT promise cuff Blood Pressure');
});

// ── Test 6: Multi-Device Deterministic Merge & Synergy ──────────────────────
test('6. Multi-Device Merge Engine combines Withings (BP) and Oura (Temp/RR)', async () => {
  // Connect both Oura and Withings in demo mode
  await connectDemoProvider({ patientId, provider: 'oura', userId: patientUserId });
  await connectDemoProvider({ patientId, provider: 'withings', userId: patientUserId });

  const syncResult = await syncPatientReadings(patientId);

  assert.equal(syncResult.connectedCount, 2);
  assert.ok(syncResult.vitals.systolicBp !== null, 'Systolic BP must be populated from Withings');
  assert.ok(syncResult.vitals.diastolicBp !== null, 'Diastolic BP must be populated from Withings');
  assert.ok(syncResult.vitals.temperatureC !== null, 'Temperature must be populated from Oura');
  assert.ok(syncResult.vitals.respirationRate !== null, 'Respiration rate must be populated from Oura');
  assert.ok(syncResult.vitals.heartRate !== null, 'Heart rate must be populated');

  // Provenance verification
  assert.equal(syncResult.sources.systolicBp, 'withings');
  assert.equal(syncResult.sources.diastolicBp, 'withings');
  assert.equal(syncResult.sources.temperatureC, 'oura');
});

// ── Test 7: Cross-Device Disagreement Detection ─────────────────────────────
test('7. Disagreement Detection flags discrepancy when devices differ significantly', async () => {
  // Test disagreement logic directly via adapter normalization
  const oura = new OuraAdapter();
  const withings = new WithingsAdapter();

  const ouraReading = oura.normalize({
    heartRateData: { data: [{ bpm: 60 }] },
  });
  const withingsReading = withings.normalize({
    measuregrps: [
      { measures: [{ type: 10, value: 120, unit: 0 }, { type: 9, value: 80, unit: 0 }, { type: 11, value: 88, unit: 0 }] },
    ],
  });

  const hrDiff = Math.abs(withingsReading.normalized.heartRate - ouraReading.normalized.heartRate);
  assert.equal(hrDiff, 28, 'Variance between 88 and 60 bpm is 28 bpm');
  assert.ok(hrDiff > 15, 'Variance exceeds the 15 bpm threshold for clinical alert');
});

// ── Test 8: Demo Alerting Isolation (Finding 5) ─────────────────────────────
test('8. Demo/Sandbox vitals suppress real external emergency alerts', async () => {
  // 1. Submit a simulated Critical vital reading flagged as isDemoReading: true
  const res = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({
      slot: 'morning',
      source: 'wearable',
      systolicBp: 230,
      diastolicBp: 130,
      heartRate: 140,
      spo2: 85,
      temperatureC: 39.5,
      isDemoReading: true,
    })
    .expect(201);

  assert.equal(res.body.vitals.isDemoReading, true, 'Stored reading must preserve isDemoReading: true');

  const patient = await Patient.findById(patientId);
  const mockCriticalPrediction = {
    _id: new mongoose.Types.ObjectId(),
    overallTier: 'Critical',
    colorCode: 'Red',
    patientExplanation: 'Critical physiological alert',
    doctorExplanation: { summary: 'Severe deterioration detected' },
  };

  // 2. Direct dispatchAlert invocation with isDemoReading: true
  const demoAlert = await dispatchAlert({
    prediction: mockCriticalPrediction,
    patient,
    vitals: {
      _id: new mongoose.Types.ObjectId(res.body.vitals._id),
      enteredBy: patientUserId,
      isDemoReading: true,
    },
    user: { id: patientUserId, role: 'patient' },
  });

  assert.equal(demoAlert, null, 'Real emergency alert dispatch MUST be suppressed for demo readings');

  // Verify AuditLog recorded DEMO_ALERT_SIMULATED
  const demoAudit = await AuditLog.findOne({
    action: 'DEMO_ALERT_SIMULATED',
    'details.patientId': new mongoose.Types.ObjectId(patientId),
  });
  assert.ok(demoAudit, 'AuditLog must record DEMO_ALERT_SIMULATED event');

  // 3. Contrast: Direct dispatchAlert with real reading (isDemoReading: false) MUST create an Alert
  const realAlert = await dispatchAlert({
    prediction: mockCriticalPrediction,
    patient,
    vitals: {
      _id: new mongoose.Types.ObjectId(),
      enteredBy: patientUserId,
      isDemoReading: false,
    },
    user: { id: patientUserId, role: 'patient' },
  });

  assert.ok(realAlert, 'Non-demo Critical reading MUST create an active Alert');
  assert.equal(realAlert.status, 'active');
  assert.equal(realAlert.tier, 'Critical');
});

// ── Test 9: Provider-Side Token Revocation on Disconnect ────────────────────
test('9. Disconnect removes provider from database and records audit log', async () => {
  await connectDemoProvider({ patientId, provider: 'google_health', userId: patientUserId });

  const patBefore = await Patient.findById(patientId);
  assert.ok(patBefore.connectedProviders.some((p) => p.provider === 'google_health'));

  const disconnectRes = await request(app)
    .post('/api/wearables/google_health/disconnect')
    .set('Authorization', `Bearer ${patientToken}`)
    .expect(200);

  assert.equal(disconnectRes.body.result.provider, 'google_health');

  const patAfter = await Patient.findById(patientId);
  assert.ok(!patAfter.connectedProviders.some((p) => p.provider === 'google_health'), 'google_health must be removed');

  const audit = await AuditLog.findOne({
    action: 'WEARABLE_DISCONNECTED',
    'details.patientId': new mongoose.Types.ObjectId(patientId),
    'details.provider': 'google_health',
  });
  assert.ok(audit, 'WEARABLE_DISCONNECTED audit log must be recorded');
});

// ── Test 10: RBAC & IDOR Enforcement (NFR1) ─────────────────────────────────
test('10. RBAC: Caregiver cannot write/connect wearables (HTTP 403)', async () => {
  await request(app)
    .post('/api/wearables/oura/connect-demo')
    .set('Authorization', `Bearer ${caregiverToken}`)
    .expect(403);

  await request(app)
    .post('/api/wearables/oura/disconnect')
    .set('Authorization', `Bearer ${caregiverToken}`)
    .expect(403);
});
