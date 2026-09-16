import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Alert must be associated with a patient'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Alert must be routed to an assigned doctor'],
      index: true,
    },
    vitalsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vitals',
      required: [true, 'Alert must link to the triggering vitals reading'],
    },
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prediction',
      required: [true, 'Alert must link to the risk assessment prediction'],
    },
    tier: {
      type: String,
      enum: ['Critical', 'High', 'Moderate', 'Low'],
      required: [true, 'Alert tier is required'],
      index: true,
    },
    colorCode: {
      type: String,
      enum: ['Red', 'Amber', 'Green'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'acknowledged', 'resolved'],
      default: 'active',
      index: true,
    },
    dispatchedChannels: {
      type: [String],
      default: ['in_app'],
    },
    acknowledgedAt: {
      type: Date,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolutionNotes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast doctor triage queries
alertSchema.index({ doctorId: 1, status: 1, createdAt: -1 });
alertSchema.index({ patientId: 1, status: 1, createdAt: -1 });

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
