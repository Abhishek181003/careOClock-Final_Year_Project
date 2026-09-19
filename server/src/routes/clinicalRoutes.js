import express from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireLinkedToPatient } from '../middleware/requireLinkedToPatient.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';
import Vitals from '../models/Vitals.js';
import Prediction from '../models/Prediction.js';
import Prescription from '../models/Prescription.js';
import Alert from '../models/Alert.js';
import { evaluateVitals } from '../services/aiEngineService.js';
import { aggregate } from '../services/aggregatorService.js';
import { dispatchAlert, acknowledgeAlert } from '../services/alertDispatchService.js';
import { reEvaluatePendingVitals } from '../services/vitalsRecoveryService.js';
import { calculateAdherence } from '../services/adherenceService.js';
import { filterPatientCaregiverView, filterDoctorView } from '../schemas/predictionSchema.js';
import { PHYSIOLOGICAL_THRESHOLDS } from '../constants/physiologicalThresholds.js';

const router = express.Router();

// All clinical routes require authentication
router.use(authenticateToken);

// ── Zod Validation Schemas (P2-13 & Phase 3 Configurable Thresholds) ────────

const vitalsSchema = z
  .object({
    patientId: z.string().optional(),
    recordedAt: z.string().datetime().or(z.date()).optional(),
    slot: z
      .enum(PHYSIOLOGICAL_THRESHOLDS.slots, {
        errorMap: () => ({
          message: `Slot must be one of: ${PHYSIOLOGICAL_THRESHOLDS.slots.join(', ')}`,
        }),
      })
      .optional()
      .default(() => (new Date().getHours() < 14 ? 'morning' : 'evening')),
    source: z
      .enum(PHYSIOLOGICAL_THRESHOLDS.sources, {
        errorMap: () => ({
          message: `Source must be one of: ${PHYSIOLOGICAL_THRESHOLDS.sources.join(', ')}`,
        }),
      })
      .optional()
      .default('manual'),
    systolicBp: z
      .number({ required_error: 'Systolic blood pressure is required' })
      .min(
        PHYSIOLOGICAL_THRESHOLDS.systolicBp.min,
        `Systolic BP below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.systolicBp.min} mmHg)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.systolicBp.max,
        `Systolic BP exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.systolicBp.max} mmHg)`
      ),
    diastolicBp: z
      .number({ required_error: 'Diastolic blood pressure is required' })
      .min(
        PHYSIOLOGICAL_THRESHOLDS.diastolicBp.min,
        `Diastolic BP below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.diastolicBp.min} mmHg)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.diastolicBp.max,
        `Diastolic BP exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.diastolicBp.max} mmHg)`
      ),
    heartRate: z
      .number({ required_error: 'Heart rate is required' })
      .min(
        PHYSIOLOGICAL_THRESHOLDS.heartRate.min,
        `Heart rate below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.heartRate.min} bpm)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.heartRate.max,
        `Heart rate exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.heartRate.max} bpm)`
      ),
    spo2: z
      .number({ required_error: 'Oxygen saturation (SpO2) is required' })
      .min(
        PHYSIOLOGICAL_THRESHOLDS.spo2.min,
        `SpO2 below physiological survival range (${PHYSIOLOGICAL_THRESHOLDS.spo2.min}%)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.spo2.max,
        `SpO2 cannot exceed ${PHYSIOLOGICAL_THRESHOLDS.spo2.max}%`
      ),
    temperatureC: z
      .number({ required_error: 'Body temperature is required' })
      .min(
        PHYSIOLOGICAL_THRESHOLDS.temperatureC.min,
        `Temperature below hypothermia limit (${PHYSIOLOGICAL_THRESHOLDS.temperatureC.min} °C)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.temperatureC.max,
        `Temperature exceeds hyperpyrexia limit (${PHYSIOLOGICAL_THRESHOLDS.temperatureC.max} °C)`
      ),
    respirationRate: z
      .number()
      .min(
        PHYSIOLOGICAL_THRESHOLDS.respirationRate.min,
        `Respiration rate below physiological limit (${PHYSIOLOGICAL_THRESHOLDS.respirationRate.min} breaths/min)`
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.respirationRate.max,
        `Respiration rate exceeds physiological limit (${PHYSIOLOGICAL_THRESHOLDS.respirationRate.max} breaths/min)`
      )
      .optional(),
    symptomFlags: z
      .array(
        z.enum(PHYSIOLOGICAL_THRESHOLDS.symptoms.allowed, {
          errorMap: (issue) => ({
            message: `Invalid symptom flag: ${issue.data}. Allowed: ${PHYSIOLOGICAL_THRESHOLDS.symptoms.allowed.join(', ')}`,
          }),
        })
      )
      .max(
        PHYSIOLOGICAL_THRESHOLDS.symptoms.maxPerReading,
        `Cannot record more than ${PHYSIOLOGICAL_THRESHOLDS.symptoms.maxPerReading} symptoms per reading`
      )
      .optional()
      .default([]),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional().default(''),
    spo2Scale: z.number().int().min(1).max(2).optional().default(1),
    onSupplementalOxygen: z.boolean().optional().default(false),
    adherenceRate7d: z.number().min(0).max(1).optional().nullable(),
    isDemoReading: z.boolean().optional().default(false),
    vitalMetadata: z.record(z.any()).optional().default({}),
  })
  .refine(
    (data) => data.systolicBp - data.diastolicBp >= PHYSIOLOGICAL_THRESHOLDS.pulsePressure.minDiff,
    {
      message: `Systolic BP must exceed diastolic BP by at least ${PHYSIOLOGICAL_THRESHOLDS.pulsePressure.minDiff} mmHg pulse pressure.`,
      path: ['systolicBp'],
    }
  );

const prescriptionSchema = z.object({
  patientId: z.string().min(1, 'patientId is required'),
  medicationName: z.string().min(2, 'Medication name is required').max(200),
  dose: z.string().min(1, 'Dose is required').max(100),
  schedule: z.array(z.string()).min(1, 'At least one schedule time is required'),
});

// ── Route Handlers ──────────────────────────────────────────────────

/**
 * POST /api/clinical/vitals
 * Log vitals reading with IDOR protection & role scoping (P2-12, FR2, NFR4).
 * Permitted roles: 'patient', 'doctor'.
 * CAREGIVER IS PROHIBITED -> Must receive 403 Forbidden (NFR1).
 */
router.post('/vitals', requireRole(['patient', 'doctor']), async (req, res) => {
  try {
    const validatedData = vitalsSchema.parse(req.body);

    // Clinician-gating for SpO2 Scale 2 (Finding 6)
    if (validatedData.spo2Scale === 2 && req.user.role !== 'doctor') {
      return res.status(403).json({
        error: 'Forbidden: SpO2 Scale 2 (COPD / hypercapnic respiratory failure target) can only be prescribed or submitted by a clinician (doctor).',
      });
    }

    let targetPatientId = null;
    let targetPatient = null;

    if (req.user.role === 'patient') {
      targetPatient = await Patient.findOne({ userId: req.user.id });
      if (!targetPatient) {
        return res.status(404).json({ error: 'Patient profile not found for authenticated user.' });
      }
      targetPatientId = targetPatient._id;
    } else if (req.user.role === 'doctor') {
      // Doctor must specify patientId and be the assigned doctor for that patient (IDOR protection - P2-12)
      if (!validatedData.patientId || !mongoose.Types.ObjectId.isValid(validatedData.patientId)) {
        return res.status(400).json({ error: 'A valid patientId must be provided by doctor.' });
      }

      targetPatient = await Patient.findOne({
        _id: validatedData.patientId,
        assignedDoctorId: req.user.id,
      });

      if (!targetPatient) {
        return res.status(403).json({
          error: 'Forbidden: You are not the assigned doctor for this patient.',
        });
      }
      targetPatientId = targetPatient._id;
    }

    // Persist vitals document to database
    const savedVitals = await Vitals.create({
      patientId: targetPatientId,
      enteredBy: req.user.id,
      recordedAt: validatedData.recordedAt ? new Date(validatedData.recordedAt) : new Date(),
      slot: validatedData.slot,
      source: validatedData.source,
      systolicBp: validatedData.systolicBp,
      diastolicBp: validatedData.diastolicBp,
      heartRate: validatedData.heartRate,
      spo2: validatedData.spo2,
      temperatureC: validatedData.temperatureC,
      respirationRate: validatedData.respirationRate,
      symptomFlags: validatedData.symptomFlags,
      notes: validatedData.notes,
      spo2Scale: validatedData.spo2Scale,
      onSupplementalOxygen: validatedData.onSupplementalOxygen,
      adherenceRate7d: validatedData.adherenceRate7d,
      isDemoReading: validatedData.isDemoReading,
      vitalMetadata: validatedData.vitalMetadata,
    });

    await AuditLog.logEvent({
      action: 'CLINICAL_WRITE_VITALS',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        patientId: targetPatientId,
        vitalsId: savedVitals._id,
        slot: savedVitals.slot,
        source: savedVitals.source,
      },
    });

    // ── Phase 6: Automated AI Evaluation & Aggregator Pipeline ─────────
    let assessmentResponse = null;
    try {
      // Query dynamic adherence statistics for this patient (FR6)
      let adherenceData = null;
      try {
        adherenceData = await calculateAdherence(targetPatientId);
        if (adherenceData?.past7Days?.adherenceRate != null && savedVitals.adherenceRate7d == null) {
          savedVitals.adherenceRate7d = adherenceData.past7Days.adherenceRate;
        }
      } catch (adhErr) {
        console.warn('[ADHERENCE-QUERY-WARN] Could not compute dynamic adherence:', adhErr.message);
      }

      // 30-day buffered window query (M-4) to prevent clock/timezone boundary edge clipping
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const history = await Vitals.find({
        patientId: targetPatientId,
        recordedAt: { $gte: thirtyDaysAgo, $lt: savedVitals.recordedAt },
      }).sort({ recordedAt: 1 });

      // Attach requestingRole for AI Engine defense-in-depth authorization (Finding 6 & Gap 1)
      savedVitals.requestingRole = req.user.role;

      const { layer1, layer2, layer2Failed, networkLatencyMs } = await evaluateVitals(
        targetPatientId,
        savedVitals,
        history
      );

      if (layer1) {
        const predictionPayload = aggregate({
          patientId: targetPatientId,
          vitalsId: savedVitals._id,
          recordedAt: savedVitals.recordedAt,
          layer1Result: layer1,
          layer2Result: layer2,
          layer2Failed,
          networkLatencyMs,
          adherence: adherenceData,
        });

        const savedPrediction = await Prediction.create(predictionPayload);

        // Clinical Alert Dispatch Pipeline (F-05)
        try {
          await dispatchAlert({
            prediction: savedPrediction,
            patient: targetPatient,
            vitals: savedVitals,
            user: req.user,
          });
        } catch (alertErr) {
          console.error('[ALERT-DISPATCH-FAIL] Failed to dispatch clinical alert:', alertErr.message);
        }

        assessmentResponse =
          req.user.role === 'doctor'
            ? filterDoctorView(savedPrediction)
            : filterPatientCaregiverView(savedPrediction);
      } else {
        // AI service offline or unreachable — fail-open contract (M-3)
        assessmentResponse = {
          overallTier: 'Pending',
          colorCode: 'Amber',
          overallScore: 0,
          explanation: 'Your reading was saved securely. Risk assessment is temporarily unavailable.',
          template: { key: 'vitals_service_offline', params: {} },
          baselineStatus: 'unavailable',
        };
      }
    } catch (aiError) {
      console.error('[AI-PIPELINE-FAIL] Risk assessment evaluation failed post-save:', aiError.message);
      // Fail-open response contract (M-3): Vitals are preserved, user receives reassuring notice
      assessmentResponse = {
        overallTier: 'Pending',
        colorCode: 'Amber',
        overallScore: 0,
        explanation: 'Your reading was saved securely. Automated risk evaluation is temporarily unavailable.',
        template: { key: 'vitals_service_offline', params: {} },
        baselineStatus: 'unavailable',
      };
    }

    const responsePayload = {
      message: 'Clinical vitals recorded successfully',
      recordedBy: req.user.role,
      patientId: targetPatientId,
      vitals: savedVitals,
    };

    if (assessmentResponse) {
      responsePayload.assessment = assessmentResponse;
    }

    return res.status(201).json(responsePayload);
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
 * POST /api/clinical/prescriptions
 * Prescribe medication / update prescription with doctor-patient assignment validation.
 * Permitted roles: 'doctor'.
 * CAREGIVER & PATIENT PROHIBITED -> Must receive 403 Forbidden (NFR1).
 */
router.post('/prescriptions', requireRole(['doctor']), async (req, res) => {
  try {
    const validatedData = prescriptionSchema.parse(req.body);

    if (!mongoose.Types.ObjectId.isValid(validatedData.patientId)) {
      return res.status(400).json({ error: 'Invalid patientId format.' });
    }

    // Verify patient is assigned to this doctor (IDOR protection - P2-12)
    const patient = await Patient.findOne({
      _id: validatedData.patientId,
      assignedDoctorId: req.user.id,
    });

    if (!patient) {
      return res.status(403).json({
        error: 'Forbidden: You can only create prescriptions for your assigned patients.',
      });
    }

    // Persist prescription to MongoDB (FR6 & FR7)
    const prescription = await Prescription.create({
      patientId: patient._id,
      doctorId: req.user.id,
      medicationName: validatedData.medicationName,
      dose: validatedData.dose,
      schedule: validatedData.schedule,
      instructions: validatedData.instructions || '',
      isActive: true,
    });

    await AuditLog.logEvent({
      action: 'CLINICAL_WRITE_PRESCRIPTION',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        prescriptionId: prescription._id,
        patientId: patient._id,
        medicationName: validatedData.medicationName,
      },
    });

    return res.status(201).json({
      message: 'Prescription created successfully by doctor',
      doctorId: req.user.id,
      patientId: patient._id,
      prescription,
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
 * GET /api/clinical/vitals
 * Read vitals history with strict role-based data scoping (FR8, P2-12, FR2).
 * Permitted roles: 'patient', 'caregiver', 'doctor'.
 */
router.get('/vitals', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    let targetPatient = null;

    if (req.user.role === 'patient') {
      targetPatient = await Patient.findOne({ userId: req.user.id });
    } else if (req.user.role === 'caregiver') {
      // Caregiver can only view vitals for their actively linked patient (FR8)
      const link = await CaregiverLink.findOne({
        caregiverUserId: req.user.id,
        status: 'active',
      });
      if (link) {
        targetPatient = await Patient.findById(link.patientId);
      }
    } else if (req.user.role === 'doctor' && req.query.patientId) {
      if (mongoose.Types.ObjectId.isValid(req.query.patientId)) {
        targetPatient = await Patient.findOne({
          _id: req.query.patientId,
          assignedDoctorId: req.user.id,
        });
      }
    }

    let vitalsList = [];
    if (targetPatient) {
      vitalsList = await Vitals.find({ patientId: targetPatient._id })
        .sort({ recordedAt: -1 })
        .limit(50);
    }

    if (targetPatient) {
      await AuditLog.logEvent({
        action: 'CLINICAL_READ_VITALS',
        userId: req.user.id,
        role: req.user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { patientId: targetPatient._id, count: vitalsList.length },
      });
    }

    return res.status(200).json({
      message: 'Clinical vitals history retrieved successfully',
      viewerRole: req.user.role,
      patientId: targetPatient?._id || null,
      vitals: vitalsList,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/clinical/assessments/:patientId
 * Read clinical risk assessment history with strict resource-level authorization (C-1 IDOR defense).
 * Permitted roles: 'patient', 'caregiver', 'doctor' (via requireLinkedToPatient).
 */
router.get(
  '/assessments/:patientId',
  requireRole(['patient', 'caregiver', 'doctor']),
  requireLinkedToPatient,
  async (req, res) => {
    try {
      const { patientId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 20;

      const predictions = await Prediction.find({ patientId })
        .sort({ recordedAt: -1 })
        .limit(limit);

      const roleFilteredList = predictions.map((pred) =>
        req.user.role === 'doctor' ? filterDoctorView(pred) : filterPatientCaregiverView(pred)
      );

      await AuditLog.logEvent({
        action: 'CLINICAL_READ_ASSESSMENTS',
        userId: req.user.id,
        role: req.user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: { patientId, count: roleFilteredList.length },
      });

      return res.status(200).json({
        message: 'Clinical assessments retrieved successfully',
        viewerRole: req.user.role,
        patientId,
        assessments: roleFilteredList,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);

/**
 * GET /api/clinical/prescriptions
 * Read prescription history with strict role scoping (FR6, FR7, FR8).
 * Permitted roles: 'patient', 'doctor', 'caregiver'.
 */
router.get('/prescriptions', requireRole(['patient', 'doctor', 'caregiver']), async (req, res) => {
  try {
    let targetPatientId = null;

    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.id });
      if (patient) targetPatientId = patient._id;
    } else if (req.user.role === 'caregiver') {
      const link = await CaregiverLink.findOne({
        caregiverUserId: req.user.id,
        status: 'active',
      });
      if (link) targetPatientId = link.patientId;
    } else if (req.user.role === 'doctor' && req.query.patientId) {
      if (mongoose.Types.ObjectId.isValid(req.query.patientId)) {
        const patient = await Patient.findOne({
          _id: req.query.patientId,
          assignedDoctorId: req.user.id,
        });
        if (patient) targetPatientId = patient._id;
      }
    }

    if (!targetPatientId) {
      return res.status(200).json({
        message: 'Prescriptions retrieved successfully',
        viewerRole: req.user.role,
        patientId: null,
        prescriptions: [],
      });
    }

    const prescriptions = await Prescription.find({
      patientId: targetPatientId,
      isActive: true,
    }).sort({ prescribedAt: -1 });

    return res.status(200).json({
      message: 'Prescriptions retrieved successfully',
      viewerRole: req.user.role,
      patientId: targetPatientId,
      prescriptions,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/clinical/patients
 * List all patients assigned to the authenticated doctor, with their latest assessment.
 * Permitted role: 'doctor'.
 */
router.get('/patients', requireRole(['doctor']), async (req, res) => {
  try {
    const assignedPatients = await Patient.find({ assignedDoctorId: req.user.id })
      .populate('userId', 'displayName email');

    const patientList = await Promise.all(
      assignedPatients.map(async (p) => {
        const latestPred = await Prediction.findOne({ patientId: p._id })
          .sort({ recordedAt: -1 });

        const filteredPred = latestPred ? filterDoctorView(latestPred) : null;
        const rawTier = filteredPred?.overallTier?.toLowerCase();
        const tier = rawTier ? (rawTier === 'low' ? 'stable' : rawTier) : 'pending';
        const keyDev =
          latestPred?.doctorExplanation?.summary ||
          latestPred?.patientExplanation ||
          'No check-ins recorded yet';

        let assessment = null;
        if (filteredPred) {
          const points = [];
          const cp = latestPred?.layer1?.componentPoints || {};
          const paramLabels = {
            respiration_rate: 'Respiration Rate',
            spo2: 'Oxygen Saturation (SpO2)',
            systolic_bp: 'Systolic Blood Pressure',
            heart_rate: 'Heart Rate',
            temperature_c: 'Body Temperature',
          };
          for (const [param, pts] of Object.entries(cp)) {
            if (pts > 0) {
              points.push({ label: paramLabels[param] || param, points: pts });
            }
          }

          const deviations = latestPred?.doctorExplanation?.baselineDeviations || [];

          assessment = {
            ...filteredPred,
            plainLanguageSummary: keyDev,
            layer1: {
              ...(filteredPred.layer1 || {}),
              points,
            },
            layer2: {
              ...(filteredPred.layer2 || {}),
              deviations,
            },
          };
        }

        return {
          id: p._id.toString(),
          name: p.userId?.displayName || 'Unnamed Patient',
          email: p.userId?.email || '',
          age: p.age || 70,
          sex: p.sex ? p.sex.charAt(0).toUpperCase() + p.sex.slice(1) : 'Not specified',
          tier,
          riskScore: filteredPred?.overallScore || 0,
          lastCheckInAt: latestPred?.recordedAt
            ? new Date(latestPred.recordedAt).toLocaleString()
            : 'No check-ins yet',
          keyDeviation: keyDev,
          assessment,
        };
      })
    );

    return res.status(200).json({
      message: 'Assigned patients retrieved successfully',
      count: patientList.length,
      patients: patientList,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/clinical/alerts
 * Read active clinical deterioration alerts (F-05).
 * Permitted roles: 'doctor', 'patient', 'caregiver'.
 */
router.get('/alerts', requireRole(['doctor', 'patient', 'caregiver']), async (req, res) => {
  try {
    const query = {};
    const status = req.query.status || 'active';

    if (req.user.role === 'doctor') {
      query.doctorId = req.user.id;
      if (status !== 'all') {
        query.status = status;
      }
      if (req.query.patientId && mongoose.Types.ObjectId.isValid(req.query.patientId)) {
        query.patientId = req.query.patientId;
      }
    } else if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.id });
      if (!patient) {
        return res.status(200).json({ message: 'No patient profile found', alerts: [] });
      }
      query.patientId = patient._id;
      if (status !== 'all') query.status = status;
    } else if (req.user.role === 'caregiver') {
      const link = await CaregiverLink.findOne({
        caregiverUserId: req.user.id,
        status: 'active',
      });
      if (!link) {
        return res.status(200).json({ message: 'No active patient link found', alerts: [] });
      }
      query.patientId = link.patientId;
      if (status !== 'all') query.status = status;
    }

    const alerts = await Alert.find(query)
      .populate('patientId', 'age sex')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      message: 'Clinical alerts retrieved successfully',
      viewerRole: req.user.role,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * PATCH /api/clinical/alerts/:alertId/acknowledge
 * Doctor acknowledges an active clinical alert.
 * Permitted roles: 'doctor'.
 */
router.patch('/alerts/:alertId/acknowledge', requireRole(['doctor']), async (req, res) => {
  try {
    const { alertId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(400).json({ error: 'Invalid alertId format.' });
    }

    const updatedAlert = await acknowledgeAlert({
      alertId,
      doctorId: req.user.id,
      resolutionNotes: req.body?.resolutionNotes || '',
    });

    if (!updatedAlert) {
      return res.status(404).json({ error: 'Alert not found or not assigned to this doctor.' });
    }

    return res.status(200).json({
      message: 'Clinical alert acknowledged successfully',
      alert: updatedAlert,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/clinical/vitals/re-evaluate-pending
 * Re-evaluates vitals records whose risk assessments were marked 'Pending' or degraded
 * due to temporary AI microservice outages (Fail-Open Recovery M-3).
 * Permitted roles: 'doctor'.
 */
router.post('/vitals/re-evaluate-pending', requireRole(['doctor']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const recoveryResult = await reEvaluatePendingVitals({ limit });

    return res.status(200).json({
      message: 'Pending vitals re-evaluation cycle completed',
      ...recoveryResult,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
