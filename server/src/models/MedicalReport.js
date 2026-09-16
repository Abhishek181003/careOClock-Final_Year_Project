import mongoose from 'mongoose';

const medicalReportSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Medical report must be linked to a patient profile'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Report title is required'],
      trim: true,
      maxlength: [150, 'Report title cannot exceed 150 characters'],
    },
    reportType: {
      type: String,
      enum: {
        values: ['lab_report', 'prescription', 'radiology', 'imaging', 'discharge_summary', 'other'],
        message: 'Invalid report type',
      },
      default: 'lab_report',
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    originalFilename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
      maxlength: [255, 'Original filename cannot exceed 255 characters'],
    },
    storedFilename: {
      type: String,
      required: [true, 'Stored filename is required'],
      unique: true,
      trim: true,
    },
    storagePath: {
      type: String,
      required: [true, 'Storage path is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      enum: {
        values: ['application/pdf', 'image/jpeg', 'image/png'],
        message: 'Only PDF (.pdf), JPEG (.jpg, .jpeg), and PNG (.png) formats are permitted',
      },
      required: [true, 'MIME type is required'],
    },
    fileSizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required'],
      min: [1, 'File cannot be empty'],
      max: [10 * 1024 * 1024, 'File size cannot exceed 10MB'],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader user ID is required'],
    },
    uploaderRole: {
      type: String,
      enum: ['patient', 'doctor', 'caregiver'],
      required: [true, 'Uploader role is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for patient reports filtering & timeline ordering
medicalReportSchema.index({ patientId: 1, createdAt: -1 });
medicalReportSchema.index({ patientId: 1, reportType: 1 });

const MedicalReport = mongoose.model('MedicalReport', medicalReportSchema);
export default MedicalReport;
