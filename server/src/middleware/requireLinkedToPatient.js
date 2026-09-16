import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Middleware: Resource-Level Patient Authorization (C-1 / IDOR Defense)
 * Verifies that the authenticated requester has an active, legitimate medical
 * or caregiving relationship with the target patientId.
 *
 * Rejection Contract: Returns 404 Not Found (never 403) to prevent patientId
 * enumeration attacks across tenants (OWASP API Security Top 10 - API1:2023).
 */
export async function requireLinkedToPatient(req, res, next) {
  try {
    const patientId = req.params.patientId || req.query.patientId || req.body?.patientId;

    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(404).json({ error: 'Patient record not found.' });
    }

    const { id: userId, role } = req.user;
    let targetPatient = null;

    if (role === 'patient') {
      // Patient can only access their own profile
      targetPatient = await Patient.findOne({ _id: patientId, userId });
    } else if (role === 'doctor') {
      // Doctor can only access their assigned patients
      targetPatient = await Patient.findOne({ _id: patientId, assignedDoctorId: userId });
    } else if (role === 'caregiver') {
      // Caregiver can only access patients with an 'active' link
      const activeLink = await CaregiverLink.findOne({
        patientId,
        caregiverUserId: userId,
        status: 'active',
      });
      if (activeLink) {
        targetPatient = await Patient.findById(patientId);
      }
    }

    if (!targetPatient) {
      // Log unauthorized access attempt for clinical security audit
      await AuditLog.logEvent({
        action: 'IDOR_ACCESS_PREVENTED',
        userId,
        role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: {
          targetPatientId: patientId,
          requestedPath: req.originalUrl,
          method: req.method,
        },
      });

      return res.status(404).json({ error: 'Patient record not found.' });
    }

    // Attach resolved patient entity to request for downstream handlers
    req.targetPatient = targetPatient;
    next();
  } catch {
    return res.status(500).json({ error: 'Internal server error while resolving patient access.' });
  }
}
