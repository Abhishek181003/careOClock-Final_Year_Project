import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: [true, 'Action is required for audit logging'],
      enum: [
        'AUTH_REGISTER',
        'AUTH_LOGIN_SUCCESS',
        'AUTH_LOGIN_FAILED',
        'AUTH_ACCOUNT_LOCKED',
        'AUTH_LOGOUT',
        'AUTH_TOKEN_REFRESH',
        'RBAC_ACCESS_DENIED',
        'CONSENT_GRANTED',
        'CONSENT_WITHDRAWN',
        'CLINICAL_WRITE_VITALS',
        'CLINICAL_WRITE_PRESCRIPTION',
        'CAREGIVER_LINK_CREATED',
        'CAREGIVER_LINK_REVOKED',
        'IDOR_ACCESS_PREVENTED',
        'DPDP_DATA_EXPORT_REQUESTED',
        'DPDP_DATA_ERASURE_REQUESTED',
        'CLINICAL_READ_ASSESSMENTS',
        'CLINICAL_READ_VITALS',
        'CLINICAL_ALERT_DISPATCHED',
        'CLINICAL_ALERT_ACKNOWLEDGED',
        'CAREGIVER_INVITE_GENERATED',
        'CAREGIVER_INVITE_ACCEPTED',
        'MEDICINE_CREATED',
        'MEDICINE_UPDATED',
        'MEDICINE_DELETED',
        'MEDICINE_DOSE_LOGGED',
        'REPORT_UPLOADED',
        'REPORT_VIEWED',
        'REPORT_DOWNLOADED',
        'REPORT_DELETED',
        'USER_PROFILE_UPDATED',
        'DOCTOR_ASSIGNED_TO_PATIENT',
      ],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    role: {
      type: String,
      index: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static method to quickly record an audit log entry
auditLogSchema.statics.logEvent = async function ({
  action,
  userId = null,
  role = null,
  ipAddress = null,
  userAgent = null,
  details = {},
}) {
  try {
    return await this.create({
      action,
      userId,
      role,
      ipAddress,
      userAgent,
      details,
    });
  } catch (error) {
    console.error('Failed to create audit log entry:', error.message);
    return null;
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
