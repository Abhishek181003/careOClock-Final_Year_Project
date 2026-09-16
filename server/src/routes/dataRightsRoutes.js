import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import Vitals from '../models/Vitals.js';
import Prediction from '../models/Prediction.js';
import Prescription from '../models/Prescription.js';
import CaregiverLink from '../models/CaregiverLink.js';
import Medicine from '../models/Medicine.js';
import DoseLog from '../models/DoseLog.js';
import MedicalReport from '../models/MedicalReport.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// All data rights routes require authentication
router.use(authenticateToken);

/**
 * POST /api/data-requests/export
 * DPDP Act 2023 (Section 11) Right to Access & Portability
 * Exports a machine-readable JSON bundle of the requester's personal data.
 */
router.post('/export', async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const user = await User.findById(userId).select('-passwordHash');

    let exportBundle = {
      exportGeneratedAt: new Date().toISOString(),
      statutoryFramework: 'Digital Personal Data Protection Act, 2023 (DPDP Rules 2025)',
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };

    if (role === 'patient') {
      const patientProfile = await Patient.findOne({ userId });
      if (patientProfile) {
        const vitalsHistory = await Vitals.find({ patientId: patientProfile._id }).sort({ recordedAt: -1 });
        const predictionsHistory = await Prediction.find({ patientId: patientProfile._id }).sort({ recordedAt: -1 });
        const prescriptionsHistory = await Prescription.find({ patientId: patientProfile._id }).sort({ prescribedAt: -1 });
        const caregiverLinks = await CaregiverLink.find({ patientId: patientProfile._id }).populate('caregiverUserId', 'displayName email');
        const medicinesHistory = await Medicine.find({ patientId: patientProfile._id }).sort({ createdAt: -1 });
        const doseLogsHistory = await DoseLog.find({ patientId: patientProfile._id }).sort({ timestamp: -1 });
        const reportsHistory = await MedicalReport.find({ patientId: patientProfile._id, isActive: true }).sort({ createdAt: -1 });

        exportBundle.patientProfile = patientProfile;
        exportBundle.vitals = vitalsHistory;
        exportBundle.predictions = predictionsHistory;
        exportBundle.prescriptions = prescriptionsHistory;
        exportBundle.caregiverLinks = caregiverLinks;
        exportBundle.medicines = medicinesHistory;
        exportBundle.doseLogs = doseLogsHistory;
        exportBundle.medicalReports = reportsHistory;
      }
    }

    await AuditLog.logEvent({
      action: 'DPDP_DATA_EXPORT_REQUESTED',
      userId,
      role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { exportGeneratedAt: exportBundle.exportGeneratedAt },
    });

    return res.status(200).json({
      message: 'Data export bundle generated successfully per DPDP Act 2023 guidelines.',
      data: exportBundle,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate data export bundle.',
      message: error.message,
    });
  }
});

/**
 * POST /api/data-requests/erase
 * DPDP Act 2023 (Section 12) Right to Correction & Erasure
 * Submits an audited data erasure request tracked against the 90-day statutory resolution window.
 */
router.post('/erase', async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const requestDate = new Date();
    const statutoryDeadline = new Date(requestDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    await AuditLog.logEvent({
      action: 'DPDP_DATA_ERASURE_REQUESTED',
      userId,
      role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        requestedAt: requestDate.toISOString(),
        statutoryDeadline: statutoryDeadline.toISOString(),
        status: 'pending_review',
        statutoryPeriodDays: 90,
      },
    });

    return res.status(202).json({
      message: 'Data erasure request received and queued for review.',
      requestId: `${userId}-${Date.now()}`,
      statutoryFramework: 'Digital Personal Data Protection Act, 2023',
      requestedAt: requestDate.toISOString(),
      statutoryDeadline: statutoryDeadline.toISOString(),
      notice: 'Under DPDP Rules 2025, erasure requests are verified and resolved within the 90-day statutory window.',
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to record erasure request.',
      message: error.message,
    });
  }
});

export default router;
