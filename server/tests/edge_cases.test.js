import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import { generateRefreshToken } from '../src/utils/token.js';
import { connectDB } from '../src/db/connection.js';

let validDoctorId = '';
let validDoctorToken = '';
let validPatientId = '';
let anotherDoctorToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();

  try {
    await CaregiverLink.collection.dropIndexes();
  } catch (err) {
    // Collection may not exist yet on fresh database run
    void err;
  }
  await Promise.all([User.syncIndexes(), Patient.syncIndexes(), CaregiverLink.syncIndexes()]);

  await User.deleteMany({ email: { $regex: /@edge-test\.com$/ } });
  await Patient.deleteMany({});
  await CaregiverLink.deleteMany({});

  // Setup seed doctor 1
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doc.seed@edge-test.com',
    password: 'Password123!',
    displayName: 'Dr. Seed',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  validDoctorId = docRes.body.user.id;
  validDoctorToken = docRes.body.token;

  // Setup seed doctor 2 (for IDOR testing)
  const doc2Res = await request(app).post('/api/auth/register').send({
    email: 'doc2.seed@edge-test.com',
    password: 'Password123!',
    displayName: 'Dr. Other',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  anotherDoctorToken = doc2Res.body.token;

  // Setup seed patient assigned to doctor 1
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'pat.seed@edge-test.com',
    password: 'Password123!',
    displayName: 'Patient Seed',
    role: 'patient',
    assignedDoctorId: validDoctorId,
  });
  validPatientId = patRes.body.patient._id;
});

after(async () => {
  await User.deleteMany({ email: { $regex: /@edge-test\.com$/ } });
  await Patient.deleteMany({});
  await CaregiverLink.deleteMany({});
  await mongoose.disconnect();
});

test('Edge Case Suite 1: Registration Input Validation & Boundary Checks', async (t) => {
  await t.test('Rejects invalid email formats', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'Password123!',
      displayName: 'Invalid Email',
      role: 'doctor',
      doctorInviteCode: DOC_INVITE_CODE,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /validation error/i);
  });

  await t.test('Rejects short password (< 6 characters)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'shortpass@edge-test.com',
      password: '123',
      displayName: 'Short Pass',
      role: 'doctor',
      doctorInviteCode: DOC_INVITE_CODE,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /validation error/i);
  });

  await t.test('Rejects displayName containing HTML/Script tags (P1-4)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'xss.test@edge-test.com',
      password: 'Password123!',
      displayName: '<script>alert(1)</script>',
      role: 'patient',
      assignedDoctorId: validDoctorId,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /validation error/i);
  });

  await t.test('Rejects invalid role names (e.g., admin, superuser)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'admin@edge-test.com',
      password: 'Password123!',
      displayName: 'Fake Admin',
      role: 'admin',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /validation error/i);
  });

  await t.test('Rejects duplicate email with HTTP 400 (P2-8 Mongo code 11000)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'DOC.SEED@edge-test.com',
      password: 'Password123!',
      displayName: 'Duplicate Doctor',
      role: 'doctor',
      doctorInviteCode: DOC_INVITE_CODE,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already exists/i);
  });

  await t.test('Rejects caregiver registration with non-existent patientId (P2-10)', async () => {
    const fakePatientId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post('/api/auth/register').send({
      email: 'cg.fail@edge-test.com',
      password: 'Password123!',
      displayName: 'Failing Caregiver',
      role: 'caregiver',
      patientId: fakePatientId,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /patient not found/i);
  });

  await t.test('Rejects patient assigned to another patient instead of a doctor', async () => {
    const patUser = await User.findOne({ email: 'pat.seed@edge-test.com' });
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient2@edge-test.com',
      password: 'Password123!',
      displayName: 'Patient Two',
      role: 'patient',
      assignedDoctorId: patUser._id.toString(),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /assigned doctor not found/i);
  });
});

test('Edge Case Suite 2: Login & Authentication Boundaries & Brute-Force Lockout (P1-1)', async (t) => {
  await t.test('Case-insensitive login succeeds with uppercase email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'DOC.SEED@EDGE-TEST.COM',
      password: 'Password123!',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.ok(res.body.refreshToken);
    assert.equal(res.body.user.role, 'doctor');
  });

  await t.test('Non-existent email returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost.user@edge-test.com',
      password: 'Password123!',
    });
    assert.equal(res.status, 401);
  });

  await t.test('Locks account after 5 consecutive failed login attempts (P1-1)', async () => {
    // Attempt 1-4: 401 Invalid
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/login').send({
        email: 'doc.seed@edge-test.com',
        password: 'WrongPassword!',
      });
      assert.equal(res.status, 401);
    }

    // Attempt 5: Account triggers lock
    const fifthRes = await request(app).post('/api/auth/login').send({
      email: 'doc.seed@edge-test.com',
      password: 'WrongPassword!',
    });
    assert.equal(fifthRes.status, 401);

    // Attempt 6 (even with correct password): Blocked with 423 Locked
    const lockRes = await request(app).post('/api/auth/login').send({
      email: 'doc.seed@edge-test.com',
      password: 'Password123!',
    });
    assert.equal(lockRes.status, 423);
    assert.match(lockRes.body.error, /temporarily locked/i);

    // Reset lock directly in DB for remaining tests
    await User.updateOne({ email: 'doc.seed@edge-test.com' }, { $set: { failedLoginAttempts: 0, lockedUntil: null } });
  });
});

test('Edge Case Suite 3: Token Validation, Revocation & Refresh Flow (P2-3, P2-4, P2-5)', async (t) => {
  await t.test('Rejects malformed JWT strings', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid or expired token/i);
  });

  await t.test('Rejects token for non-existent user ID in database (P2-5)', async () => {
    const fakeUserId = new mongoose.Types.ObjectId().toString();
    const tokenForNonExistentUser = jwt.sign(
      { id: fakeUserId, email: 'deleted@edge-test.com', role: 'doctor', displayName: 'Ghost Doc', tokenVersion: 0 },
      TEST_JWT_SECRET,
      { expiresIn: '1h', issuer: 'careoclock-server', audience: 'careoclock-api' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenForNonExistentUser}`);

    assert.equal(res.status, 401);
    assert.match(res.body.error, /user account no longer exists/i);
  });

  await t.test('Logout invalidates all existing tokens by incrementing tokenVersion (P2-4)', async () => {
    // Login to get fresh token
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'pat.seed@edge-test.com',
      password: 'Password123!',
    });
    const currentToken = loginRes.body.token;

    // Verify token works
    const meRes1 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${currentToken}`);
    assert.equal(meRes1.status, 200);

    // Call logout endpoint
    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${currentToken}`);
    assert.equal(logoutRes.status, 200);

    // Old token should now be rejected with 401
    const meRes2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${currentToken}`);
    assert.equal(meRes2.status, 401);
    assert.match(meRes2.body.error, /revoked or invalidated/i);
  });

  await t.test('Refresh endpoint generates a new valid access token (P2-3)', async () => {
    const patUser = await User.findOne({ email: 'pat.seed@edge-test.com' });
    const refreshToken = generateRefreshToken(patUser);

    const refreshRes = await request(app).post('/api/auth/refresh').send({
      refreshToken,
    });

    assert.equal(refreshRes.status, 200);
    assert.ok(refreshRes.body.token);
    assert.ok(refreshRes.body.refreshToken);

    // Verify new access token works
    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${refreshRes.body.token}`);
    assert.equal(meRes.status, 200);
  });
});

test('Edge Case Suite 4: Clinical Routes IDOR Protection & Vitals Validation (P2-12, P2-13, FR8)', async (t) => {
  await t.test('Doctor 2 cannot write prescription for Doctor 1 assigned patient (IDOR Guard - P2-12)', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${anotherDoctorToken}`)
      .send({
        patientId: validPatientId.toString(),
        medicationName: 'Lisinopril 10mg',
        dose: '1 tablet daily',
        schedule: ['09:00'],
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /assigned patients/i);
  });

  await t.test('Doctor 2 cannot log vitals for Doctor 1 assigned patient (IDOR Guard - P2-12)', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${anotherDoctorToken}`)
      .send({
        patientId: validPatientId.toString(),
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 37.0,
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /not the assigned doctor/i);
  });

  await t.test('Rejects vitals with out-of-range physiological values (P2-13)', async () => {
    // Spo2 cannot exceed 100%
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${validDoctorToken}`)
      .send({
        patientId: validPatientId.toString(),
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 150, // Out of bounds
        temperatureC: 37.0,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /validation error/i);
  });

  await t.test('Caregiver GET /api/auth/me does not expose linked patient email (P2-11 & FR8)', async () => {
    const patRes = await request(app).post('/api/auth/register').send({
      email: 'pat.privacy@edge-test.com',
      password: 'Password123!',
      displayName: 'Patient Privacy',
      role: 'patient',
      assignedDoctorId: validDoctorId,
    });

    const cgRes = await request(app).post('/api/auth/register').send({
      email: 'cg.privacy@edge-test.com',
      password: 'Password123!',
      displayName: 'Caregiver Privacy',
      role: 'caregiver',
      patientId: patRes.body.patient._id,
    });

    assert.equal(cgRes.status, 201);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${cgRes.body.token}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.linkedPatient);
    assert.equal(res.body.linkedPatient.userId.displayName, 'Patient Privacy');
    assert.equal(res.body.linkedPatient.userId.email, undefined); // Email must not be leaked!
  });
});

test('Edge Case Suite 5: Caregiver Re-Linking After Revoke (P1-9 Partial Unique Index)', async (t) => {
  await t.test('Allows creating a new active link after previous link was revoked', async () => {
    const patIso = await request(app).post('/api/auth/register').send({
      email: 'pat.iso@edge-test.com',
      password: 'Password123!',
      displayName: 'Patient Iso',
      role: 'patient',
      assignedDoctorId: validDoctorId,
    });

    const cgIso = await request(app).post('/api/auth/register').send({
      email: 'cg.iso@edge-test.com',
      password: 'Password123!',
      displayName: 'Caregiver Iso',
      role: 'caregiver',
      patientId: patIso.body.patient._id,
    });

    const isoPatientId = patIso.body.patient._id;
    const isoCaregiverId = cgIso.body.user.id;

    // 1. Revoke existing link
    await CaregiverLink.updateMany(
      { patientId: isoPatientId, caregiverUserId: isoCaregiverId },
      { $set: { status: 'revoked' } }
    );

    // 2. Create new link for same pair (should succeed due to partialFilterExpression on status: 'active')
    const newLink = await CaregiverLink.create({
      patientId: isoPatientId,
      caregiverUserId: isoCaregiverId,
      status: 'active',
      acceptedAt: new Date(),
    });

    assert.ok(newLink);
    assert.equal(newLink.status, 'active');
  });
});
