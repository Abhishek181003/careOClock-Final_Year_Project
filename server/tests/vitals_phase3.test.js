import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import AuditLog from '../src/models/AuditLog.js';
import Vitals from '../src/models/Vitals.js';
import { connectDB } from '../src/db/connection.js';
import { checkWearableConnectionStatus } from '../src/services/wearableService.js';

let doctorToken = '';
let doctorId = '';
let anotherDoctorToken = '';
let patientToken = '';
let patientId = '';
let caregiverToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';

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
  ]);

  // Clean test data (scoped strictly to test users)
  const existingTestUsers = await User.find({ email: { $regex: /@phase3-test\.com$/ } });
  const testUserIds = existingTestUsers.map((u) => u._id);
  const existingTestPatients = await Patient.find({ userId: { $in: testUserIds } });
  const testPatientIds = existingTestPatients.map((p) => p._id);
  await Patient.deleteMany({ _id: { $in: testPatientIds } });
  await CaregiverLink.deleteMany({ caregiverUserId: { $in: testUserIds } });
  await Vitals.deleteMany({ patientId: { $in: testPatientIds } });
  await User.deleteMany({ _id: { $in: testUserIds } });

  // 1. Create primary Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'primary.doctor@phase3-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Primary, MD',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  const docLogin = await request(app).post('/api/auth/login').send({
    email: 'primary.doctor@phase3-test.com',
    password: 'SecurePassword123!',
  });
  doctorToken = docLogin.body.token;

  // 2. Create another Doctor (for IDOR tests)
  await request(app).post('/api/auth/register').send({
    email: 'other.doctor@phase3-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Other, MD',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  const otherDocLogin = await request(app).post('/api/auth/login').send({
    email: 'other.doctor@phase3-test.com',
    password: 'SecurePassword123!',
  });
  anotherDoctorToken = otherDocLogin.body.token;

  // 3. Create Patient assigned to primary doctor
  const patientRes = await request(app).post('/api/auth/register').send({
    email: 'patient.doe@phase3-test.com',
    password: 'SecurePassword123!',
    displayName: 'John Doe',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 72,
    sex: 'male',
    heightCm: 175,
    weightKg: 78,
  });
  patientId = patientRes.body.patient._id;
  const patientLogin = await request(app).post('/api/auth/login').send({
    email: 'patient.doe@phase3-test.com',
    password: 'SecurePassword123!',
  });
  patientToken = patientLogin.body.token;

  // 4. Create Caregiver linked to Patient
  const caregiverRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver.doe@phase3-test.com',
    password: 'SecurePassword123!',
    displayName: 'Jane Doe (Daughter)',
    role: 'caregiver',
    patientId: patientId,
  });
  const caregiverLogin = await request(app).post('/api/auth/login').send({
    email: 'caregiver.doe@phase3-test.com',
    password: 'SecurePassword123!',
  });
  caregiverToken = caregiverLogin.body.token;

  // Activate caregiver link
  await CaregiverLink.updateOne(
    { patientId: patientId, caregiverUserId: caregiverRes.body.user.id },
    { status: 'active', acceptedAt: new Date() }
  );
});

after(async () => {
  const existingTestUsers = await User.find({ email: { $regex: /@phase3-test\.com$/ } });
  const testUserIds = existingTestUsers.map((u) => u._id);
  const existingTestPatients = await Patient.find({ userId: { $in: testUserIds } });
  const testPatientIds = existingTestPatients.map((p) => p._id);
  await Patient.deleteMany({ _id: { $in: testPatientIds } });
  await CaregiverLink.deleteMany({ caregiverUserId: { $in: testUserIds } });
  await Vitals.deleteMany({ patientId: { $in: testPatientIds } });
  await User.deleteMany({ _id: { $in: testUserIds } });
  await mongoose.disconnect();
});

// ── Test Suite: Phase 3 Vitals Entry (FR2, NFR4) ────────────────────

test('Phase 3: Vitals Entry (FR2, NFR4) Full-Stack Verification', async (t) => {
  let createdVitalsId = '';

  await t.test('1. Patient manually submits valid morning vitals reading (FR2, NFR4)', async () => {
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
        symptomFlags: ['cough_fever'],
        notes: 'Feeling good, measured before breakfast.',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.recordedBy, 'patient');
    assert.equal(res.body.vitals.slot, 'morning');
    assert.equal(res.body.vitals.source, 'manual');
    assert.equal(res.body.vitals.systolicBp, 120);
    assert.equal(res.body.vitals.diastolicBp, 80);
    assert.equal(res.body.vitals.heartRate, 72);
    assert.equal(res.body.vitals.spo2, 98);
    assert.equal(res.body.vitals.temperatureC, 36.6);
    assert.equal(res.body.vitals.respirationRate, 16);
    assert.deepEqual(res.body.vitals.symptomFlags, ['cough_fever']);
    assert.equal(res.body.patientId, patientId.toString());

    createdVitalsId = res.body.vitals._id;

    // Verify stored in MongoDB
    const docInDb = await Vitals.findById(createdVitalsId);
    assert.ok(docInDb, 'Vitals document must exist in MongoDB');
    assert.equal(docInDb.systolicBp, 120);
    assert.equal(docInDb.source, 'manual');
  });

  await t.test('2. Patient manually submits valid evening vitals reading (Twice-daily FR2)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'evening',
        systolicBp: 126,
        diastolicBp: 82,
        heartRate: 76,
        spo2: 97,
        temperatureC: 36.8,
        respirationRate: 18,
        symptomFlags: [],
        notes: 'Evening reading before dinner.',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.vitals.slot, 'evening');
    assert.equal(res.body.vitals.source, 'manual');
  });

  await t.test('3. Doctor submits vitals for assigned patient', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patientId.toString(),
        slot: 'morning',
        systolicBp: 135,
        diastolicBp: 85,
        heartRate: 80,
        spo2: 96,
        temperatureC: 37.1,
        respirationRate: 18,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.recordedBy, 'doctor');
    assert.equal(res.body.vitals.systolicBp, 135);
  });

  await t.test('4. Doctor cannot submit vitals for an unassigned patient (IDOR Defense)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${anotherDoctorToken}`)
      .send({
        patientId: patientId.toString(),
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /not the assigned doctor/i);
  });

  await t.test('5. Caregiver receives 403 Forbidden on vitals submission (NFR1)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /forbidden/i);
  });

  await t.test('6. Unauthenticated request receives 401 Unauthorized', async () => {
    const res = await request(app).post('/api/clinical/vitals').send({
      slot: 'morning',
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: 72,
      spo2: 98,
      temperatureC: 36.6,
    });

    assert.equal(res.status, 401);
  });

  // ── Physiological Impossibility Validation Tests ──────────────────

  await t.test('7. Rejects biologically impossible Heart Rate (HR = 900 bpm)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 900, // Impossible
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.details[0].message, /heart rate exceeds/i);
  });

  await t.test('8. Rejects biologically impossible Heart Rate (HR <= 0 or < 25 bpm)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 10, // Extreme bradycardia below survival limit
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.details[0].message, /heart rate below/i);
  });

  await t.test('9. Rejects negative SpO2 and SpO2 > 100%', async () => {
    // Test SpO2 > 100
    const resHigh = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 120, // Impossible
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(resHigh.status, 400);
    assert.match(resHigh.body.details[0].message, /spo2 cannot exceed 100/i);

    // Test negative / sub-physiological SpO2 (< 50%)
    const resLow = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: -10, // Negative
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(resLow.status, 400);
    assert.match(resLow.body.details[0].message, /spo2 below/i);
  });

  await t.test('10. Rejects Blood Pressure with Systolic <= Diastolic (e.g. 80/120 or 110/110)', async () => {
    const resInverted = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 80,
        diastolicBp: 120, // Systolic lower than diastolic
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(resInverted.status, 400);
    assert.match(resInverted.body.details[0].message, /pulse pressure/i);
  });

  await t.test('11. Rejects extreme body temperatures (< 30°C or > 44°C)', async () => {
    const resHypo = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 22.0, // Profound hypothermia
        respirationRate: 16,
      });

    assert.equal(resHypo.status, 400);
    assert.match(resHypo.body.details[0].message, /temperature below/i);

    const resHyper = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 48.0, // Fatal hyperpyrexia
        respirationRate: 16,
      });

    assert.equal(resHyper.status, 400);
    assert.match(resHyper.body.details[0].message, /temperature exceeds/i);
  });

  await t.test('12. Rejects extreme respiration rates (< 4 or > 60 breaths/min)', async () => {
    const resApnea = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 2, // Near-arrest
      });

    assert.equal(resApnea.status, 400);
    assert.match(resApnea.body.details[0].message, /respiration rate below/i);
  });

  await t.test('13. Rejects invalid slot name (e.g., "noon" or "afternoon")', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'afternoon', // Invalid
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.details[0].message, /slot must be one of/i);
  });

  await t.test('14. Rejects invalid symptom or exceeding symptom cap (> 4 symptoms)', async () => {
    const resInvalidSymptom = await request(app)
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
        symptomFlags: ['non_existent_symptom'],
      });

    assert.equal(resInvalidSymptom.status, 400);
    assert.match(resInvalidSymptom.body.details[0].message, /invalid symptom flag/i);

    const resTooMany = await request(app)
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
        symptomFlags: ['dyspnea', 'chest_pain', 'dizziness', 'confusion', 'swelling'], // 5 symptoms (cap is 4)
      });

    assert.equal(resTooMany.status, 400);
    assert.match(resTooMany.body.details[0].message, /cannot record more than 4 symptoms/i);
  });

  // ── Retrieval and History Tests ───────────────────────────────────

  await t.test('15. Patient retrieves their vitals history (GET /api/clinical/vitals)', async () => {
    const res = await request(app)
      .get('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'patient');
    assert.equal(res.body.patientId, patientId.toString());
    assert.ok(Array.isArray(res.body.vitals), 'Should return an array of vitals');
    assert.ok(res.body.vitals.length >= 2, 'Should contain at least the 2 patient submitted readings');
  });

  await t.test('16. Doctor retrieves assigned patient vitals history', async () => {
    const res = await request(app)
      .get(`/api/clinical/vitals?patientId=${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'doctor');
    assert.equal(res.body.patientId, patientId.toString());
    assert.ok(res.body.vitals.length >= 2);
  });

  await t.test('17. Caregiver has read-only access to linked patient vitals history (FR8)', async () => {
    const res = await request(app)
      .get('/api/clinical/vitals')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'caregiver');
    assert.equal(res.body.patientId, patientId.toString());
    assert.ok(res.body.vitals.length >= 2);
  });

  // ── NFR4 Mandate Verification (Zero-Wearable Independence) ─────────

  await t.test('18. NFR4 Verification: Manual entry requires zero connected wearables', async () => {
    const wearableStatus = await checkWearableConnectionStatus(patientId.toString());
    assert.equal(wearableStatus.isConnected, false);
    assert.match(wearableStatus.message, /zero external wearables connected/i);

    // Verify system continues to accept manual readings regardless of wearable absence
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        systolicBp: 118,
        diastolicBp: 78,
        heartRate: 70,
        spo2: 99,
        temperatureC: 36.5,
        respirationRate: 14,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.vitals.source, 'manual');
  });
});
