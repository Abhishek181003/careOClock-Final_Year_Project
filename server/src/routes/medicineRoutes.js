import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Medicine from '../models/Medicine.js';
import DoseLog from '../models/DoseLog.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { calculateAdherence } from '../services/adherenceService.js';

const router = express.Router();

// ── Zod Validation Schemas ─────────────────────────────────────────

const medicineInputSchema = z.object({
  patientId: z.string().optional(),
  name: z.string().min(1, 'Medicine name is required').max(120),
  dosage: z.string().min(1, 'Dosage is required (e.g. 500mg, 1 tablet)').max(60),
  schedule: z.array(z.string()).min(1, 'At least one timing slot is required').default(['morning']),
  frequency: z.string().optional().default('daily'),
  stockCount: z.number().int().min(0, 'Stock count cannot be negative').default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  unit: z.string().optional().default('tablets'),
  instructions: z.string().max(500).optional().default(''),
});

const updateMedicineSchema = medicineInputSchema.partial();

const doseLogInputSchema = z.object({
  action: z.enum(['taken', 'missed', 'skipped'], {
    required_error: 'Action must be taken, missed, or skipped',
  }),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
  slot: z.string().optional().default('morning'),
  notes: z.string().max(300).optional().default(''),
});

// ── Helper: Resolve Target Patient with Strict Authorization ───────

async function resolveAuthorizedPatient(req, requestedPatientId) {
  const { id: userId, role } = req.user;
  let targetPatientId = requestedPatientId;

  if (role === 'patient') {
    const patient = await Patient.findOne({ userId });
    if (!patient) return null;
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

// ── Protect all medicine routes ────────────────────────────────────
router.use(authenticateToken);

/**
 * GET /api/medicines
 * List active medicines for the authenticated patient or authorized patientId
 */
router.get('/', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const patientId = await resolveAuthorizedPatient(req, req.query.patientId);
    if (!patientId) {
      return res.status(404).json({ error: 'Patient record not found or access unauthorized.' });
    }

    const medicines = await Medicine.find({ patientId, isActive: true }).sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Medicines retrieved successfully',
      patientId,
      count: medicines.length,
      medicines,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/medicines
 * Create a new medicine entry
 */
router.post('/', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const validated = medicineInputSchema.parse(req.body);
    const patientId = await resolveAuthorizedPatient(req, validated.patientId);

    if (!patientId) {
      return res.status(404).json({ error: 'Target patient record not found or access unauthorized.' });
    }

    const medicine = await Medicine.create({
      patientId,
      name: validated.name,
      dosage: validated.dosage,
      schedule: validated.schedule,
      frequency: validated.frequency,
      stockCount: validated.stockCount,
      lowStockThreshold: validated.lowStockThreshold,
      unit: validated.unit,
      instructions: validated.instructions,
      createdBy: req.user.id,
    });

    await AuditLog.logEvent({
      action: 'MEDICINE_CREATED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        medicineId: medicine._id,
        patientId,
        name: medicine.name,
        stockCount: medicine.stockCount,
      },
    });

    return res.status(201).json({
      message: 'Medicine added successfully',
      medicine,
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
 * GET /api/medicines/:id
 * Retrieve a single medicine
 */
router.get('/:id', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine ID format.' });
    }

    const medicine = await Medicine.findById(id);
    if (!medicine || !medicine.isActive) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const authorizedPatientId = await resolveAuthorizedPatient(req, medicine.patientId.toString());
    if (!authorizedPatientId) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    return res.status(200).json({
      message: 'Medicine details retrieved',
      medicine,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * PUT /api/medicines/:id
 * Update medicine details or replenish stock
 */
router.put('/:id', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine ID format.' });
    }

    const medicine = await Medicine.findById(id);
    if (!medicine || !medicine.isActive) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const authorizedPatientId = await resolveAuthorizedPatient(req, medicine.patientId.toString());
    if (!authorizedPatientId) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const validated = updateMedicineSchema.parse(req.body);

    const updatedMedicine = await Medicine.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );

    await AuditLog.logEvent({
      action: 'MEDICINE_UPDATED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        medicineId: id,
        updatedFields: Object.keys(validated),
      },
    });

    return res.status(200).json({
      message: 'Medicine updated successfully',
      medicine: updatedMedicine,
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
 * DELETE /api/medicines/:id
 * Soft-delete medicine (isActive = false)
 */
router.delete('/:id', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine ID format.' });
    }

    const medicine = await Medicine.findById(id);
    if (!medicine || !medicine.isActive) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const authorizedPatientId = await resolveAuthorizedPatient(req, medicine.patientId.toString());
    if (!authorizedPatientId) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    medicine.isActive = false;
    await medicine.save();

    await AuditLog.logEvent({
      action: 'MEDICINE_DELETED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { medicineId: id, name: medicine.name },
    });

    return res.status(200).json({
      message: 'Medicine removed successfully',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/medicines/:id/doses
 * Log dose administration (taken, missed, skipped) with atomic stock decrement
 */
router.post('/:id/doses', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { id: medicineId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(medicineId)) {
      return res.status(400).json({ error: 'Invalid medicine ID format.' });
    }

    const medicine = await Medicine.findById(medicineId);
    if (!medicine || !medicine.isActive) {
      return res.status(404).json({ error: 'Medicine not found or inactive.' });
    }

    const authorizedPatientId = await resolveAuthorizedPatient(req, medicine.patientId.toString());
    if (!authorizedPatientId) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const validated = doseLogInputSchema.parse(req.body);
    const { action, quantity, slot, notes } = validated;

    let updatedMedicine = medicine;

    // ── Atomic Stock Depletion Engine ──────────────────────────────
    if (action === 'taken') {
      // 1. Guard edge case: Stock is zero or less than requested dose
      if (medicine.stockCount < quantity) {
        return res.status(400).json({
          error: 'Insufficient stock count',
          currentStock: medicine.stockCount,
          requestedQuantity: quantity,
          message:
            medicine.stockCount === 0
              ? 'Cannot log dose: Medicine stock count is 0. Please replenish stock.'
              : `Cannot log dose: Only ${medicine.stockCount} ${medicine.unit} remaining (requested ${quantity}).`,
        });
      }

      // 2. Concurrency-safe atomic decrement ($inc with $gte guard)
      updatedMedicine = await Medicine.findOneAndUpdate(
        { _id: medicineId, stockCount: { $gte: quantity } },
        { $inc: { stockCount: -quantity } },
        { new: true }
      );

      if (!updatedMedicine) {
        return res.status(400).json({
          error: 'Insufficient stock count',
          message: 'Stock was depleted by a concurrent request. Please refresh and try again.',
        });
      }
    }

    // 3. Create dose log record
    const doseLog = await DoseLog.create({
      patientId: medicine.patientId,
      medicineId,
      action,
      quantity,
      slot,
      notes,
      recordedBy: req.user.id,
      timestamp: new Date(),
    });

    await AuditLog.logEvent({
      action: 'MEDICINE_DOSE_LOGGED',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        doseLogId: doseLog._id,
        medicineId,
        patientId: medicine.patientId,
        action,
        remainingStock: updatedMedicine.stockCount,
      },
    });

    const isLowStock = updatedMedicine.stockCount <= updatedMedicine.lowStockThreshold;

    return res.status(201).json({
      message: action === 'taken' ? 'Dose recorded and stock updated' : 'Dose status logged',
      doseLog,
      medicine: {
        id: updatedMedicine._id,
        name: updatedMedicine.name,
        remainingStock: updatedMedicine.stockCount,
        unit: updatedMedicine.unit,
        lowStockWarning: isLowStock,
        lowStockThreshold: updatedMedicine.lowStockThreshold,
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
 * GET /api/medicines/adherence/:patientId
 * Return dynamic 7-day and 30-day adherence statistics, streaks, and breakdown
 */
router.get('/adherence/:patientId', requireRole(['patient', 'caregiver', 'doctor']), async (req, res) => {
  try {
    const { patientId } = req.params;
    const authorizedPatientId = await resolveAuthorizedPatient(req, patientId);

    if (!authorizedPatientId) {
      return res.status(404).json({ error: 'Patient record not found or access unauthorized.' });
    }

    const adherenceData = await calculateAdherence(authorizedPatientId);

    return res.status(200).json({
      message: 'Adherence statistics calculated successfully',
      ...adherenceData,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
