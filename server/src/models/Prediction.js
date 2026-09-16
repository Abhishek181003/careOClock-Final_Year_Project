import mongoose from 'mongoose';

const predictionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Prediction must be linked to a patient profile'],
      index: true,
    },
    vitalsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vitals',
      required: [true, 'Prediction must be associated with a vitals reading'],
      index: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    overallTier: {
      type: String,
      enum: {
        values: ['Low', 'Moderate', 'High', 'Critical', 'Pending'],
        message: 'Overall tier must be Low, Moderate, High, Critical, or Pending',
      },
      required: [true, 'Overall clinical risk tier is required'],
    },
    colorCode: {
      type: String,
      enum: {
        values: ['Green', 'Amber', 'Red'],
        message: 'Color code must be Green, Amber, or Red',
      },
      required: [true, 'Traffic light color code is required (FR5)'],
    },
    overallScore: {
      type: Number,
      min: [0, 'Overall score cannot be negative'],
      max: [100, 'Overall score cannot exceed 100'],
      required: [true, '0-100 composite score is required (H-1)'],
    },
    source: {
      type: String,
      enum: ['layer1_only', 'hybrid', 'fallback'],
      default: 'hybrid',
    },
    baselineStatus: {
      type: String,
      enum: {
        values: ['building', 'mature', 'unavailable'],
        message: 'Baseline status must be building, mature, or unavailable',
      },
      required: [true, 'Personal baseline status is required (H-2)'],
    },
    layer1: {
      tier: { type: String, default: null },
      news2Subtotal: { type: Number, default: 0 },
      careAdditionsSubtotal: { type: Number, default: 0 },
      redFlagTriggered: { type: Boolean, default: false },
      componentPoints: { type: mongoose.Schema.Types.Mixed, default: {} },
      parametersUsed: { type: [String], default: [] },
    },
    layer2: {
      status: { type: String, default: null },
      tier: { type: String, default: null },
      maxAbsZ: { type: Number, default: 0 },
      featureDeviations: { type: mongoose.Schema.Types.Mixed, default: {} },
      anomalyScore: { type: Number, default: null },
    },
    // NFR5 Structural Enforcement: A risk tier is NEVER returned without an explanation
    patientExplanation: {
      type: String,
      required: [true, 'Patient plain-language explanation is structurally mandatory (NFR5)'],
    },
    patientTemplate: {
      key: { type: String, default: 'vitals_steady' },
      params: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    doctorExplanation: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Doctor clinical explanation is structurally mandatory (NFR5)'],
    },
    executionTimeMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound Indexes (Canonical Spec §4 & Triage Sorting) ───────────
predictionSchema.index({ patientId: 1, recordedAt: -1 });
predictionSchema.index({ overallTier: 1, overallScore: -1 });

const Prediction = mongoose.model('Prediction', predictionSchema);
export default Prediction;
