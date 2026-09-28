import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/db/connection.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import AuditLog from '../src/models/AuditLog.js';
import Vitals from '../src/models/Vitals.js';
import Prediction from '../src/models/Prediction.js';
import {
  maxSeverity,
  tierToColorCode,
  computeOverallScore,
  resolveBaselineStatus,
  aggregate,
} from '../src/services/aggregatorService.js';
import {
  generatePatientExplanation,
  generateDoctorExplanation,
  generateDualViewExplanations,
} from '../src/services/explanationService.js';
import {
  predictionEntitySchema,
  filterPatientCaregiverView,
  filterDoctorView,
} from '../src/schemas/predictionSchema.js';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';

let doctorId;
let doctorToken;
let otherDoctorToken;
let patientId;
let patientToken;
let otherPatientToken;
let caregiverToken;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();
  await Promise.all([
    User.syncIndexes(),
    Patient.syncIndexes(),
    CaregiverLink.syncIndexes(),
    Vitals.syncIndexes(),
    Prediction.syncIndexes(),
  ]);

  // Clean test data (scoped strictly to test users)
  const existingTestUsers = await User.find({ email: { $regex: /@phase6-test\.com$/ } });
  const testUserIds = existingTestUsers.map((u) => u._id);
  const existingTestPatients = await Patient.find({ userId: { $in: testUserIds } });
  const testPatientIds = existingTestPatients.map((p) => p._id);
  await Patient.deleteMany({ _id: { $in: testPatientIds } });
  await CaregiverLink.deleteMany({ caregiverUserId: { $in: testUserIds } });
  await Vitals.deleteMany({ patientId: { $in: testPatientIds } });
  await Prediction.deleteMany({ patientId: { $in: testPatientIds } });
  await User.deleteMany({ _id: { $in: testUserIds } });

  // 1. Create primary Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'primary.doctor@phase6-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Primary, MD',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  const docLogin = await request(app).post('/api/auth/login').send({
    email: 'primary.doctor@phase6-test.com',
    password: 'SecurePassword123!',
  });
  doctorToken = docLogin.body.token;

  // 2. Create another Doctor (for IDOR tests)
  await request(app).post('/api/auth/register').send({
    email: 'other.doctor@phase6-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Other, MD',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  const otherDocLogin = await request(app).post('/api/auth/login').send({
    email: 'other.doctor@phase6-test.com',
    password: 'SecurePassword123!',
  });
  otherDoctorToken = otherDocLogin.body.token;

  // 3. Create Patient 1 assigned to primary doctor
  const patientRes = await request(app).post('/api/auth/register').send({
    email: 'patient.one@phase6-test.com',
    password: 'SecurePassword123!',
    displayName: 'Patient One',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 72,
    sex: 'male',
    heightCm: 175,
    weightKg: 78,
  });
  patientId = patientRes.body.patient._id;
  const patientLogin = await request(app).post('/api/auth/login').send({
    email: 'patient.one@phase6-test.com',
    password: 'SecurePassword123!',
  });
  patientToken = patientLogin.body.token;

  // 4. Create Patient 2 (unrelated patient for IDOR tests)
  const otherPatientRes = await request(app).post('/api/auth/register').send({
    email: 'patient.two@phase6-test.com',
    password: 'SecurePassword123!',
    displayName: 'Patient Two',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 68,
    sex: 'female',
    heightCm: 160,
    weightKg: 65,
  });
  assert.ok(otherPatientRes.body.patient._id);
  const otherPatientLogin = await request(app).post('/api/auth/login').send({
    email: 'patient.two@phase6-test.com',
    password: 'SecurePassword123!',
  });
  otherPatientToken = otherPatientLogin.body.token;

  // 5. Create Caregiver linked to Patient 1
  const caregiverRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver.one@phase6-test.com',
    password: 'SecurePassword123!',
    displayName: 'Jane Doe (Caregiver)',
    role: 'caregiver',
    patientId: patientId,
  });
  const caregiverLogin = await request(app).post('/api/auth/login').send({
    email: 'caregiver.one@phase6-test.com',
    password: 'SecurePassword123!',
  });
  caregiverToken = caregiverLogin.body.token;

  // Activate caregiver link
  await CaregiverLink.updateOne(
    { patientId, caregiverUserId: caregiverRes.body.user.id },
    { status: 'active', acceptedAt: new Date() }
  );
});

after(async () => {
  const existingTestUsers = await User.find({ email: { $regex: /@phase6-test\.com$/ } });
  const testUserIds = existingTestUsers.map((u) => u._id);
  const existingTestPatients = await Patient.find({ userId: { $in: testUserIds } });
  const testPatientIds = existingTestPatients.map((p) => p._id);
  await Patient.deleteMany({ _id: { $in: testPatientIds } });
  await CaregiverLink.deleteMany({ caregiverUserId: { $in: testUserIds } });
  await Vitals.deleteMany({ patientId: { $in: testPatientIds } });
  await Prediction.deleteMany({ patientId: { $in: testPatientIds } });
  await User.deleteMany({ _id: { $in: testUserIds } });
  await mongoose.disconnect();
});

// =====================================================================
// 1. AGGREGATOR SERVICE UNIT TESTS (FR5, H-1, H-2, M-1)
// =====================================================================

test('1. Aggregator Core Logic & Rules Verification', async (t) => {
  await t.test('1a. maxSeverity escalates strictly to higher tier (FR5)', () => {
    assert.equal(maxSeverity('Low', 'Low'), 'Low');
    assert.equal(maxSeverity('Low', 'Moderate'), 'Moderate');
    assert.equal(maxSeverity('Moderate', 'Low'), 'Moderate');
    assert.equal(maxSeverity('Low', 'High'), 'High');
    assert.equal(maxSeverity('High', 'Low'), 'High');
    assert.equal(maxSeverity('High', 'Critical'), 'Critical');
    assert.equal(maxSeverity('Critical', 'Low'), 'Critical');
    assert.equal(maxSeverity(null, 'Moderate'), 'Moderate');
  });

  await t.test('1b. tierToColorCode maps correctly (FR5 traffic light)', () => {
    assert.equal(tierToColorCode('Low'), 'Green');
    assert.equal(tierToColorCode('Moderate'), 'Amber');
    assert.equal(tierToColorCode('High'), 'Red');
    assert.equal(tierToColorCode('Critical'), 'Red');
  });

  await t.test('1c. computeOverallScore monotonicity and zero-denominator guard (H-1, M-1)', () => {
    // Standard baseline cases across tiers
    const scoreLow = computeOverallScore('Low', 0, 12, 0, 6, { maxAbsZ: 0.5 });
    const scoreMod = computeOverallScore('Moderate', 2, 12, 1, 6, { maxAbsZ: 2.1 });
    const scoreHigh = computeOverallScore('High', 4, 12, 2, 6, { maxAbsZ: 2.9 });
    const scoreCrit = computeOverallScore('Critical', 7, 12, 3, 6, { maxAbsZ: 3.8 });

    // Strict monotonicity: Low < Moderate < High < Critical
    assert.ok(scoreLow < scoreMod, `Expected ${scoreLow} < ${scoreMod}`);
    assert.ok(scoreMod < scoreHigh, `Expected ${scoreMod} < ${scoreHigh}`);
    assert.ok(scoreHigh < scoreCrit, `Expected ${scoreHigh} < ${scoreCrit}`);
    assert.ok(scoreCrit <= 100, `Score cannot exceed 100, got ${scoreCrit}`);

    // Zero denominator guard (M-1): l1Max = 0, careMax = 0 must NOT return NaN
    const guardedScore = computeOverallScore('Moderate', 2, 0, 1, 0, null);
    assert.equal(typeof guardedScore, 'number');
    assert.ok(!isNaN(guardedScore), 'Guarded score must not be NaN');
    assert.equal(guardedScore, 25); // base tier Moderate (25) + 0 + 0

    // Null Layer 2 handling (M-1):
    const nullL2Score = computeOverallScore('Low', 1, 12, 0, 6, null);
    assert.equal(typeof nullL2Score, 'number');
    assert.ok(!isNaN(nullL2Score));
  });

  await t.test('1d. resolveBaselineStatus distinguishes outage from cold start (H-2)', () => {
    // 1. Layer 2 failed (timeout / outage) -> must be 'unavailable', NOT 'building'
    assert.equal(resolveBaselineStatus({ layer2: null, layer2Failed: true }), 'unavailable');

    // 2. Legitimate cold-start (days < 7) -> 'building'
    assert.equal(
      resolveBaselineStatus({ layer2: { status: 'not yet available', days_of_history_total: 3 }, layer2Failed: false }),
      'building'
    );

    // 3. Mature window (days >= 28) -> 'mature'
    assert.equal(
      resolveBaselineStatus({ layer2: { status: 'active', days_of_history_total: 28 }, layer2Failed: false }),
      'mature'
    );
  });

  await t.test('1e. aggregate combines L1 and L2 into a complete validated entity (FR5)', () => {
    const l1Result = {
      layer1_tier: 'Low',
      news2_subtotal: 0,
      care_additions_subtotal: 0,
      red_flag_triggered: false,
      component_points: {},
      parameters_used: ['systolic_bp', 'heart_rate', 'spo2', 'temperature_c'],
    };
    const l2Result = {
      status: 'active',
      layer2_tier: 'Moderate',
      anomaly_score: -0.12,
      feature_deviations: {
        heart_rate: { z_score: 2.1, value: 88, mean: 72, std: 7.6 },
      },
      days_of_history_total: 14,
    };

    const aggregated = aggregate({
      patientId: new mongoose.Types.ObjectId().toString(),
      vitalsId: new mongoose.Types.ObjectId().toString(),
      recordedAt: new Date(),
      layer1Result: l1Result,
      layer2Result: l2Result,
      networkLatencyMs: 35,
    });

    assert.equal(aggregated.overallTier, 'Moderate');
    assert.equal(aggregated.colorCode, 'Amber');
    assert.equal(aggregated.source, 'hybrid');
    assert.equal(aggregated.baselineStatus, 'building');
    assert.ok(aggregated.patientExplanation.length > 0);
    assert.ok(aggregated.doctorExplanation.summary.length > 0);
  });
});

// =====================================================================
// 2. DUAL-VIEW EXPLANATION ENGINE TESTS (L-1, L-2, L-3, NFR5)
// =====================================================================

test('2. Dual-View Explanation Engine Verification', async (t) => {
  await t.test('2a. Patient/Caregiver view is concise and non-technical (L-2, L-3)', () => {
    const context = {
      overallTier: 'Moderate',
      colorCode: 'Amber',
      layer1: { tier: 'Low', news2Subtotal: 0 },
      layer2: {
        tier: 'Moderate',
        featureDeviations: {
          heart_rate: { z_score: 2.2, value: 88, mean: 72, std: 7.2 },
        },
      },
      baselineStatus: 'mature',
    };

    const patientView = generatePatientExplanation(context);
    assert.equal(typeof patientView.text, 'string');
    assert.ok(patientView.text.length >= 10);
    // Softened language: uses "usual for you" instead of clinical "baseline departure"
    assert.ok(patientView.text.includes('usual for you'));
    // Localization template key provided (L-1)
    assert.equal(patientView.template.key, 'vitals_amber_drift');
    assert.equal(patientView.template.params.vital, 'heart rate');
  });

  await t.test('2b. Doctor view includes granular clinical breakdown and deviations', () => {
    const context = {
      overallTier: 'High',
      colorCode: 'Red',
      layer1: {
        tier: 'Moderate',
        news2Subtotal: 3,
        careAdditionsSubtotal: 1,
        componentPoints: { systolic_bp: 2, heart_rate: 1 },
      },
      layer2: {
        tier: 'High',
        maxAbsZ: 2.8,
        featureDeviations: {
          heart_rate: { z_score: 2.8, value: 96, mean: 72, std: 8.5 },
          systolic_bp: { z_score: 1.4, value: 142, mean: 130, std: 8.5 },
        },
      },
      baselineStatus: 'mature',
    };

    const doctorView = generateDoctorExplanation(context);
    assert.equal(doctorView.triggeringLayer, 'Both (Concordant Risk Escalation)');
    assert.ok(doctorView.summary.includes('Risk escalated to High'));
    assert.ok(doctorView.flaggedVitals.length > 0);
    assert.equal(doctorView.baselineDeviations.length, 2);
    // Verified sorted by |z| descending
    assert.ok(doctorView.baselineDeviations[0].absZ >= doctorView.baselineDeviations[1].absZ);
    assert.equal(doctorView.baselineDeviations[0].vital, 'heart_rate');
  });

  await t.test('2c. Master generateDualViewExplanations produces both distinct views', () => {
    const explanations = generateDualViewExplanations({
      overallTier: 'Low',
      colorCode: 'Green',
      layer1: { tier: 'Low', news2Subtotal: 0 },
      layer2: { tier: 'Low', maxAbsZ: 0.4 },
      baselineStatus: 'building',
    });

    assert.ok(explanations.patientExplanation);
    assert.ok(explanations.doctorExplanation);
    assert.notEqual(explanations.patientExplanation, explanations.doctorExplanation.summary);
  });
});

// =====================================================================
// 3. SCHEMA & NFR5 STRUCTURAL ENFORCEMENT TESTS
// =====================================================================

test('3. Schema & Structural Reason Enforcement (NFR5)', async (t) => {
  await t.test('3a. Valid prediction entity passes schema validation', () => {
    const valid = {
      patientId: new mongoose.Types.ObjectId().toString(),
      vitalsId: new mongoose.Types.ObjectId().toString(),
      recordedAt: new Date(),
      overallTier: 'Low',
      colorCode: 'Green',
      overallScore: 0,
      source: 'layer1_only',
      baselineStatus: 'building',
      patientExplanation: 'Your vitals are steady and within your normal range today.',
      patientTemplate: { key: 'vitals_steady' },
      doctorExplanation: {
        summary: 'Patient vitals stable across thresholds.',
        triggeringLayer: 'None (Routine)',
      },
      executionTimeMs: 120,
    };

    const parsed = predictionEntitySchema.parse(valid);
    assert.equal(parsed.overallTier, 'Low');
  });

  await t.test('3b. Schema strictly rejects missing patientExplanation (NFR5)', () => {
    const invalid = {
      patientId: new mongoose.Types.ObjectId().toString(),
      vitalsId: new mongoose.Types.ObjectId().toString(),
      recordedAt: new Date(),
      overallTier: 'Low',
      colorCode: 'Green',
      overallScore: 0,
      source: 'layer1_only',
      baselineStatus: 'building',
      // Missing patientExplanation
      doctorExplanation: {
        summary: 'Clinical note',
        triggeringLayer: 'None',
      },
    };

    assert.throws(() => predictionEntitySchema.parse(invalid));
  });

  await t.test('3c. Role filtering hides internal doctor breakdown from patient view', () => {
    const fullPrediction = {
      overallTier: 'High',
      colorCode: 'Red',
      overallScore: 68,
      patientExplanation: 'Your readings are notably elevated today. Contact your doctor.',
      patientTemplate: { key: 'vitals_urgent' },
      doctorExplanation: {
        summary: 'L1 red flag on SBP=188',
        triggeringLayer: 'Layer 1',
        componentPoints: { systolic_bp: 3 },
      },
      layer1: { news2Subtotal: 3, redFlagTriggered: true },
      layer2: { maxAbsZ: 1.2 },
      baselineStatus: 'mature',
      executionTimeMs: 140,
    };

    const patientView = filterPatientCaregiverView(fullPrediction);
    assert.equal(patientView.overallTier, 'High');
    assert.equal(patientView.explanation, fullPrediction.patientExplanation);
    // Doctor clinical fields must be completely absent
    assert.equal(patientView.doctorExplanation, undefined);
    assert.equal(patientView.layer1, undefined);
    assert.equal(patientView.layer2, undefined);

    const docView = filterDoctorView(fullPrediction);
    assert.ok(docView.layer1);
    assert.ok(docView.layer2);
    assert.ok(docView.explanation.summary);
  });
});

// =====================================================================
// 4. FULL-STACK INTEGRATION & IDOR DEFENSE TESTS (C-1, H-3, M-3)
// =====================================================================

test('4. Full-Stack Clinical API Integration & IDOR Defense (C-1, H-3, M-3)', async (t) => {
  await t.test('4a. POST /api/clinical/vitals persists reading and returns role-filtered assessment', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.recordedBy, 'patient');
    assert.ok(res.body.vitals._id);

    // Phase 6 Assessment payload verified
    assert.ok(res.body.assessment);
    assert.ok(res.body.assessment.overallTier);
    assert.ok(res.body.assessment.colorCode);
    assert.ok(res.body.assessment.explanation);
    // Patient view must not expose internal layers
    assert.equal(res.body.assessment.layer1, undefined);
  });

  await t.test('4b. GET /api/clinical/assessments/:patientId returns 200 for authorized patient', async () => {
    const res = await request(app)
      .get(`/api/clinical/assessments/${patientId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'patient');
    assert.ok(Array.isArray(res.body.assessments));
  });

  await t.test('4c. GET /api/clinical/assessments/:patientId returns 200 with doctor view for assigned doctor', async () => {
    const res = await request(app)
      .get(`/api/clinical/assessments/${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'doctor');
    assert.ok(Array.isArray(res.body.assessments));
  });

  await t.test('4d. GET /api/clinical/assessments/:patientId returns 200 for actively linked caregiver', async () => {
    const res = await request(app)
      .get(`/api/clinical/assessments/${patientId}`)
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'caregiver');
  });

  await t.test('4e. C-1 Verification: Unrelated patient receives 404 on reading other patient assessments (IDOR Defense)', async () => {
    // Patient 2 attempts to query Patient 1's assessments
    const res = await request(app)
      .get(`/api/clinical/assessments/${patientId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);

    // Must return 404 (never 403) to prevent patientId enumeration
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Patient record not found.');
  });

  await t.test('4f. C-1 Verification: Unassigned doctor receives 404 on unassigned patient assessments', async () => {
    // Other Doctor attempts to query Patient 1's assessments
    const res = await request(app)
      .get(`/api/clinical/assessments/${patientId}`)
      .set('Authorization', `Bearer ${otherDoctorToken}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Patient record not found.');
  });

  await t.test('4g. H-3 Verification: DPDP Data Rights export endpoint works', async () => {
    const res = await request(app)
      .post('/api/data-requests/export')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.user);
    assert.ok(res.body.data.vitals);
    assert.equal(res.body.data.user.email, 'patient.one@phase6-test.com');
  });

  await t.test('4h. H-3 Verification: DPDP Data Rights erase endpoint queues request with 90-day window', async () => {
    const res = await request(app)
      .post('/api/data-requests/erase')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 202);
    assert.ok(res.body.statutoryDeadline);
    assert.ok(res.body.requestId);
  });
});
