import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import CaregiverLink from '../models/CaregiverLink.js';
import Patient from '../models/Patient.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

router.use(authenticateToken);

const acceptInviteSchema = z.object({
  inviteCode: z.string().min(4, 'Valid inviteCode is required'),
});

/**
 * POST /api/caregiver/invite
 * Patient generates an invite code for their family caregiver.
 * Permitted roles: 'patient'.
 */
router.post('/invite', requireRole(['patient']), async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found.' });
    }

    const { invite, rawToken, inviteCode, expiresAt } = await CaregiverLink.createInviteForPatient(patient._id);

    await AuditLog.logEvent({
      action: 'CAREGIVER_INVITE_GENERATED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        patientId: patient._id,
        inviteId: invite._id,
        inviteCode: invite.inviteCode || inviteCode,
        expiresAt,
      },
    });

    return res.status(201).json({
      message: 'Caregiver invite code generated successfully (valid for 48 hours)',
      inviteCode: invite.inviteCode || inviteCode || rawToken,
      rawToken,
      expiresAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/caregiver/accept
 * Caregiver redeems an invite code to link with an elderly patient.
 * Permitted roles: 'caregiver'.
 */
router.post('/accept', requireRole(['caregiver']), async (req, res) => {
  try {
    const { inviteCode } = acceptInviteSchema.parse(req.body);

    const activeLink = await CaregiverLink.acceptInvite(inviteCode, req.user.id);
    if (!activeLink) {
      return res.status(400).json({
        error: 'Invalid, expired, or already used invite code.',
      });
    }

    await AuditLog.logEvent({
      action: 'CAREGIVER_INVITE_ACCEPTED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        linkId: activeLink._id,
        patientId: activeLink.patientId,
      },
    });

    return res.status(200).json({
      message: 'Caregiver link activated successfully. You can now monitor patient vitals.',
      link: {
        id: activeLink._id,
        patientId: activeLink.patientId,
        status: activeLink.status,
        acceptedAt: activeLink.acceptedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/caregiver/links
 * View active and pending caregiver links for the current user.
 * Permitted roles: 'patient', 'caregiver'.
 */
router.get('/links', requireRole(['patient', 'caregiver']), async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.id });
      if (!patient) return res.status(200).json({ links: [] });
      query.patientId = patient._id;
    } else {
      query.caregiverUserId = req.user.id;
    }

    const links = await CaregiverLink.find(query)
      .populate({
        path: 'patientId',
        select: 'age sex assignedDoctorId',
        populate: { path: 'userId', select: 'displayName email' },
      })
      .populate('caregiverUserId', 'displayName email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Caregiver links retrieved successfully',
      links,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/caregiver/revoke/:linkId
 * Revoke an active caregiver link.
 * Permitted roles: 'patient', 'caregiver'.
 */
router.post('/revoke/:linkId', requireRole(['patient', 'caregiver']), async (req, res) => {
  try {
    const { linkId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ error: 'Invalid linkId format.' });
    }

    const link = await CaregiverLink.findById(linkId);
    if (!link) {
      return res.status(404).json({ error: 'Caregiver link not found.' });
    }

    // Verify ownership
    let isAuthorized = false;
    if (req.user.role === 'caregiver' && link.caregiverUserId?.toString() === req.user.id) {
      isAuthorized = true;
    } else if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.id });
      if (patient && link.patientId.toString() === patient._id.toString()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to revoke this link.' });
    }

    link.status = 'revoked';
    await link.save();

    await AuditLog.logEvent({
      action: 'CAREGIVER_LINK_REVOKED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        linkId: link._id,
        patientId: link.patientId,
      },
    });

    return res.status(200).json({
      message: 'Caregiver link revoked successfully.',
      linkId: link._id,
      status: 'revoked',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
