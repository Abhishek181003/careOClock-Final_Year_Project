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
 * Acknowledge an active clinical alert
 */
export async function acknowledgeAlert({ alertId, doctorId, resolutionNotes = '' }) {
  const alert = await Alert.findOne({ _id: alertId, doctorId });
  if (!alert) {
    return null;
  }

  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = doctorId;
  if (resolutionNotes) {
    alert.resolutionNotes = resolutionNotes;
  }

  await alert.save();

  await AuditLog.logEvent({
    action: 'CLINICAL_ALERT_ACKNOWLEDGED',
    userId: doctorId,
    role: 'doctor',
    details: {
      alertId: alert._id,
      patientId: alert.patientId,
      resolutionNotes,
    },
  });

  return alert;
}
