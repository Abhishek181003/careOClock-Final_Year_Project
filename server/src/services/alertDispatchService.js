import Alert from '../models/Alert.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Clinical Alert Dispatch Service
 * Handles real-time alert generation and simulated dispatch for Critical and High risk assessments.
 */
export async function dispatchAlert({ prediction, patient, vitals, user = null }) {
  const tier = prediction?.overallTier;

  // Alerts only trigger on Critical and High tiers
  if (tier !== 'Critical' && tier !== 'High') {
    return null;
  }

  // Demo / Sandbox Alert Isolation (Phase 11 Finding 5)
  // Suppress real external alert dispatch for simulated/demo readings to prevent false clinical alarms
  if (vitals?.isDemoReading) {
    console.log(
      `[ALERT-DISPATCH-DEMO] Alert dispatch suppressed for demo/simulation reading (vitalsId: ${vitals._id}, tier: ${tier}).`
    );
    await AuditLog.logEvent({
      action: 'DEMO_ALERT_SIMULATED',
      userId: user?._id || user?.id || vitals.enteredBy,
      role: user?.role || 'system',
      details: {
        patientId: patient?._id,
        tier,
        vitalsId: vitals._id,
        reason: 'Demo mode simulated vitals reading (external dispatch suppressed)',
      },
    });
    return null;
  }

  const doctorId = patient?.assignedDoctorId;
  if (!doctorId) {
    console.warn(`[ALERT-DISPATCH] Cannot dispatch alert: No assigned doctor for patient ${patient?._id}`);
    return null;
  }

  const title = `${tier} Risk Health Deterioration Alert`;
  const message =
    prediction?.doctorExplanation?.summary ||
    prediction?.patientExplanation ||
    `Patient physiological indicators have escalated to ${tier} risk level.`;

  const dispatchedChannels = ['in_app', 'simulated_sms'];

  const alert = await Alert.create({
    patientId: patient._id,
    doctorId,
    vitalsId: vitals._id,
    predictionId: prediction._id,
    tier,
    colorCode: prediction.colorCode || (tier === 'Critical' ? 'Red' : 'Amber'),
    title,
    message,
    status: 'active',
    dispatchedChannels,
  });

  await AuditLog.logEvent({
    action: 'CLINICAL_ALERT_DISPATCHED',
    userId: user?._id || user?.id || vitals.enteredBy,
    role: user?.role || 'system',
    details: {
      alertId: alert._id,
      patientId: patient._id,
      doctorId,
      tier,
      vitalsId: vitals._id,
      dispatchedChannels,
    },
  });

  console.log(
    `[ALERT-DISPATCH] ${tier} alert created (${alert._id}) for patient ${patient._id} routed to doctor ${doctorId}`
  );

  return alert;
}

/**
 * Acknowledge an active clinical alert with role separation (Option 2)
 * - Doctor: Globally resolves the clinical alert (status: 'acknowledged').
 * - Patient / Caregiver: Records family awareness and clears their own notifications,
 *   while leaving the clinical alert active for the doctor to review.
 */
export async function acknowledgeAlert({ alertId, doctorId, userId, role = 'doctor', resolutionNotes = '' }) {
  const query = { _id: alertId };
  if (doctorId) {
    query.doctorId = doctorId;
  }
  const alert = await Alert.findOne(query);
  if (!alert) {
    return null;
  }

  const actingUserId = userId || doctorId;

  if (role === 'doctor') {
    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = actingUserId;
    alert.doctorAcknowledgedAt = new Date();
    alert.doctorAcknowledgedBy = actingUserId;
    alert.acknowledgedRole = 'doctor';
    alert.resolutionNotes = resolutionNotes || 'Clinically reviewed and signed off by physician';
  } else if (role === 'patient') {
    alert.patientCheckedAt = new Date();
    alert.patientCheckedBy = actingUserId;
    if (!alert.dismissedByUsers) alert.dismissedByUsers = [];
    if (!alert.dismissedByUsers.some((uid) => uid.toString() === actingUserId.toString())) {
      alert.dismissedByUsers.push(actingUserId);
    }
  } else if (role === 'caregiver') {
    alert.caregiverCheckedAt = new Date();
    alert.caregiverCheckedBy = actingUserId;
    if (!alert.dismissedByUsers) alert.dismissedByUsers = [];
    if (!alert.dismissedByUsers.some((uid) => uid.toString() === actingUserId.toString())) {
      alert.dismissedByUsers.push(actingUserId);
    }
  }

  await alert.save();

  await AuditLog.logEvent({
    action: `CLINICAL_ALERT_${role.toUpperCase()}_ACKNOWLEDGED`,
    userId: actingUserId,
    role: role || 'doctor',
    details: {
      alertId: alert._id,
      patientId: alert.patientId,
      resolutionNotes: alert.resolutionNotes,
      status: alert.status,
    },
  });

  return alert;
}

/**
 * Dismiss an alert notification for a specific user without globally resolving it
 */
export async function dismissAlertForUser({ alertId, userId }) {
  const alert = await Alert.findById(alertId);
  if (!alert) return null;

  if (!alert.dismissedByUsers) {
    alert.dismissedByUsers = [];
  }
  if (!alert.dismissedByUsers.some((uid) => uid.toString() === userId.toString())) {
    alert.dismissedByUsers.push(userId);
    await alert.save();
  }

  await AuditLog.logEvent({
    action: 'CLINICAL_ALERT_DISMISSED',
    userId,
    details: { alertId: alert._id, patientId: alert.patientId },
  });

  return alert;
}
