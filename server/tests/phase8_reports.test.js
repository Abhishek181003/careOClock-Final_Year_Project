import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Patient from '../src/models/Patient.js';
import CaregiverLink from '../src/models/CaregiverLink.js';
import MedicalReport from '../src/models/MedicalReport.js';
import AuditLog from '../src/models/AuditLog.js';
import { connectDB } from '../src/db/connection.js';
import { STORAGE_BASE_DIR } from '../src/middleware/reportUploadMiddleware.js';

let doctorId = '';
let doctorToken = '';
let patientId = '';
let patientToken = '';
let patientUserId = '';
let caregiverId = '';
let caregiverToken = '';
let otherPatientId = '';
let otherPatientToken = '';

let uploadedReportIds = [];
let uploadedFilePaths = [];

const DOC_INVITE_CODE = 'CAREOCLOCK-DOC-INVITE-2026';
const TEST_JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';

// Helper to create small sample buffers
const samplePdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Test PDF) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
const sampleJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9]);
const samplePngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DOCTOR_INVITE_CODE = DOC_INVITE_CODE;
  await connectDB();

  // Clean old test users
  await User.deleteMany({ email: { $regex: /@phase8-test\.com$/ } });

  // 1. Doctor
  const docRes = await request(app).post('/api/auth/register').send({
    email: 'doctor@phase8-test.com',
    password: 'Password123!',
    displayName: 'Dr. Evelyn Phase8',
    role: 'doctor',
    doctorInviteCode: DOC_INVITE_CODE,
  });
  doctorId = docRes.body.user.id;
  doctorToken = docRes.body.token;

  // 2. Patient
  const patRes = await request(app).post('/api/auth/register').send({
    email: 'patient@phase8-test.com',
    password: 'Password123!',
    displayName: 'Arthur Phase8',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 72,
    sex: 'male',
  });
  patientId = patRes.body.patient._id;
  patientUserId = patRes.body.user.id;
  patientToken = patRes.body.token;

  // 3. Unrelated Patient (for IDOR attack tests)
  const otherRes = await request(app).post('/api/auth/register').send({
    email: 'other@phase8-test.com',
    password: 'Password123!',
    displayName: 'Unrelated Patient',
    role: 'patient',
    assignedDoctorId: doctorId,
    age: 60,
    sex: 'female',
  });
  otherPatientId = otherRes.body.patient._id;
  otherPatientToken = otherRes.body.token;

  // 4. Caregiver
  const cgRes = await request(app).post('/api/auth/register').send({
    email: 'caregiver@phase8-test.com',
    password: 'Password123!',
    displayName: 'Clara Caregiver Phase8',
    role: 'caregiver',
  });
  caregiverId = cgRes.body.user.id;
  caregiverToken = cgRes.body.token;

  // Link caregiver to primary patient
  await CaregiverLink.create({
    patientId,
    caregiverUserId: caregiverId,
    status: 'active',
    relationship: 'daughter',
  });
});

after(async () => {
  // Unlink and delete physical files stored during tests
  for (const filePath of uploadedFilePaths) {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  await MedicalReport.deleteMany({ patientId: { $in: [patientId, otherPatientId] } });
  await User.deleteMany({ email: { $regex: /@phase8-test\.com$/ } });
  await Patient.deleteMany({ _id: { $in: [patientId, otherPatientId] } });
  await CaregiverLink.deleteMany({ patientId });
  await mongoose.disconnect();
});

test('Phase 8: FR7 Medical Reports & Records Management', async (t) => {
  let createdPdfReportId = '';
  let createdJpegReportId = '';

  await t.test('1. Patient can securely upload a valid PDF medical report', async () => {
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${patientToken}`)
      .field('title', 'Blood Chemistry Panel')
      .field('reportType', 'lab_report')
      .field('description', 'Comprehensive metabolic panel and lipid values')
      .attach('file', samplePdfBuffer, 'blood_chemistry.pdf');

    assert.equal(res.status, 201);
    assert.equal(res.body.report.title, 'Blood Chemistry Panel');
    assert.equal(res.body.report.reportType, 'lab_report');
    assert.equal(res.body.report.mimeType, 'application/pdf');
    assert.equal(res.body.report.originalFilename, 'blood_chemistry.pdf');
    assert.equal(res.body.report.uploaderRole, 'patient');

    createdPdfReportId = res.body.report.id;
    uploadedReportIds.push(createdPdfReportId);

    // Verify stored file on disk in private storage directory
    const storedReport = await MedicalReport.findById(createdPdfReportId);
    assert.ok(storedReport);
    const diskPath = path.join(STORAGE_BASE_DIR, storedReport.storedFilename);
    assert.ok(fs.existsSync(diskPath));
    uploadedFilePaths.push(diskPath);
  });

  await t.test('2. Doctor can upload a prescription JPEG for assigned patient', async () => {
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${doctorToken}`)
      .field('patientId', patientId)
      .field('title', 'Metformin Rx Renewal')
      .field('reportType', 'prescription')
      .field('description', 'Signed prescription scan')
      .attach('file', sampleJpegBuffer, 'rx_metformin.jpg');

    assert.equal(res.status, 201);
    assert.equal(res.body.report.title, 'Metformin Rx Renewal');
    assert.equal(res.body.report.reportType, 'prescription');
    assert.equal(res.body.report.mimeType, 'image/jpeg');
    assert.equal(res.body.report.uploaderRole, 'doctor');

    createdJpegReportId = res.body.report.id;
    uploadedReportIds.push(createdJpegReportId);

    const storedReport = await MedicalReport.findById(createdJpegReportId);
    const diskPath = path.join(STORAGE_BASE_DIR, storedReport.storedFilename);
    assert.ok(fs.existsSync(diskPath));
    uploadedFilePaths.push(diskPath);
  });

  await t.test('3. Caregiver can upload a diagnostic PNG image for linked patient', async () => {
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${caregiverToken}`)
      .field('patientId', patientId)
      .field('title', 'Chest X-Ray Digital Copy')
      .field('reportType', 'imaging')
      .attach('file', samplePngBuffer, 'chest_xray.png');

    assert.equal(res.status, 201);
    assert.equal(res.body.report.reportType, 'imaging');
    assert.equal(res.body.report.mimeType, 'image/png');
    assert.equal(res.body.report.uploaderRole, 'caregiver');

    uploadedReportIds.push(res.body.report.id);
    const storedReport = await MedicalReport.findById(res.body.report.id);
    const diskPath = path.join(STORAGE_BASE_DIR, storedReport.storedFilename);
    uploadedFilePaths.push(diskPath);
  });

  await t.test('4. Rejection of unapproved file formats (.exe, .txt, .sh)', async () => {
    // Attempt executable upload
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    const resExe = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${patientToken}`)
      .field('title', 'Malicious Script')
      .attach('file', exeBuffer, 'exploit.exe');

    assert.equal(resExe.status, 400);
    assert.match(resExe.body.error, /invalid file type/i);

    // Attempt plain text upload
    const txtBuffer = Buffer.from('Notes in plain text');
    const resTxt = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${patientToken}`)
      .field('title', 'Notes')
      .attach('file', txtBuffer, 'notes.txt');

    assert.equal(resTxt.status, 400);
    assert.match(resTxt.body.error, /invalid file type/i);
  });

  await t.test('5. Rejection of oversized files exceeding 10MB limit', async () => {
    // 10.5 MB buffer
    const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024, 0x20);
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${patientToken}`)
      .field('title', 'Oversized Scan')
      .attach('file', largeBuffer, 'huge_scan.pdf');

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'File too large');
  });

  await t.test('6. Rejection when no file is provided', async () => {
    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${patientToken}`)
      .field('title', 'Missing File');

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Missing file');
  });

  await t.test('7. Multi-role Listing: Patient, Doctor, and Caregiver can list reports', async () => {
    // Patient
    const patList = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${patientToken}`);
    assert.equal(patList.status, 200);
    assert.equal(patList.body.count, 3);

    // Doctor querying assigned patient
    const docList = await request(app)
      .get(`/api/reports?patientId=${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    assert.equal(docList.status, 200);
    assert.equal(docList.body.count, 3);

    // Caregiver querying linked patient
    const cgList = await request(app)
      .get(`/api/reports?patientId=${patientId}`)
      .set('Authorization', `Bearer ${caregiverToken}`);
    assert.equal(cgList.status, 200);
    assert.equal(cgList.body.count, 3);
  });

  await t.test('8. Filter reports by category (reportType query)', async () => {
    const res = await request(app)
      .get(`/api/reports?patientId=${patientId}&reportType=lab_report`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.reports[0].reportType, 'lab_report');
  });

  await t.test('9. C-1 IDOR Defense: Unrelated patient cannot list other patient reports', async () => {
    const res = await request(app)
      .get(`/api/reports?patientId=${patientId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);

    // Must be rejected with 404
    assert.equal(res.status, 404);
  });

  await t.test('10. C-1 IDOR Defense: Unrelated patient cannot access report metadata or stream', async () => {
    // Metadata
    const metaRes = await request(app)
      .get(`/api/reports/${createdPdfReportId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);
    assert.equal(metaRes.status, 404);

    // View stream
    const viewRes = await request(app)
      .get(`/api/reports/${createdPdfReportId}/view`)
      .set('Authorization', `Bearer ${otherPatientToken}`);
    assert.equal(viewRes.status, 404);

    // Download stream
    const dlRes = await request(app)
      .get(`/api/reports/${createdPdfReportId}/download`)
      .set('Authorization', `Bearer ${otherPatientToken}`);
    assert.equal(dlRes.status, 404);
  });

  await t.test('11. Inline View Stream: Returns 200 with inline headers and nosniff', async () => {
    const res = await request(app)
      .get(`/api/reports/${createdPdfReportId}/view`)
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.match(res.headers['content-disposition'], /^inline;/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.body.length > 0);
  });

  await t.test('12. Download Attachment Stream: Returns 200 with attachment headers', async () => {
    const res = await request(app)
      .get(`/api/reports/${createdJpegReportId}/download`)
      .set('Authorization', `Bearer ${doctorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.match(res.headers['content-disposition'], /^attachment;/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.body.length > 0);
  });

  await t.test('13. Soft Delete: Patient can delete report and subsequent access returns 404', async () => {
    const delRes = await request(app)
      .delete(`/api/reports/${createdJpegReportId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(delRes.status, 200);
    assert.match(delRes.body.message, /removed successfully/i);

    // Accessing soft-deleted report returns 404
    const getRes = await request(app)
      .get(`/api/reports/${createdJpegReportId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    assert.equal(getRes.status, 404);

    // Active listing excludes soft-deleted report
    const listRes = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${patientToken}`);
    assert.equal(listRes.body.count, 2);
  });

  await t.test('14. DPDP Act 2023 Export includes medical reports bundle', async () => {
    const exportRes = await request(app)
      .post('/api/data-requests/export')
      .set('Authorization', `Bearer ${patientToken}`);

    assert.equal(exportRes.status, 200);
    assert.ok(Array.isArray(exportRes.body.data.medicalReports));
    assert.equal(exportRes.body.data.medicalReports.length, 2);
    assert.equal(exportRes.body.data.medicalReports[0].patientId, patientId.toString());
  });

  await t.test('15. Security Audit Logging: Events recorded for upload, view, download, and delete', async () => {
    const auditEvents = await AuditLog.find({
      userId: { $in: [patientUserId, doctorId, caregiverId] },
    });

    const actions = auditEvents.map((a) => a.action);
    assert.ok(actions.includes('REPORT_UPLOADED'), 'Expected REPORT_UPLOADED in audit trail');
    assert.ok(actions.includes('REPORT_VIEWED'), 'Expected REPORT_VIEWED in audit trail');
    assert.ok(actions.includes('REPORT_DOWNLOADED'), 'Expected REPORT_DOWNLOADED in audit trail');
    assert.ok(actions.includes('REPORT_DELETED'), 'Expected REPORT_DELETED in audit trail');
  });
});
