import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import Medicine from '../src/models/Medicine.js';
import DoseLog from '../src/models/DoseLog.js';
import Vitals from '../src/models/Vitals.js';
import AuditLog from '../src/models/AuditLog.js';
import { connectDB } from '../src/db/connection.js';

let doctorId = '';
let doctorToken = '';
let patientId = '';
let patientToken = '';
let patientUserId = '';
let caregiverId = '';
let caregiverToken = '';
let medicineId = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();

  // Clear test users
  await User.deleteMany({ email: { $regex: /@phase10-security\.com$/ } });

  // 1. Register Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doctor@phase10-security.com',
    password: 'Password123!',
    displayName: 'Dr. Security Auditor',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  doctorToken = docRes.body.token;

  // 2. Register Patient
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'patient@phase10-security.com',
    password: 'Password123!',
    displayName: 'Arthur Security',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 75,
    sex: 'male',
  });
  patientId = patRes.body.patient._id;
  patientUserId = patRes.body.user.id;
  patientToken = patRes.body.token;

  // 3. Register Caregiver
  const cgRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver@phase10-security.com',
    password: 'Password123!',
    displayName: 'Clara Caregiver',
    role: 'caregiver',
  });
  caregiverId = cgRes.body.user.id;
  caregiverToken = cgRes.body.token;

  // Link caregiver to patient
  await CaregiverLink.create({
    patientId,
    caregiverUserId: caregiverId,
    status: 'active',
  });

  // Create a medicine for dose testing
  const med = await Medicine.create({
    patientId,
    name: 'Amlodipine',
    dosage: '5mg',
    schedule: ['morning'],
    stockCount: 10,
    createdBy: doctorId,
  });
  medicineId = med._id.toString();
});

after(async () => {
  await Vitals.deleteMany({ patientId });
  await Medicine.deleteMany({ patientId });
  await DoseLog.deleteMany({ patientId });
  await CaregiverLink.deleteMany({ patientId });
  await Patient.deleteMany({ _id: patientId });
  await User.deleteMany({ email: { $regex: /@phase10-security\.com$/ } });
  await mongoose.disconnect();
});

test('Phase 10: Security Hardening Pass Verification', async (t) => {
  // ── 1. Helmet HTTP Security Headers ───────────────────────────────
  await t.test('1. Helmet.js: Sets strict enterprise HTTP security headers', async () => {
    const res = await request(app).get('/health');

    assert.equal(res.status, 200);

    // X-Content-Type-Options
    assert.equal(res.headers['x-content-type-options'], 'nosniff');

    // X-Frame-Options
    assert.equal(res.headers['x-frame-options'], 'DENY');

    // Strict-Transport-Security (HSTS)
    assert.ok(res.headers['strict-transport-security']);
    assert.match(res.headers['strict-transport-security'], /max-age=31536000/);

    // Content-Security-Policy (CSP)
    assert.ok(res.headers['content-security-policy']);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);

    // X-Download-Options
    assert.equal(res.headers['x-download-options'], 'noopen');

    // X-DNS-Prefetch-Control
    assert.equal(res.headers['x-dns-prefetch-control'], 'off');
  });

  // ── 2. Strict CORS Policy (Zero Wildcard) ─────────────────────────
  await t.test('2. CORS: Permits authorized frontend origin and forbids wildcards', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });

  await t.test('3. CORS: Strictly rejects unauthorized origins with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-threat-actor.org');

    assert.equal(res.status, 403);
    assert.match(res.body.error, /CORS blocked for unauthorized origin/i);
  });

  // ── 3. Authentication Rate Limiting ───────────────────────────────
  await t.test('4. Rate Limiting: Blocks excessive authentication attempts with 429', async () => {
    // Send 5 rapid requests within test limiter allowance
    for (let i = 0; i < 5; i++) {
      const okRes = await request(app)
        .post('/api/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({
          email: 'patient@phase10-security.com',
          password: 'Password123!',
        });
      assert.ok([200, 400, 401].includes(okRes.status));
    }

    // 6th request exceeds test threshold (max: 5)
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .set('x-test-rate-limit', 'true')
      .send({
        email: 'patient@phase10-security.com',
        password: 'Password123!',
      });

    assert.equal(blockedRes.status, 429);
    assert.match(blockedRes.body.error, /too many authentication attempts/i);
    assert.ok(blockedRes.headers['ratelimit-limit']);
  });

  // ── 4. NoSQL Injection Defense & Input Sanitization ───────────────
  await t.test('5. Sanitizer: Rejects NoSQL injection attempts in JSON body ($gt operator)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $gt: '' },
        password: 'arbitrary-password',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /prohibited query operator/i);
  });

  await t.test('6. Sanitizer: Rejects NoSQL injection attempts with $regex and $where', async () => {
    const resRegex = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $regex: '.*' },
        password: 'pass',
      });

    assert.equal(resRegex.status, 400);
    assert.match(resRegex.body.error, /prohibited query operator/i);

    const resWhere = await request(app)
      .post('/api/auth/login')
      .send({
        $where: 'sleep(5000)',
      });

    assert.equal(resWhere.status, 400);
    assert.match(resWhere.body.error, /prohibited query operator/i);
  });

  await t.test('7. Sanitizer: Rejects NoSQL injection in URL query parameters', async () => {
    const res = await request(app)
      .get('/api/clinical/vitals?$where=true')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /prohibited query operator/i);
  });

  await t.test('8. Sanitizer: Rejects path traversal dot notation in body keys', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        'user.role': 'admin',
        systolicBp: 120,
        diastolicBp: 80,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /prohibited query operator/i);
  });

  // ── 5. Clinical Audit Logging ─────────────────────────────────────
  await t.test('9. Audit Trail: Vitals creation records structured audit event', async () => {
    const vitalsRes = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slot: 'morning',
        heartRate: 72,
        systolicBp: 120,
        diastolicBp: 80,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(vitalsRes.status, 201);

    const auditEvent = await AuditLog.findOne({
      action: 'CLINICAL_WRITE_VITALS',
      userId: patientUserId,
    }).sort({ timestamp: -1 });

    assert.ok(auditEvent, 'AuditLog entry for CLINICAL_WRITE_VITALS must exist');
    assert.equal(auditEvent.role, 'patient');
    assert.equal(auditEvent.details.slot, 'morning');
    assert.ok(auditEvent.timestamp instanceof Date);
  });

  await t.test('10. Audit Trail: Dose logging records structured audit event', async () => {
    const doseRes = await request(app)
      .post(`/api/medicines/${medicineId}/doses`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        action: 'taken',
        quantity: 1,
        slot: 'morning',
      });

    assert.equal(doseRes.status, 201);

    const auditEvent = await AuditLog.findOne({
      action: 'MEDICINE_DOSE_LOGGED',
      userId: patientUserId,
    }).sort({ timestamp: -1 });

    assert.ok(auditEvent, 'AuditLog entry for MEDICINE_DOSE_LOGGED must exist');
    assert.equal(auditEvent.details.action, 'taken');
    assert.equal(auditEvent.details.medicineId.toString(), medicineId);
  });

  // ── 6. Privacy Enforcement & Telemetry Decoupling ─────────────────
  await t.test('11. Privacy: Caregiver vitals query never returns patient PII or credentials', async () => {
    const res = await request(app)
      .get('/api/clinical/vitals')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.vitals));
    assert.ok(res.body.vitals.length > 0);

    for (const vital of res.body.vitals) {
      // Must not expose user email, passwordHash, or personal contact info
      assert.equal(vital.email, undefined);
      assert.equal(vital.passwordHash, undefined);
      assert.equal(vital.displayName, undefined);
      assert.equal(vital.phoneNumber, undefined);
    }
  });

  await t.test('12. Privacy: Caregiver /me profile query never bundles raw medical telemetry', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    // Caregiver profile only sees linked patient display name, never clinical vitals arrays
    assert.equal(res.body.vitals, undefined);
    assert.equal(res.body.predictions, undefined);
    assert.equal(res.body.prescriptions, undefined);
  });
});
