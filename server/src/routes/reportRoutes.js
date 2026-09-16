import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import MedicalReport from '../models/MedicalReport.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { handleReportUpload, STORAGE_BASE_DIR } from '../middleware/reportUploadMiddleware.js';

const router = express.Router();

// ── Strict Patient Authorization Helper (C-1 IDOR Defense) ─────────

async function resolveAuthorizedPatient(req, requestedPatientId) {
  const { id: userId, role } = req.user;
  let targetPatientId = requestedPatientId;

  if (role === 'patient') {
    const patient = await Patient.findOne({ userId });
    if (!patient) return null;
    // Reject attempt by patient to operate on another patient's data
    if (requestedPatientId && requestedPatientId !== patient._id.toString()) {
      return null;
    }
    return patient._id.toString();
  }

  if (!targetPatientId || !mongoose.Types.ObjectId.isValid(targetPatientId)) {
    return null;
  }

  if (role === 'doctor') {
    const patient = await Patient.findOne({ _id: targetPatientId, assignedDoctorId: userId });
    return patient ? patient._id.toString() : null;
  }

  if (role === 'caregiver') {
    const activeLink = await CaregiverLink.findOne({
      patientId: targetPatientId,
      caregiverUserId: userId,
      status: 'active',
    });
    return activeLink ? targetPatientId : null;
  }

  return null;
}

// ── Clean Report Document for Client Response ───────────────────────

function formatReportResponse(report) {
  return {
    id: report._id,
    patientId: report.patientId,
    title: report.title,
    reportType: report.reportType,
    description: report.description,
    originalFilename: report.originalFilename,
    mimeType: report.mimeType,
    fileSizeBytes: report.fileSizeBytes,
    uploaderRole: report.uploaderRole,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

// Protect all report endpoints with JWT authentication
router.use(authenticateToken);

/**
 * GET /api/reports
 * List all medical reports and prescriptions for target patient
 */
router.get('/', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const targetPatientId = await resolveAuthorizedPatient(req, req.query.patientId);
    if (!targetPatientId) {
      return res.status(404).json({ error: 'Patient record not found or access unauthorized.' });
    }

    const filter = { patientId: targetPatientId, isActive: true };
    if (req.query.reportType) {
      filter.reportType = req.query.reportType;
    }

    const reports = await MedicalReport.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Medical reports retrieved successfully',
      patientId: targetPatientId,
      count: reports.length,
      reports: reports.map(formatReportResponse),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/reports/upload
 * Upload a medical report or prescription document (PDF, JPEG, PNG <= 10MB)
 */
router.post(
  '/upload',
  requireRole(['patient', 'caregiver', 'doctor']),
  handleReportUpload,
  async (req, res) => {
    try {
      const targetPatientId = await resolveAuthorizedPatient(req, req.body.patientId);

      if (!targetPatientId) {
        // Remove uploaded file if patient authorization fails (prevents orphaned unlinked files)
        if (req.file?.path && fs.existsSync(req.file.path)) {
          await fs.promises.unlink(req.file.path).catch(() => {});
        }
        return res.status(404).json({ error: 'Target patient record not found or access unauthorized.' });
      }

      const title = (req.body.title || '').trim() || path.parse(req.file.originalname).name;
      const reportType = req.body.reportType || 'lab_report';
      const description = (req.body.description || '').trim();

      const report = await MedicalReport.create({
        patientId: targetPatientId,
        title,
        reportType,
        description,
        originalFilename: req.file.originalname,
        storedFilename: req.file.filename,
        storagePath: req.file.filename,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        uploadedBy: req.user.id,
        uploaderRole: req.user.role,
      });

      await AuditLog.logEvent({
        action: 'REPORT_UPLOADED',
        userId: req.user.id,
        role: req.user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: {
          reportId: report._id,
          patientId: targetPatientId,
          reportType: report.reportType,
          originalFilename: report.originalFilename,
          mimeType: report.mimeType,
          fileSizeBytes: report.fileSizeBytes,
        },
      });

      return res.status(201).json({
        message: 'Medical report uploaded securely',
        report: formatReportResponse(report),
      });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);

/**
 * GET /api/reports/:id
 * Retrieve metadata for a single report
 */
router.get('/:id', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid report ID format.' });
    }

    const report = await MedicalReport.findById(id);
    if (!report || !report.isActive) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const authorized = await resolveAuthorizedPatient(req, report.patientId.toString());
    if (!authorized) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    return res.status(200).json({
      message: 'Report metadata retrieved',
      report: formatReportResponse(report),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/reports/:id/view
 * Stream file inline for in-browser preview with nosniff security headers
 */
router.get('/:id/view', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid report ID format.' });
    }

    const report = await MedicalReport.findById(id);
    if (!report || !report.isActive) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const authorized = await resolveAuthorizedPatient(req, report.patientId.toString());
    if (!authorized) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // Path traversal defense: Ensure canonical path resides strictly inside STORAGE_BASE_DIR
    const safePath = path.resolve(STORAGE_BASE_DIR, report.storedFilename);
    if (!safePath.startsWith(STORAGE_BASE_DIR)) {
      return res.status(403).json({ error: 'Forbidden: Invalid storage path traversal attempt.' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File content missing from storage.' });
    }

    await AuditLog.logEvent({
      action: 'REPORT_VIEWED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { reportId: id, patientId: report.patientId, mimeType: report.mimeType },
    });

    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.originalFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', report.fileSizeBytes);

    const stream = fs.createReadStream(safePath);
    return stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/reports/:id/download
 * Download file as attachment
 */
router.get('/:id/download', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid report ID format.' });
    }

    const report = await MedicalReport.findById(id);
    if (!report || !report.isActive) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const authorized = await resolveAuthorizedPatient(req, report.patientId.toString());
    if (!authorized) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // Path traversal defense
    const safePath = path.resolve(STORAGE_BASE_DIR, report.storedFilename);
    if (!safePath.startsWith(STORAGE_BASE_DIR)) {
      return res.status(403).json({ error: 'Forbidden: Invalid storage path traversal attempt.' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File content missing from storage.' });
    }

    await AuditLog.logEvent({
      action: 'REPORT_DOWNLOADED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { reportId: id, patientId: report.patientId, originalFilename: report.originalFilename },
    });

    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.originalFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', report.fileSizeBytes);

    const stream = fs.createReadStream(safePath);
    return stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * DELETE /api/reports/:id
 * Soft delete report (or unlink physical file)
 */
router.delete('/:id', requireRole(['patient', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid report ID format.' });
    }

    const report = await MedicalReport.findById(id);
    if (!report || !report.isActive) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const authorized = await resolveAuthorizedPatient(req, report.patientId.toString());
    if (!authorized) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    report.isActive = false;
    await report.save();

    await AuditLog.logEvent({
      action: 'REPORT_DELETED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { reportId: id, patientId: report.patientId, title: report.title },
    });

    return res.status(200).json({ message: 'Medical report removed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
