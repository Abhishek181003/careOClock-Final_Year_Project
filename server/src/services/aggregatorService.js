import { generateDualViewExplanations } from './explanationService.js';
import { predictionEntitySchema } from '../schemas/predictionSchema.js';

export const SEVERITY_ORDER = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Critical: 3,
};

export const TIER_RANK = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Critical: 3,
};

/**
 * Escalate to the more severe layer (Spec §5.1 & §6.8)
 * Combines Layer 1 and Layer 2 strictly at this final step.
 */
export function maxSeverity(tier1, tier2) {
  const t1 = tier1 && SEVERITY_ORDER[tier1] !== undefined ? tier1 : 'Low';
  const t2 = tier2 && SEVERITY_ORDER[tier2] !== undefined ? tier2 : 'Low';

  return SEVERITY_ORDER[t1] >= SEVERITY_ORDER[t2] ? t1 : t2;
}

/**
 * Map clinical risk tier to traffic light color code (FR5)
 */
export function tierToColorCode(tier) {
  switch (tier) {
    case 'Critical':
    case 'High':
      return 'Red';
    case 'Moderate':
      return 'Amber';
    case 'Low':
    default:
      return 'Green';
  }
}

/**
 * Compute 0-100 monotone composite score for triage sorting (H-1 & M-1)
 * Includes zero-denominator guards and null Layer 2 safety checks.
 */
export function computeOverallScore(
  overallTier,
  l1Subtotal = 0,
  l1Max = 12,
  careSubtotal = 0,
  careMax = 6,
  layer2Result = null
) {
  const base = (TIER_RANK[overallTier] ?? 0) * 25; // 0, 25, 50, 75

  // Guard against division by zero (M-1)
  const l1Norm = l1Max > 0 ? (Math.max(0, l1Subtotal) / l1Max) * 10 : 0;
  const careNorm = careMax > 0 ? (Math.max(0, careSubtotal) / careMax) * 2.5 : 0;

  // Layer 2 within-tier tiebreak normalized to 0-12.5 (cap at |z| = 4.0)
  let l2Norm = 0;
  if (layer2Result && layer2Result.maxAbsZ) {
    l2Norm = Math.min(Math.abs(layer2Result.maxAbsZ) / 4.0, 1.0) * 12.5;
  }

  return Math.min(Math.round(base + l1Norm + careNorm + l2Norm), 100);
}

/**
 * Resolve baseline status cleanly distinguishing outage from cold-start (H-2)
 */
export function resolveBaselineStatus({ layer2, layer2Failed }) {
  if (layer2Failed) {
    return 'unavailable'; // Outage or timeout (H-2)
  }
  const historyDays =
    layer2?.days_of_history_total ??
    (layer2?.days_of_history
      ? Math.max(0, ...Object.values(layer2.days_of_history))
      : 0);

  if (!layer2 || layer2.status === 'not yet available' || historyDays < 7) {
    return 'building'; // Legitimate cold-start (Days 1-6)
  }
  return historyDays >= 28 ? 'mature' : 'building';
}

/**
 * Master Aggregator Engine (FR5, NFR2, NFR5)
 * Combines independent Layer 1 and Layer 2 evaluations into a validated prediction entity.
 */
export function aggregate({
  patientId,
  vitalsId,
  recordedAt = new Date(),
  layer1Result,
  layer2Result,
  layer2Failed = false,
  networkLatencyMs = 0,
  adherence = null,
}) {
  // 1. Resolve Layer 1 details
  const l1Tier = layer1Result?.layer1_tier || 'Low';
  const news2Subtotal = layer1Result?.news2_subtotal || 0;
  const careAdditionsSubtotal = layer1Result?.care_additions_subtotal || 0;
  const redFlagTriggered = layer1Result?.red_flag_triggered || false;
  const componentPoints = layer1Result?.component_points || {};
  const parametersUsed = layer1Result?.parameters_used || [];
  const l1Max = parametersUsed.includes('respiration_rate') ? 15 : 12;

  // 2. Resolve Layer 2 details
  let l2Tier = 'Low';
  let maxAbsZ = 0;
  let featureDeviations = {};
  let anomalyScore = null;

  if (layer2Result && layer2Result.status === 'active') {
    l2Tier = layer2Result.layer2_tier || 'Low';
    featureDeviations = layer2Result.feature_deviations || {};
    anomalyScore = layer2Result.anomaly_score ?? null;

    // Calculate max |z| from max_z_score or feature deviations (supports both floats & objects)
    if (layer2Result.max_z_score != null) {
      maxAbsZ = Math.abs(layer2Result.max_z_score);
    } else {
      const zScores = Object.values(featureDeviations).map((d) =>
        typeof d === 'number' ? Math.abs(d) : Math.abs(d?.z_score || 0)
      );
      maxAbsZ = zScores.length > 0 ? Math.max(...zScores) : 0;
    }
  }

  // 3. Resolve baseline status (H-2)
  const baselineStatus = resolveBaselineStatus({
    layer2: layer2Result,
    layer2Failed,
  });

  // 4. Combine tiers strictly at this final step (FR5)
  const overallTier = maxSeverity(l1Tier, l2Tier);
  const colorCode = tierToColorCode(overallTier);

  // 5. Compute H-1 monotone composite score (M-1)
  const overallScore = computeOverallScore(
    overallTier,
    news2Subtotal,
    l1Max,
    careAdditionsSubtotal,
    6,
    { maxAbsZ }
  );

  // 6. Generate dual-view role explanations (NFR5 & Spec §6.10)
  const layer1Context = {
    tier: l1Tier,
    news2Subtotal,
    careAdditionsSubtotal,
    redFlagTriggered,
    componentPoints,
    parametersUsed,
    plainLanguageReason: layer1Result?.plain_language_reason || '',
  };

  const layer2Context = {
    status: layer2Result?.status || baselineStatus,
    tier: l2Tier,
    maxAbsZ,
    featureDeviations,
    detailedDeviations: layer2Result?.detailed_deviations || null,
    rollingBaseline: layer2Result?.rolling_baseline || null,
    anomalyScore,
  };

  const { patientExplanation, patientTemplate, doctorExplanation } =
    generateDualViewExplanations({
      overallTier,
      colorCode,
      layer1: layer1Context,
      layer2: layer2Context,
      baselineStatus,
      adherence,
    });

  const source = layer2Result && layer2Result.status === 'active' ? 'hybrid' : 'layer1_only';

  // 7. Assemble and structurally validate prediction entity (NFR5)
  const rawEntity = {
    patientId,
    vitalsId,
    recordedAt,
    overallTier,
    colorCode,
    overallScore,
    source,
    baselineStatus,
    layer1: layer1Context,
    layer2: layer2Context,
    patientExplanation,
    patientTemplate,
    doctorExplanation,
    executionTimeMs: networkLatencyMs,
  };

  // Structural validation enforces non-empty reasons before persistence
  return predictionEntitySchema.parse(rawEntity);
}
