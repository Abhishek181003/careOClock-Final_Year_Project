import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB } from '../src/db/connection.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import Vitals from '../src/models/Vitals.js';
import Prediction from '../src/models/Prediction.js';
import AuditLog from '../src/models/AuditLog.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';
const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';

async function runAudit() {
  console.log('================================================================');
  console.log('      CAREOCLOCK PHASE 6 COMPREHENSIVE EMPIRICAL AUDIT          ');
  console.log('================================================================\n');

  await connectDB();
  await Promise.all([
    User.syncIndexes(),
    Patient.syncIndexes(),
    CaregiverLink.syncIndexes(),
    Vitals.syncIndexes(),
    Prediction.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);

  // Clean test data
  await User.deleteMany({ email: { $regex: /@audit-test\.com$/ } });
  await Patient.deleteMany({});
  await CaregiverLink.deleteMany({});
  await Vitals.deleteMany({});
  await Prediction.deleteMany({});
  await AuditLog.deleteMany({});

  console.log('1. Setting up test entities (Doctor, Patient, Caregiver, Other Doctor)...');

  // Register Doctor
  const docReg = await request(app).post('/api/auth/register').send({
    email: 'dr.smith@audit-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Sarah Smith',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  const doctorId = docReg.body.user.id;
  const docLogin = await request(app).post('/api/auth/login').send({
    email: 'dr.smith@audit-test.com',
    password: 'SecurePassword123!',
  });
  const doctorToken = docLogin.body.token;

  // Register Unassigned Doctor
  await request(app).post('/api/auth/register').send({
    email: 'dr.stranger@audit-test.com',
    password: 'SecurePassword123!',
    displayName: 'Dr. Unassigned Stranger',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  const otherDocLogin = await request(app).post('/api/auth/login').send({
    email: 'dr.stranger@audit-test.com',
    password: 'SecurePassword123!',
  });
  const otherDoctorToken = otherDocLogin.body.token;

  // Register Patient
  const patientReg = await request(app).post('/api/auth/register').send({
    email: 'patient.john@audit-test.com',
    password: 'SecurePassword123!',
    displayName: 'John Doe Senior',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 74,
    sex: 'male',
    heightCm: 172,
    weightKg: 78,
  });
  const patientUserId = patientReg.body.user.id;
  const patientDoc = await Patient.findOne({ userId: patientUserId });
  const patientId = patientDoc._id.toString();

  const patientLogin = await request(app).post('/api/auth/login').send({
    email: 'patient.john@audit-test.com',
    password: 'SecurePassword123!',
  });
  const patientToken = patientLogin.body.token;

  // Register Caregiver
  const caregiverReg = await request(app).post('/api/auth/register').send({
    email: 'caregiver.mary@audit-test.com',
    password: 'SecurePassword123!',
    displayName: 'Mary Doe',
    role: 'caregiver',
  });
  const caregiverUserId = caregiverReg.body.user.id;
  const caregiverLogin = await request(app).post('/api/auth/login').send({
    email: 'caregiver.mary@audit-test.com',
    password: 'SecurePassword123!',
  });
  const caregiverToken = caregiverLogin.body.token;

  // Link Caregiver to Patient
  await CaregiverLink.create({
    caregiverUserId,
    patientId: patientDoc._id,
    relationship: 'daughter',
    status: 'active',
  });

  console.log('   All entities registered & linked successfully.\n');

  // ===========================================================================
  // SECTION 3: REAL-WORLD CONDITION TESTING
  // ===========================================================================
  console.log('--- SECTION 3: REAL-WORLD CONDITION TESTING ---');
  const results = { sec3: [], sec4: [], sec5: {}, sec6: [], sec8: [] };

  // Probe 3.1: Empty, missing, or null body
  const emptyRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({});
  console.log(`[Probe 3.1 Empty Body] HTTP ${emptyRes.status} -> ${JSON.stringify(emptyRes.body)}`);
  results.sec3.push({ probe: 'Empty body', status: emptyRes.status, pass: emptyRes.status === 400 });

  // Probe 3.2: Null values where numbers expected
  const nullNumRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'morning', systolicBp: null, diastolicBp: null, heartRate: null, spo2: null });
  console.log(`[Probe 3.2 Null Numbers] HTTP ${nullNumRes.status} -> ${JSON.stringify(nullNumRes.body)}`);
  results.sec3.push({ probe: 'Null numbers', status: nullNumRes.status, pass: nullNumRes.status === 400 });

  // Probe 3.3: Extremely large number (HR = 99999)
  const hugeNumRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'morning', systolicBp: 120, diastolicBp: 80, heartRate: 99999, spo2: 98 });
  console.log(`[Probe 3.3 Extremely Large Number] HTTP ${hugeNumRes.status} -> ${JSON.stringify(hugeNumRes.body)}`);
  results.sec3.push({ probe: 'Extremely large number', status: hugeNumRes.status, pass: hugeNumRes.status === 400 });

  // Probe 3.4: Extremely small/negative number (HR = -10, SpO2 = -5)
  const negNumRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'morning', systolicBp: 120, diastolicBp: 80, heartRate: -10, spo2: -5 });
  console.log(`[Probe 3.4 Negative Number] HTTP ${negNumRes.status} -> ${JSON.stringify(negNumRes.body)}`);
  results.sec3.push({ probe: 'Negative number', status: negNumRes.status, pass: negNumRes.status === 400 });

  // Probe 3.5: Zero number (Heart Rate = 0)
  const zeroNumRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'morning', systolicBp: 120, diastolicBp: 80, heartRate: 0, spo2: 98 });
  console.log(`[Probe 3.5 Zero Number] HTTP ${zeroNumRes.status} -> ${JSON.stringify(zeroNumRes.body)}`);
  results.sec3.push({ probe: 'Zero number for vital', status: zeroNumRes.status, pass: zeroNumRes.status === 400 });

  // Probe 3.6: Wrong data type (text where number is expected: systolicBp = "very-high")
  const wrongTypeRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'morning', systolicBp: 'very-high', diastolicBp: 80, heartRate: 72, spo2: 98 });
  console.log(`[Probe 3.6 Wrong Data Type] HTTP ${wrongTypeRes.status} -> ${JSON.stringify(wrongTypeRes.body)}`);
  results.sec3.push({ probe: 'Wrong data type', status: wrongTypeRes.status, pass: wrongTypeRes.status === 400 });

  // Probe 3.7: Very long text (500+ chars in slot)
  const longTextRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: 'a'.repeat(600), systolicBp: 120, diastolicBp: 80, heartRate: 72, spo2: 98 });
  console.log(`[Probe 3.7 Very Long Text] HTTP ${longTextRes.status} -> ${JSON.stringify(longTextRes.body)}`);
  results.sec3.push({ probe: 'Very long text', status: longTextRes.status, pass: longTextRes.status === 400 });

  // Probe 3.8: Special characters, emoji, and non-English names
  const nonEnglishReg = await request(app).post('/api/auth/register').send({
    email: 'hindi.patient@audit-test.com',
    password: 'SecurePassword123!',
    displayName: 'सुरेश शर्मा 🏥 Elderly 🙏',
    role: 'patient',
    assignedDoctorId: doctorId,
  });
  console.log(`[Probe 3.8 Emoji & Non-English Name] HTTP ${nonEnglishReg.status} -> Name saved: ${nonEnglishReg.body.user?.displayName}`);
  results.sec3.push({ probe: 'Special characters & emoji in name', status: nonEnglishReg.status, pass: nonEnglishReg.status === 201 && nonEnglishReg.body.user.displayName.includes('सुरेश') });

  // Probe 3.9: NoSQL Injection attempt (e.g. {"$gt": ""} as patientId)
  const nosqlRes = await request(app)
    .get('/api/clinical/assessments/%7B%22%24gt%22%3A%22%22%7D')
    .set('Authorization', `Bearer ${doctorToken}`);
  console.log(`[Probe 3.9 NoSQL Injection in URL] HTTP ${nosqlRes.status} -> ${JSON.stringify(nosqlRes.body)}`);
  results.sec3.push({ probe: 'NoSQL injection attempt', status: nosqlRes.status, pass: nosqlRes.status === 404 });

  // Probe 3.10: XSS Attempt (<script>alert(1)</script> in body)
  const xssRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ slot: '<script>alert(1)</script>', systolicBp: 120, diastolicBp: 80, heartRate: 72, spo2: 98 });
  console.log(`[Probe 3.10 XSS Attempt in slot] HTTP ${xssRes.status} -> ${JSON.stringify(xssRes.body)}`);
  results.sec3.push({ probe: 'XSS attempt rejected by schema', status: xssRes.status, pass: xssRes.status === 400 });

  // Probe 3.11: Double submit (submitting 2 requests in immediate parallel)
  const [double1, double2] = await Promise.all([
    request(app).post('/api/clinical/vitals').set('Authorization', `Bearer ${patientToken}`).send({ slot: 'morning', systolicBp: 122, diastolicBp: 82, heartRate: 74, spo2: 98, temperatureC: 36.6 }),
    request(app).post('/api/clinical/vitals').set('Authorization', `Bearer ${patientToken}`).send({ slot: 'morning', systolicBp: 122, diastolicBp: 82, heartRate: 74, spo2: 98, temperatureC: 36.6 }),
  ]);
  console.log(`[Probe 3.11 Double Submit] HTTP ${double1.status} and HTTP ${double2.status} -> Both recorded safely with distinct IDs: ${double1.body.vitals?._id !== double2.body.vitals?._id}`);
  results.sec3.push({ probe: 'Double submit', status: `${double1.status}/${double2.status}`, pass: double1.status === 201 && double2.status === 201 });

  // Probe 3.12: Two different users acting concurrently on the same record
  const [userAct1, userAct2] = await Promise.all([
    request(app).post('/api/clinical/vitals').set('Authorization', `Bearer ${patientToken}`).send({ slot: 'evening', systolicBp: 125, diastolicBp: 83, heartRate: 75, spo2: 97, temperatureC: 36.7 }),
    request(app).get(`/api/clinical/assessments/${patientId}`).set('Authorization', `Bearer ${doctorToken}`),
  ]);
  console.log(`[Probe 3.12 Concurrent Users] Patient POST: HTTP ${userAct1.status}, Doctor GET: HTTP ${userAct2.status}`);
  results.sec3.push({ probe: 'Concurrent users on same record', status: `${userAct1.status}/${userAct2.status}`, pass: userAct1.status === 201 && userAct2.status === 200 });

  // Probe 3.13: Expired, missing, or tampered auth token
  const noTokenRes = await request(app).get(`/api/clinical/assessments/${patientId}`);
  const tamperedTokenRes = await request(app).get(`/api/clinical/assessments/${patientId}`).set('Authorization', 'Bearer invalid_tampered_jwt_token_12345');
  const expiredToken = jwt.sign({ id: patientUserId, role: 'patient' }, JWT_SECRET, { expiresIn: '-1s' });
  const expiredTokenRes = await request(app).get(`/api/clinical/assessments/${patientId}`).set('Authorization', `Bearer ${expiredToken}`);
  console.log(`[Probe 3.13 Auth Tokens] Missing: HTTP ${noTokenRes.status}, Tampered: HTTP ${tamperedTokenRes.status}, Expired: HTTP ${expiredTokenRes.status}`);
  results.sec3.push({ probe: 'Missing token', status: noTokenRes.status, pass: noTokenRes.status === 401 });
  results.sec3.push({ probe: 'Tampered token', status: tamperedTokenRes.status, pass: tamperedTokenRes.status === 401 });
  results.sec3.push({ probe: 'Expired token', status: expiredTokenRes.status, pass: expiredTokenRes.status === 401 });

  // Probe 3.14: Wrong role requests
  // Caregiver hitting patient-only vitals entry:
  const caregiverVitalsRes = await request(app).post('/api/clinical/vitals').set('Authorization', `Bearer ${caregiverToken}`).send({ slot: 'morning', systolicBp: 120, diastolicBp: 80, heartRate: 70, spo2: 98 });
  // Caregiver hitting doctor-only prescriptions:
  const caregiverPrescriptionRes = await request(app).post('/api/clinical/prescriptions').set('Authorization', `Bearer ${caregiverToken}`).send({ patientId, medicationName: 'Metformin', dose: '500mg', schedule: 'daily' });
  // Unassigned Doctor hitting patient assessments (IDOR C-1):
  const unassignedDocRes = await request(app).get(`/api/clinical/assessments/${patientId}`).set('Authorization', `Bearer ${otherDoctorToken}`);
  console.log(`[Probe 3.14 Role Enforcement] Caregiver vitals: HTTP ${caregiverVitalsRes.status}, Caregiver prescriptions: HTTP ${caregiverPrescriptionRes.status}, Unassigned doctor IDOR: HTTP ${unassignedDocRes.status}`);
  results.sec3.push({ probe: 'Caregiver write vitals (NFR1)', status: caregiverVitalsRes.status, pass: caregiverVitalsRes.status === 403 });
  results.sec3.push({ probe: 'Caregiver write prescription (NFR1)', status: caregiverPrescriptionRes.status, pass: caregiverPrescriptionRes.status === 403 });
  results.sec3.push({ probe: 'Unassigned doctor IDOR (C-1)', status: unassignedDocRes.status, pass: unassignedDocRes.status === 404 });

  // ===========================================================================
  // SECTION 4: SECURITY CHECK
  // ===========================================================================
  console.log('\n--- SECTION 4: SECURITY CHECK ---');

  // Check 4.1: Passwords / Tokens omitted in API response
  const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${patientToken}`);
  const assessRes = await request(app).get(`/api/clinical/assessments/${patientId}`).set('Authorization', `Bearer ${patientToken}`);
  const exportRes = await request(app).post('/api/data-requests/export').set('Authorization', `Bearer ${patientToken}`);

  const hasPasswordInMe = JSON.stringify(meRes.body).includes('password');
  const hasPasswordInAssess = JSON.stringify(assessRes.body).includes('password');
  const hasPasswordInExport = JSON.stringify(exportRes.body).includes('password');

  console.log(`[Check 4.1 Sensitive Fields] password in /auth/me: ${hasPasswordInMe}, in /assessments: ${hasPasswordInAssess}, in /data-requests/export: ${hasPasswordInExport}`);
  results.sec4.push({ check: 'Passwords excluded from all endpoints', pass: !hasPasswordInMe && !hasPasswordInAssess && !hasPasswordInExport });

  // Check 4.2: Server-side role checks on all new endpoints
  const anonAssess = await request(app).get(`/api/clinical/assessments/${patientId}`);
  const anonExport = await request(app).post('/api/data-requests/export');
  const anonErase = await request(app).post('/api/data-requests/erase');
  console.log(`[Check 4.2 Role Checks] Anonymous /assessments: ${anonAssess.status}, /export: ${anonExport.status}, /erase: ${anonErase.status}`);
  results.sec4.push({ check: 'Server-side role checks on new routes', pass: anonAssess.status === 401 && anonExport.status === 401 && anonErase.status === 401 });

  // ===========================================================================
  // SECTION 5: PERFORMANCE SANITY CHECK (500+ READINGS)
  // ===========================================================================
  console.log('\n--- SECTION 5: PERFORMANCE SANITY CHECK (500+ READINGS) ---');

  console.log('Generating 500 historical vitals readings for patient (1 year of twice-daily data)...');
  const historicalDocs = [];
  const now = Date.now();
  for (let i = 500; i >= 1; i--) {
    const recordedAt = new Date(now - i * 12 * 60 * 60 * 1000);
    const isMorning = i % 2 === 0;
    historicalDocs.push({
      patientId: patientDoc._id,
      enteredBy: patientUserId,
      recordedAt,
      slot: isMorning ? 'morning' : 'evening',
      source: 'manual',
      systolicBp: 118 + (i % 8),
      diastolicBp: 76 + (i % 6),
      heartRate: 68 + (i % 10),
      spo2: 97 + (i % 3),
      temperatureC: 36.5 + (i % 4) * 0.1,
      respirationRate: 15 + (i % 3),
    });
  }
  await Vitals.insertMany(historicalDocs);
  const totalReadings = await Vitals.countDocuments({ patientId: patientDoc._id });
  console.log(`Total vitals readings in DB for patient: ${totalReadings}`);

  // Test live POST /api/clinical/vitals with 500+ readings in DB
  const memBefore = process.memoryUsage();
  const tStart = process.hrtime.bigint();

  const perfVitalsRes = await request(app)
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

  const tEnd = process.hrtime.bigint();
  const memAfter = process.memoryUsage();

  const latencyMs = Math.round(Number(tEnd - tStart) / 1e6);
  const heapDeltaMB = ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);
  const rssMB = (memAfter.rss / (1024 * 1024)).toFixed(2);

  console.log(`[Performance Result] 500+ Readings Assessment Latency: ${latencyMs}ms (NFR2 budget: 800ms)`);
  console.log(`[Performance Result] Peak RSS: ${rssMB} MB, Heap delta: ${heapDeltaMB} MB`);
  console.log(`[Performance Result] Response Overall Tier: ${perfVitalsRes.body.assessment?.overallTier}, Baseline: ${perfVitalsRes.body.assessment?.baselineStatus}`);

  results.sec5 = {
    totalReadings,
    latencyMs,
    rssMB,
    heapDeltaMB,
    pass: latencyMs < 800 && perfVitalsRes.status === 201,
  };

  // ===========================================================================
  // SECTION 6: ERROR HANDLING & DATABASE DISCONNECT / RECONNECT
  // ===========================================================================
  console.log('\n--- SECTION 6: ERROR HANDLING ---');

  // Test 6.1: Malformed JSON syntax
  const malformedRes = await request(app)
    .post('/api/clinical/vitals')
    .set('Authorization', `Bearer ${patientToken}`)
    .set('Content-Type', 'application/json')
    .send('{"slot": "morning", "systolicBp": 120, broken_json');
  console.log(`[Probe 6.1 Malformed JSON] HTTP ${malformedRes.status} -> ${JSON.stringify(malformedRes.body)}`);
  results.sec6.push({ test: 'Malformed JSON returns clean error', status: malformedRes.status, pass: malformedRes.status === 400 });

  // Test 6.2: Fail-open resilience when AI Engine is disconnected / returns error
  // Intentionally call evaluateVitals with invalid port/host simulation
  const { evaluateVitals } = await import('../src/services/aiEngineService.js');
  // Temporary point to non-existent port to simulate sudden microservice crash
  process.env.AI_SERVICE_URL = 'http://localhost:9999';
  const simulatedVitals = {
    _id: new mongoose.Types.ObjectId(),
    patientId: patientDoc._id,
    recordedAt: new Date(),
    systolicBp: 120,
    diastolicBp: 80,
    heartRate: 72,
    spo2: 98,
    temperatureC: 36.6,
  };
  const failOpenRes = await evaluateVitals(patientDoc._id, simulatedVitals, []);
  console.log(`[Probe 6.2 AI Engine Outage] layer1: ${failOpenRes.layer1}, layer2Failed: ${failOpenRes.layer2Failed}, error: ${failOpenRes.layer1Error}`);
  // Restore correct port
  process.env.AI_SERVICE_URL = 'http://localhost:8000';
  results.sec6.push({ test: 'AI service outage handled gracefully', pass: failOpenRes.layer1 === null && failOpenRes.layer2Failed === true });

  // ===========================================================================
  // SECTION 8: DATA PRIVACY CHECK
  // ===========================================================================
  console.log('\n--- SECTION 8: DATA PRIVACY CHECK ---');

  // Check 8.1: Patient view on assessments must never expose doctor's clinical internal z-score table or raw ML parameters
  const patientAssessRes = await request(app)
    .get(`/api/clinical/assessments/${patientId}`)
    .set('Authorization', `Bearer ${patientToken}`);

  const samplePatientAssessment = patientAssessRes.body.assessments?.[0];
  const patientHasDoctorDetails = samplePatientAssessment && (
    samplePatientAssessment.doctorExplanation !== undefined ||
    samplePatientAssessment.layer1 !== undefined ||
    samplePatientAssessment.layer2 !== undefined
  );
  console.log(`[Check 8.1 Data Privacy] Patient assessment exposes doctor explanation / raw layers: ${patientHasDoctorDetails}`);
  results.sec8.push({ check: 'Patient view redacts doctor clinical layers', pass: !patientHasDoctorDetails });

  // Check 8.2: Caregiver view must never expose patient email or sensitive PII in assessments
  const caregiverAssessRes = await request(app)
    .get(`/api/clinical/assessments/${patientId}`)
    .set('Authorization', `Bearer ${caregiverToken}`);

  const caregiverPayloadStr = JSON.stringify(caregiverAssessRes.body);
  const exposesEmail = caregiverPayloadStr.includes('patient.john@audit-test.com');
  console.log(`[Check 8.2 Data Privacy] Caregiver assessment exposes patient email: ${exposesEmail}`);
  results.sec8.push({ check: 'Caregiver assessment does not expose patient email', pass: !exposesEmail });

  // Disconnect cleanly
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('                 AUDIT RUN COMPLETED                            ');
  console.log('================================================================\n');

  console.log('AUDIT SUMMARY JSON:');
  console.log(JSON.stringify(results, null, 2));
}

runAudit().catch((err) => {
  console.error('Audit run failed with error:', err);
  process.exit(1);
});
