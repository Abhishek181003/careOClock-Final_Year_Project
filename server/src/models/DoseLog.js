import mongoose from 'mongoose';

const doseLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Dose log must be linked to a patient profile'],
      index: true,
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Dose log must be linked to a specific medicine'],
      index: true,
    },
    action: {
      type: String,
      enum: {
        values: ['taken', 'missed', 'skipped'],
        message: 'Action must be taken, missed, or skipped',
      },
      required: [true, 'Dose action is required'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    quantity: {
      type: Number,
      min: [1, 'Dose quantity must be at least 1'],
      default: 1,
    },
    slot: {
      type: String,
      trim: true,
      default: 'morning',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [300, 'Notes cannot exceed 300 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for time-window adherence queries and medicine history
doseLogSchema.index({ patientId: 1, timestamp: -1 });
doseLogSchema.index({ medicineId: 1, timestamp: -1 });
doseLogSchema.index({ patientId: 1, action: 1, timestamp: -1 });

const DoseLog = mongoose.model('DoseLog', doseLogSchema);
export default DoseLog;
