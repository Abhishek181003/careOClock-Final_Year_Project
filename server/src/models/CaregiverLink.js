import mongoose from 'mongoose';
import crypto from 'crypto';

const caregiverLinkSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Linked patientId is required'],
    },
    caregiverUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Optional while invite is pending
    },
    inviteCode: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    inviteToken: {
      type: String,
      index: true,
    },
    inviteExpiresAt: {
      type: Date,
    },
    status: {
      enum: ['pending', 'active', 'revoked'],
      type: String,
      default: 'active',
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding active links for caregiver
caregiverLinkSchema.index({ caregiverUserId: 1, status: 1 });

// Partial unique index: Guarantees only one ACTIVE link per patient-caregiver pair (P1-9)
caregiverLinkSchema.index(
  { patientId: 1, caregiverUserId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Static helper to generate a cryptographically secure invite token & friendly short code (P1-11)
caregiverLinkSchema.statics.generateInviteToken = function () {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let shortCode = 'CC-';
  for (let i = 0; i < 6; i++) {
    shortCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hour validity
  return { rawToken, hashedToken, inviteCode: shortCode, expiresAt };
};

// Static helper to create an invite for a patient
caregiverLinkSchema.statics.createInviteForPatient = async function (patientId) {
  const { rawToken, hashedToken, inviteCode, expiresAt } = this.generateInviteToken();
  const invite = await this.create({
    patientId,
    inviteToken: hashedToken,
    inviteCode,
    inviteExpiresAt: expiresAt,
    status: 'pending',
  });
  return { invite, rawToken, inviteCode, expiresAt };
};

// Static helper to accept an invite token or short code
caregiverLinkSchema.statics.acceptInvite = async function (codeOrToken, caregiverUserId) {
  const cleanCode = String(codeOrToken).trim().toUpperCase();
  const hashedToken = crypto.createHash('sha256').update(String(codeOrToken).trim()).digest('hex');

  const link = await this.findOne({
    $or: [{ inviteCode: cleanCode }, { inviteToken: hashedToken }],
    status: 'pending',
    inviteExpiresAt: { $gt: new Date() },
  });

  if (!link) {
    return null;
  }

  // Check if active link already exists
  const existingActive = await this.findOne({
    patientId: link.patientId,
    caregiverUserId,
    status: 'active',
  });

  if (existingActive) {
    link.status = 'revoked';
    await link.save();
    return existingActive;
  }

  link.caregiverUserId = caregiverUserId;
  link.status = 'active';
  link.acceptedAt = new Date();
  await link.save();

  return link;
};

const CaregiverLink = mongoose.model('CaregiverLink', caregiverLinkSchema);
export default CaregiverLink;
