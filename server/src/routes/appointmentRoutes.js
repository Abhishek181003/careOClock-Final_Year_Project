import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

const createAppointmentSchema = z.object({
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  scheduledAt: z.string().datetime({ message: 'Valid ISO date string is required' }),
  timeSlot: z.string().min(1, 'Time slot is required'),
  type: z.enum(['in_person', 'video', 'routine_followup']).default('video'),
  reason: z.string().max(500).default('Routine Health Review'),
  symptoms: z.array(z.string()).default([]),
});

const patchAppointmentSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  scheduledAt: z.string().datetime().optional(),
  timeSlot: z.string().optional(),
  cancellationReason: z.string().max(500).optional(),
  doctorNotes: z.string().max(2000).optional(),
});

/**
 * GET /api/appointments
 * List real appointments for the authenticated patient, doctor, or caregiver
 */
router.get('/', async (req, res) => {
  try {
    let query = {};
    let targetPatient = null;

    if (req.user.role === 'patient') {
      targetPatient = await Patient.findOne({ userId: req.user.id });
      if (!targetPatient) {
        targetPatient = await Patient.create({ userId: req.user.id, age: 72, sex: 'male' });
      }

      query = { patientId: targetPatient._id };
    } else if (req.user.role === 'doctor') {
      query = { doctorId: req.user.id };
    } else if (req.user.role === 'caregiver') {
      const link = await CaregiverLink.findOne({
        caregiverUserId: req.user.id,
        status: 'active',
      });
      if (!link) {
        return res.status(200).json({ appointments: [] });
      }
      query = { patientId: link.patientId };
    }

    const appointments = await Appointment.find(query)
      .populate('doctorId', 'displayName email')
      .populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'displayName email' },
      })
      .sort({ scheduledAt: -1 });

    return res.status(200).json({
      message: 'Appointments retrieved successfully',
      count: appointments.length,
      appointments,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/appointments
 * Schedule a new appointment
 */
router.post('/', requireRole(['patient', 'doctor']), async (req, res) => {
  try {
    const validatedData = createAppointmentSchema.parse(req.body);

    let targetPatientId = null;
    let targetDoctorId = null;

    if (req.user.role === 'patient') {
      let patient = await Patient.findOne({ userId: req.user.id });
      if (!patient) {
        patient = await Patient.create({ userId: req.user.id, age: 72, sex: 'male' });
      }
      targetPatientId = patient._id;

      if (validatedData.doctorId && mongoose.Types.ObjectId.isValid(validatedData.doctorId)) {
        const doc = await User.findOne({ _id: validatedData.doctorId, role: 'doctor' });
        if (doc) targetDoctorId = doc._id;
      }

      if (!targetDoctorId) {
        targetDoctorId = patient.assignedDoctorId;
      }

      if (!targetDoctorId) {
        const fallbackDoc = await User.findOne({ role: 'doctor' });
        if (!fallbackDoc) {
          return res.status(400).json({ error: 'No doctor available to schedule appointment with.' });
        }
        targetDoctorId = fallbackDoc._id;
        patient.assignedDoctorId = fallbackDoc._id;
        await patient.save();
      }
    } else if (req.user.role === 'doctor') {
      targetDoctorId = req.user.id;
      if (!validatedData.patientId || !mongoose.Types.ObjectId.isValid(validatedData.patientId)) {
        return res.status(400).json({ error: 'Valid patientId required when doctor books appointment.' });
      }
      targetPatientId = validatedData.patientId;
    }

    const scheduledDate = new Date(validatedData.scheduledAt);
    const meetingRoomId = `telehealth-${Math.random().toString(36).substring(2, 9)}`;
    const meetingLink =
      validatedData.type === 'video' ? `https://meet.careoclock.com/${meetingRoomId}` : '';

    const newAppointment = await Appointment.create({
      patientId: targetPatientId,
      doctorId: targetDoctorId,
      scheduledAt: scheduledDate,
      timeSlot: validatedData.timeSlot,
      type: validatedData.type,
      status: 'scheduled',
      reason: validatedData.reason || 'General Consultation',
      symptoms: validatedData.symptoms || [],
      meetingLink,
    });

    await newAppointment.populate('doctorId', 'displayName email');
    await newAppointment.populate({
      path: 'patientId',
      populate: { path: 'userId', select: 'displayName email' },
    });

    await AuditLog.logEvent({
      action: 'APPOINTMENT_SCHEDULED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        appointmentId: newAppointment._id,
        patientId: targetPatientId,
        doctorId: targetDoctorId,
        scheduledAt: scheduledDate,
      },
    });

    return res.status(201).json({
      message: 'Appointment scheduled successfully',
      appointment: newAppointment,
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
 * PATCH /api/appointments/:id
 * Update status, reschedule, or add doctor notes
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid appointment ID format.' });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Role authorization check
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.id });
      if (!patient || appointment.patientId.toString() !== patient._id.toString()) {
        return res.status(403).json({ error: 'Forbidden: Access to this appointment is restricted.' });
      }
    } else if (req.user.role === 'doctor') {
      if (appointment.doctorId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: Access to this appointment is restricted.' });
      }
    }

    const validated = patchAppointmentSchema.parse(req.body);

    if (validated.status) {
      appointment.status = validated.status;
      if (validated.status === 'cancelled') {
        appointment.cancelledAt = new Date();
        appointment.cancellationReason = validated.cancellationReason || 'Cancelled by user';
      }
    }

    if (validated.scheduledAt) {
      appointment.scheduledAt = new Date(validated.scheduledAt);
    }

    if (validated.timeSlot) {
      appointment.timeSlot = validated.timeSlot;
    }

    if (validated.doctorNotes && req.user.role === 'doctor') {
      appointment.doctorNotes = validated.doctorNotes;
    }

    await appointment.save();
    await appointment.populate('doctorId', 'displayName email');

    await AuditLog.logEvent({
      action: 'APPOINTMENT_UPDATED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        appointmentId: appointment._id,
        status: appointment.status,
      },
    });

    return res.status(200).json({
      message: 'Appointment updated successfully',
      appointment,
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

export default router;
