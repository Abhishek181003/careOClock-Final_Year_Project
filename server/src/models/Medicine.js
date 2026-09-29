import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Medicine must be linked to a patient profile'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      maxlength: [120, 'Medicine name cannot exceed 120 characters'],
    },
    dosage: {
      type: String,
      required: [true, 'Dosage is required (e.g. 500mg, 1 tablet)'],
      trim: true,
      maxlength: [60, 'Dosage string cannot exceed 60 characters'],
    },
    schedule: {
      type: [String],
      default: ['morning'],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'At least one schedule timing slot must be specified',
      },
    },
    frequency: {
      type: String,
      default: 'daily',
      trim: true,
    },
    stockCount: {
      type: Number,
      required: [true, 'Stock count is required'],
      min: [0, 'Stock count cannot be negative'],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, 'Low stock threshold cannot be negative'],
      default: 5,
    },
    unit: {
      type: String,
      default: 'tablets',
      trim: true,
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [500, 'Instructions cannot exceed 500 characters'],
      default: '',
    },
    durationDays: {
      type: Number,
      default: 0, // 0 = Ongoing / Chronic; >0 = course of N days
      min: [0, 'Duration cannot be negative'],
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    clinicalJustification: {
      type: String,
      trim: true,
      maxlength: [500, 'Clinical justification cannot exceed 500 characters'],
      default: '',
    },
    prescribedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active medicines for a patient
medicineSchema.index({ patientId: 1, isActive: 1 });

const Medicine = mongoose.model('Medicine', medicineSchema);
export default Medicine;
