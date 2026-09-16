import { z } from 'zod';

/**
 * Zod Schema: Prediction Internal Entity Validation (NFR5)
 * Structurally asserts that no risk assessment can be generated or persisted
 * without both a patient plain-language reason and a detailed clinical explanation.
 */
export const predictionEntitySchema = z.object({
  patientId: z.string().or(z.any()),
  vitalsId: z.string().or(z.any()),
  recordedAt: z.date().or(z.string()),
  overallTier: z.enum(['Low', 'Moderate', 'High', 'Critical', 'Pending'], {
    required_error: 'Overall risk tier is required',
  }),
  colorCode: z.enum(['Green', 'Amber', 'Red'], {
    required_error: 'Traffic light color code is required',
  }),
  overallScore: z.number().min(0).max(100),
  source: z.enum(['layer1_only', 'hybrid', 'fallback']),
  baselineStatus: z.enum(['building', 'mature', 'unavailable']),
  layer1: z
    .object({
      tier: z.string().nullable().optional(),
      news2Subtotal: z.number().default(0),
      careAdditionsSubtotal: z.number().default(0),
      redFlagTriggered: z.boolean().default(false),
      componentPoints: z.record(z.any()).optional(),
      parametersUsed: z.array(z.string()).optional(),
    })
    .optional(),
  layer2: z
    .object({
      status: z.string().nullable().optional(),
      tier: z.string().nullable().optional(),
      maxAbsZ: z.number().default(0),
      featureDeviations: z.record(z.any()).optional(),
      anomalyScore: z.number().nullable().optional(),
    })
    .optional(),
  // NFR5 Structural Enforcement: Mandate non-empty reasons
  patientExplanation: z
    .string({ required_error: 'Patient explanation is structurally required (NFR5)' })
    .min(10, 'Patient explanation must be at least 10 characters long'),
  patientTemplate: z
    .object({
      key: z.string(),
      params: z.record(z.any()).optional(),
    })
    .optional(),
  doctorExplanation: z
    .object(
      {
        summary: z.string().min(5, 'Doctor summary must be provided'),
        triggeringLayer: z.string(),
        flaggedVitals: z.array(z.string()).optional(),
        baselineDeviations: z.array(z.any()).optional(),
        adherence: z
          .object({
            rate7d: z.number().nullable().optional(),
            rate30d: z.number().nullable().optional(),
            status: z.string().optional(),
            streakDays: z.number().optional(),
            interpretation: z.string().optional(),
          })
          .optional(),
        clinicalNotes: z.string().optional(),
      },
      { required_error: 'Doctor explanation structure is required (NFR5)' }
    )
    .passthrough(),
  executionTimeMs: z.number().nonnegative().default(0),
});

/**
 * Filtered View: Patient & Caregiver (Spec §6.10 & NFR3)
 * Reassurance-calibrated, zero raw weights or internal tree metrics exposed.
 */
export function filterPatientCaregiverView(prediction) {
  return {
    overallTier: prediction.overallTier,
    colorCode: prediction.colorCode,
    overallScore: prediction.overallScore,
    explanation: prediction.patientExplanation,
    template: prediction.patientTemplate || { key: 'vitals_steady', params: {} },
    baselineStatus: prediction.baselineStatus,
  };
}

/**
 * Filtered View: Doctor (Spec §6.10 & Clinical Triage)
 * Full clinical breakdown with parameter points and personal baseline deviations.
 */
export function filterDoctorView(prediction) {
  return {
    overallTier: prediction.overallTier,
    colorCode: prediction.colorCode,
    overallScore: prediction.overallScore,
    explanation: prediction.doctorExplanation,
    layer1: prediction.layer1,
    layer2: prediction.layer2,
    baselineStatus: prediction.baselineStatus,
    executionTimeMs: prediction.executionTimeMs,
  };
}
