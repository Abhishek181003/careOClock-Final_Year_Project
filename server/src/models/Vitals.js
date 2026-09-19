import mongoose from 'mongoose';
import { PHYSIOLOGICAL_THRESHOLDS } from '../constants/physiologicalThresholds.js';

const vitalsSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Vitals record must be linked to a patient profile'],
      index: true,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User entering this reading must be recorded for clinical audit trail'],
      index: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    slot: {
      type: String,
      enum: {
        values: PHYSIOLOGICAL_THRESHOLDS.slots,
        message: 'Slot must be either "morning" or "evening"',
      },
      required: [true, 'Twice-daily assessment slot ("morning" or "evening") is required'],
    },
    source: {
      type: String,
      enum: {
        values: PHYSIOLOGICAL_THRESHOLDS.sources,
        message: 'Source must be "manual", "wearable", or "oauth"',
      },
      default: 'manual',
    },
    systolicBp: {
      type: Number,
      required: [true, 'Systolic blood pressure is required'],
      min: [
        PHYSIOLOGICAL_THRESHOLDS.systolicBp.min,
        `Systolic BP below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.systolicBp.min} mmHg)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.systolicBp.max,
        `Systolic BP exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.systolicBp.max} mmHg)`,
      ],
    },
    diastolicBp: {
      type: Number,
      required: [true, 'Diastolic blood pressure is required'],
      min: [
        PHYSIOLOGICAL_THRESHOLDS.diastolicBp.min,
        `Diastolic BP below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.diastolicBp.min} mmHg)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.diastolicBp.max,
        `Diastolic BP exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.diastolicBp.max} mmHg)`,
      ],
    },
    heartRate: {
      type: Number,
      required: [true, 'Heart rate is required'],
      min: [
        PHYSIOLOGICAL_THRESHOLDS.heartRate.min,
        `Heart rate below physiological minimum (${PHYSIOLOGICAL_THRESHOLDS.heartRate.min} bpm)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.heartRate.max,
        `Heart rate exceeds physiological maximum (${PHYSIOLOGICAL_THRESHOLDS.heartRate.max} bpm)`,
      ],
    },
    spo2: {
      type: Number,
      required: [true, 'Oxygen saturation (SpO2) is required'],
      min: [
        PHYSIOLOGICAL_THRESHOLDS.spo2.min,
        `SpO2 below physiological survival limit (${PHYSIOLOGICAL_THRESHOLDS.spo2.min}%)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.spo2.max,
        `SpO2 cannot exceed ${PHYSIOLOGICAL_THRESHOLDS.spo2.max}%`,
      ],
    },
    temperatureC: {
      type: Number,
      required: [true, 'Body temperature is required'],
      min: [
        PHYSIOLOGICAL_THRESHOLDS.temperatureC.min,
        `Temperature below hypothermia survival limit (${PHYSIOLOGICAL_THRESHOLDS.temperatureC.min} °C)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.temperatureC.max,
        `Temperature exceeds hyperpyrexia survival limit (${PHYSIOLOGICAL_THRESHOLDS.temperatureC.max} °C)`,
      ],
    },
    respirationRate: {
      type: Number,
      min: [
        PHYSIOLOGICAL_THRESHOLDS.respirationRate.min,
        `Respiration rate below physiological limit (${PHYSIOLOGICAL_THRESHOLDS.respirationRate.min} breaths/min)`,
      ],
      max: [
        PHYSIOLOGICAL_THRESHOLDS.respirationRate.max,
        `Respiration rate exceeds physiological limit (${PHYSIOLOGICAL_THRESHOLDS.respirationRate.max} breaths/min)`,
      ],
    },
    symptomFlags: {
      type: [
        {
          type: String,
          enum: {
            values: PHYSIOLOGICAL_THRESHOLDS.symptoms.allowed,
            message: 'Invalid symptom flag: {VALUE}',
          },
        },
      ],
      default: [],
      validate: [
        (arr) => !arr || arr.length <= PHYSIOLOGICAL_THRESHOLDS.symptoms.maxPerReading,
        `Cannot record more than ${PHYSIOLOGICAL_THRESHOLDS.symptoms.maxPerReading} symptoms per reading`,
      ],
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: '',
    },
    spo2Scale: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
    onSupplementalOxygen: {
      type: Boolean,
      default: false,
    },
    adherenceRate7d: {
      type: Number,
      min: [0.0, 'Adherence rate cannot be negative'],
      max: [1.0, 'Adherence rate cannot exceed 1.0 (100%)'],
    },
    isDemoReading: {
      type: Boolean,
      default: false,
      index: true,
    },
    vitalMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound Indexes (Canonical Spec §4) ───────────────────────────
// Index 1: Time-series sorting and triage queries
vitalsSchema.index({ patientId: 1, recordedAt: -1 });

// Index 2: Twice-daily slot lookups (morning vs evening)
vitalsSchema.index({ patientId: 1, slot: 1, recordedAt: -1 });

// Index 3: Deduplication and Layer 2 rolling 28-day window aggregation
vitalsSchema.index({ patientId: 1, recordedAt: 1, source: 1 });

// ── Pre-Save Physiological Logic Check ─────────────────────────────
vitalsSchema.pre('validate', function (next) {
  if (this.systolicBp != null && this.diastolicBp != null) {
    const pulsePressure = this.systolicBp - this.diastolicBp;
    if (pulsePressure < PHYSIOLOGICAL_THRESHOLDS.pulsePressure.minDiff) {
      return next(
        new Error(
          `Systolic blood pressure (${this.systolicBp} mmHg) must exceed diastolic (${this.diastolicBp} mmHg) ` +
            `by at least ${PHYSIOLOGICAL_THRESHOLDS.pulsePressure.minDiff} mmHg pulse pressure.`
        )
      );
    }
  }
  next();
});

const Vitals = mongoose.model('Vitals', vitalsSchema);
export default Vitals;
