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
import AuditLog from '../src/models/AuditLog.js';
import { connectDB } from '../src/db/connection.js';

let doctorId = '';
let doctorToken = '';
let patientId = '';
let patientToken = '';
let patientUserId = '';
let caregiverId = '';
let caregiverToken = '';
let otherPatientId = '';
let otherPatientToken = '';

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();

  // Clear test data
  await User.deleteMany({ email: { $regex: /@phase7-test\.com$/ } });

  // 1. Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doc@phase7-test.com',
    password: 'Password123!',
    displayName: 'Dr. Phase Seven',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  doctorToken = docRes.body.token;

  // 2. Patient
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'patient@phase7-test.com',
    password: 'Password123!',
    displayName: 'Patient Phase Seven',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 70,
    sex: 'female',
  });
  patientId = patRes.body.patient._id;
  patientUserId = patRes.body.user.id;
  patientToken = patRes.body.token;

  // 3. Unrelated Patient (for IDOR testing)
  const otherRes = await request(app).post('/api/auth/register').send({
    email: 'other@phase7-test.com',
    password: 'Password123!',
    displayName: 'Other Patient',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 65,
    sex: 'male',
  });
  otherPatientId = otherRes.body.patient._id;
  otherPatientToken = otherRes.body.token;

  // 4. Caregiver
  const cgRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver@phase7-test.com',
    password: 'Password123!',
    displayName: 'Caregiver Phase Seven',
    role: 'caregiver',
  });
  caregiverId = cgRes.body.user.id;
  caregiverToken = cgRes.body.token;

  // Link caregiver to patient
  await CaregiverLink.create({
    patientId,
    caregiverUserId: caregiverId,
    status: 'active',
    relationship: 'daughter',
  });
});

after(async () => {
  await Medicine.deleteMany({ patientId: { $in: [patientId, otherPatientId] } });
  await DoseLog.deleteMany({ patientId: { $in: [patientId, otherPatientId] } });
  await User.deleteMany({ email: { $regex: /@phase7-test\.com$/ } });
  await Patient.deleteMany({ _id: { $in: [patientId, otherPatientId] } });
  await CaregiverLink.deleteMany({ patientId });
  await mongoose.disconnect();
});

test('Phase 7: Medicine Management (FR6) Test Suite', async (t) => {
  let createdMedId = '';

  await t.test('1. Patient creates a new medicine entry with initial stock', async () => {
    const res = await request(app)
      .post('/api/medicines')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        name: 'Metformin',
        dosage: '500mg',
        schedule: ['morning', 'evening'],
        stockCount: 10,
        lowStockThreshold: 3,
        unit: 'tablets',
        instructions: 'Take with food',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.medicine.name, 'Metformin');
    assert.equal(res.body.medicine.stockCount, 10);
    assert.equal(res.body.medicine.schedule.length, 2);
    createdMedId = res.body.medicine._id;
  });

  await t.test('2. Patient reads their active medicines list', async () => {
    const res = await request(app)
      .get('/api/medicines')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.medicines.length >= 1);
    const med = res.body.medicines.find((m) => m._id === createdMedId);
    assert.ok(med);
    assert.equal(med.name, 'Metformin');
  });

  await t.test('3. Doctor reads assigned patient medicines via patientId query', async () => {
    const res = await request(app)
      .get(`/api/medicines?patientId=${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.medicines.length >= 1);
  });

  await t.test('4. Caregiver reads linked patient medicines via patientId query', async () => {
    const res = await request(app)
      .get(`/api/medicines?patientId=${patientId}`)
      .set('Authorization', `Bearer ${caregiverToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.medicines.length >= 1);
  });

  await t.test('5. IDOR Defense: Unrelated patient cannot read other patient medicines', async () => {
    const res = await request(app)
      .get(`/api/medicines?patientId=${patientId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);

    assert.equal(res.status, 404);
  });

  await t.test('6. Atomic Stock Depletion: Taking a dose decrements stockCount by quantity', async () => {
    const initialMed = await Medicine.findById(createdMedId);
    const initialStock = initialMed.stockCount; // 10

    const res = await request(app)
      .post(`/api/medicines/${createdMedId}/doses`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        action: 'taken',
        quantity: 1,
        slot: 'morning',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.medicine.remainingStock, initialStock - 1);
    assert.equal(res.body.doseLog.action, 'taken');

    const updatedMed = await Medicine.findById(createdMedId);
    assert.equal(updatedMed.stockCount, initialStock - 1);
  });

  await t.test('7. Dose Marked Missed: Does NOT decrement stockCount', async () => {
    const medBefore = await Medicine.findById(createdMedId);
    const stockBefore = medBefore.stockCount;

    const res = await request(app)
      .post(`/api/medicines/${createdMedId}/doses`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        action: 'missed',
        quantity: 1,
        slot: 'evening',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.doseLog.action, 'missed');

    const medAfter = await Medicine.findById(createdMedId);
    assert.equal(medAfter.stockCount, stockBefore);
  });

  await t.test('8. Edge Case & Concurrency Guard: Rejects dose taken when stock is 0', async () => {
    // Manually set stock to 0 to simulate fully depleted medication
    await Medicine.findByIdAndUpdate(createdMedId, { stockCount: 0 });

    const res = await request(app)
      .post(`/api/medicines/${createdMedId}/doses`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        action: 'taken',
        quantity: 1,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Insufficient stock count');
    assert.equal(res.body.currentStock, 0);
  });

  await t.test('9. Update Medicine & Replenish Stock Count', async () => {
    const res = await request(app)
      .put(`/api/medicines/${createdMedId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        stockCount: 20,
        dosage: '850mg',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.medicine.stockCount, 20);
    assert.equal(res.body.medicine.dosage, '850mg');
  });

  await t.test('10. Adherence Service: Calculates 7-day and 30-day metrics dynamically', async () => {
    // Seed 4 taken doses and 1 missed dose in the past 3 days
    const now = new Date();
    await DoseLog.create([
      {
        patientId,
        medicineId: createdMedId,
        action: 'taken',
        quantity: 1,
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        patientId,
        medicineId: createdMedId,
        action: 'taken',
        quantity: 1,
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        patientId,
        medicineId: createdMedId,
        action: 'missed',
        quantity: 1,
        timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
    ]);

    const res = await request(app)
      .get(`/api/medicines/adherence/${patientId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.past7Days);
    assert.ok(res.body.past30Days);
    assert.equal(typeof res.body.past7Days.dosesTaken, 'number');
    assert.ok(res.body.past7Days.dosesTaken >= 2);
    assert.ok(res.body.past7Days.dosesMissed >= 1);
    assert.ok(['Optimal', 'Suboptimal', 'Poor / Non-adherent'].includes(res.body.past7Days.status));
  });

  await t.test('11. Risk Pipeline Integration: Vitals entry attaches adherence to doctor explanation', async () => {
    const vitalsRes = await request(app)
      .post('/api/clinical/vitals')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        slot: 'morning',
        source: 'manual',
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        spo2: 98,
        temperatureC: 36.6,
        respirationRate: 16,
      });

    assert.equal(vitalsRes.status, 201);
    assert.ok(vitalsRes.body.assessment);
    // Doctor view should receive full clinical explanation with adherence
    const doctorExp = vitalsRes.body.assessment.explanation;
    assert.ok(doctorExp);
    assert.ok(doctorExp.adherence, 'Doctor explanation must contain adherence reference factor');
    assert.ok(['Optimal', 'Suboptimal', 'Poor / Non-adherent', 'No History'].includes(doctorExp.adherence.status));
    assert.equal(doctorExp.adherence.interpretation, 'Reference factor only (FR6) — does not alter numeric risk score.');
  });

  await t.test('12. DPDP Act 2023 Export: Includes medicines and dose logs', async () => {
    const exportRes = await request(app)
      .post('/api/data-requests/export')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(exportRes.status, 200);
    assert.ok(exportRes.body.data, 'Export bundle must be in body.data');
    assert.ok(Array.isArray(exportRes.body.data.medicines));
    assert.ok(exportRes.body.data.medicines.length >= 1);
    assert.ok(Array.isArray(exportRes.body.data.doseLogs));
    assert.ok(exportRes.body.data.doseLogs.length >= 1);
  });

  await t.test('13. Soft Delete: Deactivating medicine sets isActive to false', async () => {
    const delRes = await request(app)
      .delete(`/api/medicines/${createdMedId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(delRes.status, 200);

    const med = await Medicine.findById(createdMedId);
    assert.equal(med.isActive, false);

    // Should no longer appear in active list
    const listRes = await request(app)
      .get('/api/medicines')
      .set('Authorization', `Bearer ${patientToken}`);

    const found = listRes.body.medicines.find((m) => m._id === createdMedId);
    assert.equal(found, undefined);
  });

  await t.test('14. Audit Log Integrity: Verifies MEDICINE actions are recorded', async () => {
    const logs = await AuditLog.find({
      userId: patientUserId,
      action: { $in: ['MEDICINE_CREATED', 'MEDICINE_DOSE_LOGGED', 'MEDICINE_DELETED'] },
    });

    assert.ok(logs.length >= 3, 'Must record audit trail for creation, dose log, and deletion');
  });
});
