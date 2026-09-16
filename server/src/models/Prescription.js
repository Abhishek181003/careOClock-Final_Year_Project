import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Prescription must be linked to a patient profile'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Prescribing doctor ID is required'],
      index: true,
    },
    medicationName: {
      type: String,
      required: [true, 'Medication name is required'],
      trim: true,
      maxlength: [200, 'Medication name cannot exceed 200 characters'],
    },
    dose: {
      type: String,
      required: [true, 'Dose is required'],
      trim: true,
      maxlength: [100, 'Dose description cannot exceed 100 characters'],
    },
    schedule: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      validate: [
        (arr) => Array.isArray(arr) && arr.length > 0,
        'At least one dosage schedule time is required',
      ],
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [500, 'Instructions cannot exceed 500 characters'],
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    prescribedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for active prescriptions query by patient
prescriptionSchema.index({ patientId: 1, isActive: 1, prescribedAt: -1 });

// Compound index for doctor's prescription history
prescriptionSchema.index({ doctorId: 1, prescribedAt: -1 });

const Prescription = mongoose.model('Prescription', prescriptionSchema);
export default Prescription;
