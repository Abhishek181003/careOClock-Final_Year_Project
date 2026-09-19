import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import Prescription from '../src/models/Prescription.js';
import Alert from '../src/models/Alert.js';
import Vitals from '../src/models/Vitals.js';
import Prediction from '../src/models/Prediction.js';
import { connectDB } from '../src/db/connection.js';

let doctorId = '';
let doctorToken = '';
let patientId = '';
let patientToken = '';
let caregiverId = '';
let caregiverToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();

  // Clear test users
  await User.deleteMany({ email: { $regex: /@hardening-test\.com$/ } });

  // 1. Register test doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doc@hardening-test.com',
    password: 'Password123!',
    displayName: 'Dr. Hardening',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  doctorToken = docRes.body.token;

  // 2. Register test patient assigned to doctor
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'patient@hardening-test.com',
    password: 'Password123!',
    displayName: 'Patient Hardening',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 72,
    sex: 'male',
  });
  patientId = patRes.body.patient._id;
  patientToken = patRes.body.token;

  // 3. Register test caregiver
  const cgRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver@hardening-test.com',
    password: 'Password123!',
    displayName: 'Caregiver Hardening',
    role: 'caregiver',
  });
  caregiverId = cgRes.body.user.id;
  caregiverToken = cgRes.body.token;
});

after(async () => {
  await User.deleteMany({ email: { $regex: /@hardening-test\.com$/ } });
  await Patient.deleteMany({ _id: patientId });
  await CaregiverLink.deleteMany({ patientId });
  await Prescription.deleteMany({ patientId });
  await Alert.deleteMany({ patientId });
  await Vitals.deleteMany({ patientId });
  await Prediction.deleteMany({ patientId });
  await mongoose.disconnect();
});

test('1. Prescription Persistence & Multi-Role Retrieval (FR6, FR7, FR8)', async (t) => {
  let createdPrescriptionId = '';

  await t.test('1a. Doctor creates prescription and persists to MongoDB', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        medicationName: 'Amlodipine Besylate',
        dose: '5mg once daily',
        schedule: ['08:00'],
        instructions: 'Take in the morning with water.',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.prescription.medicationName, 'Amlodipine Besylate');
    assert.ok(res.body.prescription._id, 'Prescription must have a database _id');
    createdPrescriptionId = res.body.prescription._id;

    // Verify directly in MongoDB
    const persisted = await Prescription.findById(createdPrescriptionId);
    assert.ok(persisted, 'Prescription must exist in database');
    assert.equal(persisted.medicationName, 'Amlodipine Besylate');
    assert.equal(persisted.isActive, true);
  });

  await t.test('1b. Patient retrieves their active prescriptions', async () => {
    const res = await request(app)
      .get('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.prescriptions));
    assert.equal(res.body.prescriptions.length, 1);
    assert.equal(res.body.prescriptions[0].medicationName, 'Amlodipine Besylate');
  });

  await t.test('1c. Doctor retrieves prescriptions for assigned patient', async () => {
    const res = await request(app)
      .get(`/api/clinical/prescriptions?patientId=${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.prescriptions.length, 1);
  });

  await t.test('1d. Caregiver receives 403 on writing prescription (NFR1)', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({
        patientId,
        medicationName: 'Lisinopril',
        dose: '10mg',
        schedule: ['09:00'],
      });

    assert.equal(res.status, 403);
  });
});

test('2. Caregiver Invite Lifecycle (F-13)', async (t) => {
  let inviteCode = '';
  let linkId = '';

  await t.test('2a. Patient generates a secure caregiver invite code', async () => {
    const res = await request(app)
      .post('/api/caregiver/invite')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 201);
    assert.ok(res.body.inviteCode, 'Must return inviteCode');
    assert.ok(res.body.expiresAt, 'Must return expiresAt');
    inviteCode = res.body.inviteCode;
  });

  await t.test('2b. Caregiver accepts invite code to activate relationship', async () => {
    const res = await request(app)
      .post('/api/caregiver/accept')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({ inviteCode });

    assert.equal(res.status, 200);
    assert.equal(res.body.link.status, 'active');
    assert.equal(res.body.link.patientId, patientId);
    linkId = res.body.link.id;
  });

  await t.test('2c. Re-accepting already used invite returns 400', async () => {
    const res = await request(app)
      .post('/api/caregiver/accept')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({ inviteCode });

    assert.equal(res.status, 400);
  });

  await t.test('2d. Caregiver views linked patient', async () => {
    const res = await request(app)
      .get('/api/caregiver/links')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.links.length, 1);
    assert.equal(res.body.links[0].status, 'active');
  });

  await t.test('2e. Actively linked caregiver can now view prescriptions', async () => {
    const res = await request(app)
      .get('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.prescriptions.length, 1);
  });
});

test('3. Clinical Alert Dispatch Pipeline & Acknowledgment (F-05)', async (t) => {
  let alertId = '';

  await t.test('3a. Submitting critical vitals triggers automated Alert in MongoDB', async () => {
    // SBP = 220 mmHg (Hypertensive Urgency) + acute chest pain triggers Critical/High escalation
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 220,
        diastolicBp: 120,
        heartRate: 115,
        spo2: 91,
        temperatureC: 37.0,
        symptomFlags: ['chest_pain'],
        notes: 'Sudden chest discomfort upon waking.',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.assessment, 'Assessment should be returned');
    assert.ok(
      res.body.assessment.overallTier === 'Critical' || res.body.assessment.overallTier === 'High',
      'Should escalate to Critical or High'
    );

    // Verify Alert was created in database
    const alerts = await Alert.find({ patientId, doctorId });
    assert.ok(alerts.length >= 1, 'Alert document must be created');
    const criticalAlert = alerts[0];
    assert.equal(criticalAlert.status, 'active');
    assert.equal(criticalAlert.doctorId.toString(), doctorId);
    alertId = criticalAlert._id.toString();
  });

  await t.test('3b. Doctor retrieves active alerts queue', async () => {
    const res = await request(app)
      .get('/api/clinical/alerts')
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.alerts.length >= 1);
  });

  await t.test('3c. Doctor acknowledges the active alert', async () => {
    const res = await request(app)
      .patch(`/api/clinical/alerts/${alertId}/acknowledge`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ resolutionNotes: 'Contacted patient; advised immediate ER presentation.' });

    assert.equal(res.status, 200);
    assert.equal(res.body.alert.status, 'acknowledged');
    assert.equal(res.body.alert.resolutionNotes, 'Contacted patient; advised immediate ER presentation.');
  });
});

test('4. Clinician-Gated SpO2 Scale 2 & Adherence Rate (Finding 6 & F-11)', async (t) => {
  await t.test('4a. Patient receives 403 Forbidden when attempting to submit SpO2 Scale 2', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'evening',
        systolicBp: 124,
        diastolicBp: 78,
        heartRate: 72,
        spo2: 89,
        temperatureC: 36.6,
        spo2Scale: 2,
        onSupplementalOxygen: false,
        adherenceRate7d: 0.9,
        notes: 'Patient attempting to submit COPD Scale 2 without clinician prescription',
      });

    assert.equal(res.status, 403);
    assert.ok(
      res.body.error && res.body.error.includes('SpO2 Scale 2'),
      'Must return informative 403 error message'
    );
  });

  await t.test('4b. Doctor successfully submits vitals with COPD SpO2 Scale 2 for assigned patient', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        slot: 'evening',
        systolicBp: 124,
        diastolicBp: 78,
        heartRate: 72,
        spo2: 89, // Normal on Scale 2 (target 88-92%), but would be alert on Scale 1
        temperatureC: 36.6,
        spo2Scale: 2,
        onSupplementalOxygen: false,
        adherenceRate7d: 0.9,
        notes: 'Clinician-prescribed COPD Scale 2 baseline reading',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.vitals.spo2Scale, 2);
    assert.equal(res.body.vitals.adherenceRate7d, 0.9);

    // Verify in database
    const saved = await Vitals.findById(res.body.vitals._id);
    assert.equal(saved.spo2Scale, 2);
    assert.equal(saved.onSupplementalOxygen, false);
    assert.equal(saved.adherenceRate7d, 0.9);
  });
});

test('5. DPDP Data Export Completeness (Section 11)', async () => {
  const res = await request(app)
    .post('/api/data-requests/export')
    .set('Authorization', `Bearer ${patientToken}`);

  assert.equal(res.status, 200);
  const { data } = res.body;
  assert.ok(data.user, 'Export must include user');
  assert.ok(data.patientProfile, 'Export must include patientProfile');
  assert.ok(Array.isArray(data.vitals), 'Export must include vitals');
  assert.ok(Array.isArray(data.predictions), 'Export must include predictions');
  assert.ok(Array.isArray(data.prescriptions), 'Export must include prescriptions');
  assert.ok(Array.isArray(data.caregiverLinks), 'Export must include caregiverLinks');
  assert.ok(data.prescriptions.length >= 1, 'Should include created prescription');
  assert.ok(data.caregiverLinks.length >= 1, 'Should include created caregiver link');
});

test('6. Fail-Open Pending Vitals Recovery Worker', async () => {
  // Seed a pending prediction
  const fakeVitals = await Vitals.create({
    patientId,
    enteredBy: doctorId,
    slot: 'morning',
    systolicBp: 120,
    diastolicBp: 80,
    heartRate: 70,
    spo2: 98,
    temperatureC: 36.5,
  });

  await Prediction.create({
    patientId,
    vitalsId: fakeVitals._id,
    recordedAt: fakeVitals.recordedAt,
    overallTier: 'Pending',
    colorCode: 'Amber',
    overallScore: 0,
    source: 'fallback',
    baselineStatus: 'unavailable',
    patientExplanation: 'Temporary fallback reason for pending reading.',
    doctorExplanation: {
      summary: 'Service degraded; re-evaluation required.',
      triggeringLayer: 'None',
    },
  });

  const res = await request(app)
    .post('/api/clinical/vitals/re-evaluate-pending')
    .set('Authorization', `Bearer ${doctorToken}`);

  assert.equal(res.status, 200);
  assert.ok(res.body.processedCount >= 1, 'Should process pending prediction');
  assert.ok(res.body.recoveredCount >= 1, 'Should recover pending prediction');
});

after(async () => {
  await mongoose.disconnect();
});
