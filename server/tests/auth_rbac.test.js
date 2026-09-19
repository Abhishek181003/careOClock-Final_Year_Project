import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import AuditLog from '../src/models/AuditLog.js';
import { connectDB } from '../src/db/connection.js';

let doctorToken = '';
let doctorId = '';
let patientToken = '';
let patientId = '';
let caregiverToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();
  await Promise.all([User.syncIndexes(), Patient.syncIndexes(), CaregiverLink.syncIndexes()]);
  // Clear collections for test isolation
  await User.deleteMany({ email: { $regex: /@test-careoclock\.com$/ } });
  await Patient.deleteMany({});
  await CaregiverLink.deleteMany({});
  await AuditLog.deleteMany({});
});

after(async () => {
  // Cleanup test users
  await User.deleteMany({ email: { $regex: /@test-careoclock\.com$/ } });
  await Patient.deleteMany({});
  await CaregiverLink.deleteMany({});
  await AuditLog.deleteMany({});
  await mongoose.disconnect();
});

test('1. Doctor Registration & Listing (P2-7)', async (t) => {
  await t.test('Rejects doctor registration without valid invite code (P2-7)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'unauth.doc@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Dr. Fake',
      role: 'doctor',
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /invite code/i);
  });

  await t.test('Successfully registers a new doctor with valid invite code', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'doctor.smith@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Dr. Sarah Smith, MD',
      role: 'doctor',
      doctorInviteCode: DOC_INVITE_CODE,
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.ok(res.body.refreshToken);
    assert.equal(res.body.user.role, 'doctor');
    assert.equal(res.body.user.email, 'doctor.smith@test-careoclock.com');

    doctorToken = res.body.token;
    doctorId = res.body.user.id;
  });

  await t.test('GET /api/auth/doctors lists registered doctors and excludes passwordHash', async () => {
    const res = await request(app).get('/api/auth/doctors');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.doctors));
    const foundDoctor = res.body.doctors.find((d) => d.email === 'doctor.smith@test-careoclock.com');
    assert.ok(foundDoctor);
    assert.equal(foundDoctor.displayName, 'Dr. Sarah Smith, MD');
    assert.equal(foundDoctor.passwordHash, undefined);
  });
});

test('2. Patient Registration with Optional Doctor Assignment (Decoupled Flow)', async (t) => {
  await t.test('Succeeds registration when assignedDoctorId is missing (supports post-login connection)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient.solo@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Solo Patient',
      role: 'patient',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.patient.assignedDoctorId, null);
  });

  await t.test('Fails registration when assignedDoctorId is provided but not a valid doctor', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient.fake@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Fake Doc Patient',
      role: 'patient',
      assignedDoctorId: fakeId,
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /not found/i);
  });

  await t.test('Succeeds registration with valid doctor and intake data', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient.john@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'John Doe',
      role: 'patient',
      assignedDoctorId: doctorId,
      age: 72,
      sex: 'male',
      heightCm: 175,
      weightKg: 78,
      smokingPackYears: 10,
      existingConditions: ['Hypertension', 'Type 2 Diabetes'],
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'patient');
    assert.ok(res.body.patient);
    assert.equal(res.body.patient.assignedDoctorId, doctorId);
    assert.equal(res.body.patient.bmi, 25.5);

    patientToken = res.body.token;
    patientId = res.body.patient._id;
  });
});

test('3. Caregiver Registration & Authentication', async (t) => {
  await t.test('Successfully registers a caregiver account linked to patient', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'caregiver.emma@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Emma Doe (Daughter)',
      role: 'caregiver',
      patientId: patientId,
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'caregiver');

    caregiverToken = res.body.token;
  });

  await t.test('Login with valid credentials returns JWT token with role claim', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'caregiver.emma@test-careoclock.com',
      password: 'SecurePassword123!',
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.ok(res.body.refreshToken);
    assert.equal(res.body.user.role, 'caregiver');
  });

  await t.test('Login with invalid password fails with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'caregiver.emma@test-careoclock.com',
      password: 'WrongPassword!',
    });

    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid/i);
  });
});

test('4. Server-Side RBAC Enforcement & NFR1 Security (Caregiver 403 on Write)', async (t) => {
  await t.test('Unauthenticated request to clinical route returns 401 Unauthorized', async () => {
    const res = await request(app).post('/api/clinical/vitals').send({
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: 72,
      spo2: 98,
      temperatureC: 36.8,
    });
    assert.equal(res.status, 401);
  });

  // PROOF OF NFR1: Caregiver token must get a 403 on any clinical write attempt
  await t.test('NFR1: Caregiver token attempting POST /api/clinical/vitals returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({
        systolicBp: 130,
        diastolicBp: 85,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.8,
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /forbidden.*caregiver/i);
  });

  await t.test('NFR1: Caregiver token attempting POST /api/clinical/prescriptions returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({
        patientId: patientId,
        medicationName: 'Amlodipine 5mg',
        dose: '1 tablet',
        schedule: ['08:00'],
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /forbidden.*caregiver/i);
  });

  await t.test('Patient token attempting POST /api/clinical/prescriptions returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId: patientId,
        medicationName: 'Lisinopril 10mg',
        dose: '10mg',
        schedule: ['08:00'],
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /forbidden.*patient/i);
  });

  await t.test('Patient token attempting POST /api/clinical/vitals succeeds with 201 Created', async () => {
    const res = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        systolicBp: 128,
        diastolicBp: 82,
        heartRate: 74,
        spo2: 97,
        temperatureC: 36.6,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.recordedBy, 'patient');
    assert.equal(res.body.vitals.systolicBp, 128);
    assert.equal(res.body.patientId, patientId);
  });

  await t.test('Doctor token attempting POST /api/clinical/prescriptions succeeds with 201 Created', async () => {
    const res = await request(app)
      .post('/api/clinical/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patientId,
        medicationName: 'Metformin 500mg',
        dose: '1 tablet twice daily',
        schedule: ['08:00', '20:00'],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.prescription.medicationName, 'Metformin 500mg');
  });

  await t.test('Caregiver token has read-only access to GET /api/clinical/vitals (200 OK)', async () => {
    const res = await request(app)
      .get('/api/clinical/vitals')
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.viewerRole, 'caregiver');
    assert.equal(res.body.patientId, patientId);
  });
});

test('5. Post-Login Multi-Way Connections & Profile Updates', async (t) => {
  let soloPatientToken = null;
  let soloPatientId = null;

  await t.test('Patient registers solo and connects doctor post-login', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      email: 'solo.connect@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'Solo Connector',
      role: 'patient',
    });
    assert.equal(regRes.status, 201);
    soloPatientToken = regRes.body.token;
    soloPatientId = regRes.body.patient._id;
    assert.equal(regRes.body.patient.assignedDoctorId, null);

    // Now assign doctor post-login
    const assignRes = await request(app)
      .put('/api/auth/assign-doctor')
      .set('Authorization', `Bearer ${soloPatientToken}`)
      .send({ doctorId: doctorId });

    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.patient.assignedDoctorId._id, doctorId);
  });

  await t.test('Patient updates baseline health profile via PUT /api/auth/profile', async () => {
    const profRes = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${soloPatientToken}`)
      .send({
        displayName: 'Solo Connector Updated',
        age: 75,
        heightCm: 172,
        weightKg: 70,
        existingConditions: ['Mild Asthma'],
      });

    assert.equal(profRes.status, 200);
    assert.equal(profRes.body.user.displayName, 'Solo Connector Updated');
    assert.equal(profRes.body.patient.age, 75);
    assert.deepEqual(profRes.body.patient.existingConditions, ['Mild Asthma']);
  });

  await t.test('Patient generates 8-char caregiver invite and new caregiver accepts it', async () => {
    const inviteRes = await request(app)
      .post('/api/caregiver/invite')
      .set('Authorization', `Bearer ${soloPatientToken}`);

    assert.equal(inviteRes.status, 201);
    assert.ok(inviteRes.body.inviteCode);
    const shortCode = inviteRes.body.inviteCode;

    // Register a new unlinked caregiver
    const cgReg = await request(app).post('/api/auth/register').send({
      email: 'new.cg@test-careoclock.com',
      password: 'SecurePassword123!',
      displayName: 'New Caregiver',
      role: 'caregiver',
    });
    assert.equal(cgReg.status, 201);
    const newCgToken = cgReg.body.token;

    // Accept invite with the 8-char code
    const acceptRes = await request(app)
      .post('/api/caregiver/accept')
      .set('Authorization', `Bearer ${newCgToken}`)
      .send({ inviteCode: shortCode });

    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.link.patientId, soloPatientId);
  });
});
