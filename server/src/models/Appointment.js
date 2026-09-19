import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient reference is required'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor reference is required'],
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled appointment date and time is required'],
      index: true,
    },
    timeSlot: {
      type: String,
      required: [true, 'Time slot string is required (e.g., 09:30 AM)'],
    },
    type: {
      type: String,
      enum: {
        values: ['in_person', 'video', 'routine_followup'],
        message: 'Type must be in_person, video, or routine_followup',
      },
      default: 'video',
    },
    status: {
      type: String,
      enum: {
        values: ['scheduled', 'in_progress', 'completed', 'cancelled'],
        message: 'Status must be scheduled, in_progress, completed, or cancelled',
      },
      default: 'scheduled',
      index: true,
    },
    reason: {
      type: String,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
      default: 'Routine Health Review',
    },
    symptoms: {
      type: [String],
      default: [],
    },
    doctorNotes: {
      type: String,
      maxlength: [2000, 'Doctor notes cannot exceed 2000 characters'],
      default: '',
    },
    meetingLink: {
      type: String,
      default: '',
    },
    cancellationReason: {
      type: String,
      default: '',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;
