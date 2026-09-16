/**
 * Dual-View Role-Based Explanation Engine (FR5, NFR5)
 *
 * Implements:
 * - Patient/Caregiver View: Short, simple, reassurance-calibrated sentence without technical jargon (L-2, L-3)
 * - Localization Readiness: Returns template key + interpolation parameters (L-1)
 * - Doctor View: Detailed clinical breakdown identifying flagged vitals, triggering layer, and baseline deviations
 */

const VITAL_DISPLAY_NAMES = {
  systolic_bp: 'blood pressure',
  diastolic_bp: 'blood pressure',
  heart_rate: 'heart rate',
  spo2: 'oxygen saturation',
  temperature_c: 'temperature',
  respiration_rate: 'breathing rate',
};

/**
 * Generate patient and caregiver plain-language explanation (L-1, L-2, L-3)
 */
export function generatePatientExplanation({
  _overallTier,
  colorCode,
  layer1,
  layer2,
  baselineStatus,
}) {
  let templateKey = 'vitals_steady';
  let params = {};
  let text = 'Your vitals are steady and within your normal range today.';

  const l1Tier = layer1?.tier || 'Low';
  const l2Tier = layer2?.tier || 'Low';
  const redFlag = layer1?.redFlagTriggered;

  // Identify highest deviating vital from Layer 2 if available
  let topDeviatedVital = null;
  if (layer2?.featureDeviations) {
    const sorted = Object.entries(layer2.featureDeviations).sort((a, b) => {
      const zA = typeof a[1] === 'number' ? Math.abs(a[1]) : Math.abs(a[1]?.z_score || 0);
      const zB = typeof b[1] === 'number' ? Math.abs(b[1]) : Math.abs(b[1]?.z_score || 0);
      return zB - zA;
    });
    if (sorted.length > 0) {
      const topZ =
        typeof sorted[0][1] === 'number'
          ? Math.abs(sorted[0][1])
          : Math.abs(sorted[0][1]?.z_score || 0);
      if (topZ >= 1.8) {
        topDeviatedVital = VITAL_DISPLAY_NAMES[sorted[0][0]] || sorted[0][0];
      }
    }
  }

  if (colorCode === 'Green') {
    templateKey = 'vitals_steady';
    text = 'Your vitals are steady and within your normal range today.';
  } else if (colorCode === 'Amber') {
    if (topDeviatedVital) {
      templateKey = 'vitals_amber_drift';
      params = { vital: topDeviatedVital };
      text = `Your ${topDeviatedVital} is slightly different from what is usual for you. Please rest and stay hydrated.`;
    } else {
      templateKey = 'vitals_amber_elevated';
      text = 'Your vital signs are slightly elevated today. Take time to rest and check again later.';
    }
  } else if (colorCode === 'Red') {
    if (redFlag) {
      templateKey = 'vitals_red_flag';
      text = 'One of your readings requires medical attention. Please inform your caregiver or doctor promptly.';
    } else if (l1Tier === 'Critical' || l2Tier === 'Critical') {
      templateKey = 'vitals_critical';
      text = 'Your readings are significantly outside your usual range. Please contact your doctor promptly.';
    } else {
      templateKey = 'vitals_high_risk';
      text = 'Your health readings show notable changes today. A clinical review with your doctor is recommended.';
    }
  }

  // Append cold-start note gently if baseline is building
  if (baselineStatus === 'building') {
    text += ' (Personal baseline is building — standard vital checks active).';
  }

  return {
    text,
    template: {
      key: templateKey,
      params,
    },
  };
}

/**
 * Generate doctor clinical breakdown explanation (NFR5 & Spec §6.10)
 */
export function generateDoctorExplanation({
  overallTier,
  layer1,
  layer2,
  baselineStatus,
  adherence = null,
}) {
  const l1Tier = layer1?.tier || 'Low';
  const l2Tier = layer2?.tier || 'Low';

  let triggeringLayer = 'None (Routine)';
  if (l1Tier !== 'Low' && l2Tier !== 'Low') {
    triggeringLayer = 'Both (Concordant Risk Escalation)';
  } else if (l1Tier !== 'Low') {
    triggeringLayer = 'Layer 1 (Modified Home-NEWS / Clinical Rules)';
  } else if (l2Tier !== 'Low') {
    triggeringLayer = 'Layer 2 (Personalized Rolling Anomaly)';
  }

  // Collect flagged vitals from Layer 1
  const flaggedVitals = [];
  if (layer1?.componentPoints) {
    for (const [vital, pts] of Object.entries(layer1.componentPoints)) {
      if (pts > 0) {
        flaggedVitals.push(`${vital} (${pts} pts)`);
      }
    }
  }

  // Format Layer 2 feature deviations ranked by |z| descending
  const baselineDeviations = [];
  if (Array.isArray(layer2?.detailedDeviations) && layer2.detailedDeviations.length > 0) {
    for (const d of layer2.detailedDeviations) {
      const z = typeof d.z_score === 'number' ? d.z_score : 0;
      const absZ = Math.abs(z);
      const meanStr = d.baseline_mean != null ? d.baseline_mean.toFixed(1) : 'N/A';
      const stdStr = d.baseline_std != null ? d.baseline_std.toFixed(1) : 'N/A';
      baselineDeviations.push({
        vital: d.feature,
        currentValue: d.current_value,
        zScore: z,
        absZ,
        personalBaseline: `${meanStr} ± ${stdStr}`,
        direction: d.direction || (z >= 0 ? 'elevated' : 'depressed'),
        isAnomaly: absZ >= 1.8,
      });
    }
  } else if (layer2?.featureDeviations) {
    const sorted = Object.entries(layer2.featureDeviations).sort((a, b) => {
      const zA = typeof a[1] === 'number' ? Math.abs(a[1]) : Math.abs(a[1]?.z_score || 0);
      const zB = typeof b[1] === 'number' ? Math.abs(b[1]) : Math.abs(b[1]?.z_score || 0);
      return zB - zA;
    });

    for (const [vital, data] of sorted) {
      const isObj = typeof data === 'object' && data !== null;
      const zScore = isObj ? data.z_score : data;
      const absZ = Math.abs(zScore || 0);
      const mean = isObj ? data.mean : layer2.rollingBaseline?.[vital]?.mean;
      const std = isObj ? data.std : layer2.rollingBaseline?.[vital]?.std;
      const baselineStr =
        mean != null && std != null ? `${mean.toFixed(1)} ± ${std.toFixed(1)}` : 'Active baseline';

      baselineDeviations.push({
        vital,
        currentValue: isObj ? data.value : undefined,
        zScore: typeof zScore === 'number' ? zScore : 0,
        absZ,
        personalBaseline: baselineStr,
        direction: (zScore || 0) >= 0 ? 'elevated' : 'depressed',
        isAnomaly: absZ >= 1.8,
      });
    }
  }

  const summary =
    triggeringLayer === 'None (Routine)'
      ? 'Patient vitals stable across physiological thresholds and personal baseline.'
      : `Risk escalated to ${overallTier} via ${triggeringLayer}. NEWS2 Subtotal: ${layer1?.news2Subtotal ?? 0}, Care Additions: ${layer1?.careAdditionsSubtotal ?? 0}, Max |z|: ${layer2?.maxAbsZ?.toFixed(2) ?? 'N/A'}.`;

  // Surface medication adherence as clinical reference factor (FR6)
  const adherenceFactor = {
    rate7d: adherence?.past7Days?.adherenceRate ?? adherence?.rate7d ?? null,
    rate30d: adherence?.past30Days?.adherenceRate ?? adherence?.rate30d ?? null,
    status: adherence?.past7Days?.status ?? adherence?.status ?? 'No History',
    streakDays: adherence?.currentStreakDays ?? adherence?.streakDays ?? 0,
    interpretation: 'Reference factor only (FR6) — does not alter numeric risk score.',
  };

  return {
    summary,
    triggeringLayer,
    flaggedVitals,
    layer1Summary: {
      tier: l1Tier,
      news2Subtotal: layer1?.news2Subtotal || 0,
      careAdditionsSubtotal: layer1?.careAdditionsSubtotal || 0,
      redFlagTriggered: layer1?.redFlagTriggered || false,
      componentPoints: layer1?.componentPoints || {},
      plainLanguageReason: layer1?.plainLanguageReason || '',
    },
    layer2Summary: {
      status: layer2?.status || baselineStatus,
      tier: l2Tier,
      maxAbsZ: layer2?.maxAbsZ || 0,
      baselineStatus,
      deviationsCount: baselineDeviations.filter((d) => d.isAnomaly).length,
    },
    baselineDeviations,
    adherence: adherenceFactor,
    clinicalNotes: `Baseline status: ${baselineStatus}. Overall assessment derived independently at final step (FR5).`,
  };
}

/**
 * Master Dual-View Explanation Generator (NFR5)
 */
export function generateDualViewExplanations(context) {
  const patientView = generatePatientExplanation(context);
  const doctorView = generateDoctorExplanation(context);

  return {
    patientExplanation: patientView.text,
    patientTemplate: patientView.template,
    doctorExplanation: doctorView,
  };
}
