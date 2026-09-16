import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient must be linked to a User account'],
      unique: true,
    },
    assignedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
      index: true,
    },
    age: {
      type: Number,
      min: [0, 'Age must be non-negative'],
      max: [130, 'Age exceeds realistic range'],
    },
    sex: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    heightCm: {
      type: Number,
      min: [50, 'Height must be positive'],
      max: [280, 'Height exceeds realistic range'],
    },
    weightKg: {
      type: Number,
      min: [10, 'Weight must be positive'],
      max: [400, 'Weight exceeds realistic range'],
    },
    bmi: {
      type: Number,
    },
    smokingPackYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    alcoholUse: {
      type: String,
      enum: ['none', 'occasional', 'moderate', 'heavy'],
      default: 'none',
    },
    existingConditions: {
      type: [
        {
          type: String,
          maxlength: [200, 'Condition description cannot exceed 200 characters'],
        },
      ],
      validate: [
        (val) => !val || val.length <= 50,
        'Cannot exceed 50 existing conditions',
      ],
      default: [],
    },
    consent: {
      deviceLinking: { type: Boolean, default: false },
      grantedAt: { type: Date },
      withdrawnAt: { type: Date },
    },
    retentionPolicyAckAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-calculate BMI before saving if height and weight are provided
patientSchema.pre('save', function (next) {
  if (this.heightCm && this.weightKg) {
    const heightInMeters = this.heightCm / 100;
    this.bmi = parseFloat((this.weightKg / (heightInMeters * heightInMeters)).toFixed(1));
  }
  next();
});

// Auto-calculate BMI on findOneAndUpdate / updateOne
patientSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  const height = update.heightCm || update.$set?.heightCm;
  const weight = update.weightKg || update.$set?.weightKg;

  if (height && weight) {
    const heightInMeters = height / 100;
    const computedBmi = parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(1));
    if (update.$set) {
      update.$set.bmi = computedBmi;
    } else {
      update.bmi = computedBmi;
    }
  }
  next();
});

// Validate referential integrity: assignedDoctorId must belong to an existing doctor
patientSchema.pre('validate', async function (next) {
  if (this.isModified('assignedDoctorId') && this.assignedDoctorId) {
    try {
      const User = mongoose.model('User');
      const doctor = await User.findOne({
        _id: this.assignedDoctorId,
        role: 'doctor',
      });
      if (!doctor) {
        return next(new Error('Assigned doctor does not exist or does not possess the doctor role.'));
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// Enforce consent withdrawal immutability: cannot silently erase withdrawnAt
patientSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('consent.withdrawnAt') && !this.consent?.withdrawnAt) {
    if (this._originalConsentWithdrawnAt) {
      return next(new Error('Consent withdrawal timestamp cannot be deleted. A new consent grant must be initiated.'));
    }
  }
  next();
});

const Patient = mongoose.model('Patient', patientSchema);
export default Patient;
