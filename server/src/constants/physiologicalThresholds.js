/**
 * CareOClock — Physiological Validation Thresholds & Clinical Boundaries
 *
 * Configurable thresholds derived from established clinical early-warning literature:
 * - Royal College of Physicians NEWS2 (National Early Warning Score 2, 2017)
 * - American Heart Association / American College of Cardiology (AHA/ACC 2017) Guidelines
 *
 * Safety Requirement:
 * Physiological thresholds must NEVER be hardcoded directly into controllers or route handlers.
 * Configurable defaults can be optionally tuned or overridden via environment variables for
 * specialized clinical cohorts while maintaining strict baseline safety limits.
 */

const parseEnvFloat = (envVar, fallback) => {
  const parsed = parseFloat(process.env[envVar]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseEnvInt = (envVar, fallback) => {
  const parsed = parseInt(process.env[envVar], 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const PHYSIOLOGICAL_THRESHOLDS = {
  // Systolic Blood Pressure (mmHg)
  // Survival boundary: <50 is non-perfusing shock; >260 is extreme hypertensive encephalopathy crisis.
  // Standard adult: 90 - 120 mmHg.
  systolicBp: {
    min: parseEnvInt('PHYSIO_SBP_MIN', 50),
    max: parseEnvInt('PHYSIO_SBP_MAX', 260),
    normalMin: 90,
    normalMax: 120,
    unit: 'mmHg',
    label: 'Systolic Blood Pressure',
  },

  // Diastolic Blood Pressure (mmHg)
  // Survival boundary: <30 is cardiovascular collapse; >160 is lethal vascular stress.
  // Standard adult: 60 - 80 mmHg.
  diastolicBp: {
    min: parseEnvInt('PHYSIO_DBP_MIN', 30),
    max: parseEnvInt('PHYSIO_DBP_MAX', 160),
    normalMin: 60,
    normalMax: 80,
    unit: 'mmHg',
    label: 'Diastolic Blood Pressure',
  },

  // Pulse Pressure (Systolic - Diastolic difference in mmHg)
  // Physiologically, Systolic must strictly exceed Diastolic by a minimum viable pulse pressure difference.
  pulsePressure: {
    minDiff: parseEnvInt('PHYSIO_PULSE_PRESSURE_MIN_DIFF', 10),
  },

  // Heart Rate (beats per minute)
  // Survival boundary: <25 bpm is extreme pulseless/near-arrest bradycardia; >250 bpm is extreme SVT/VT.
  // A value like 900 bpm is biologically impossible in human physiology.
  // Standard adult: 60 - 100 bpm.
  heartRate: {
    min: parseEnvInt('PHYSIO_HR_MIN', 25),
    max: parseEnvInt('PHYSIO_HR_MAX', 250),
    normalMin: 60,
    normalMax: 100,
    unit: 'bpm',
    label: 'Heart Rate',
  },

  // Peripheral Capillary Oxygen Saturation (SpO2 percentage)
  // Survival boundary: <50% is incompatible with sustained conscious life without mechanical ventilation.
  // Percentage cannot exceed 100%. Negative values are physiologically impossible.
  // Standard healthy: 95 - 100%. NEWS2 low-oxygen alert triggers <= 91%.
  spo2: {
    min: parseEnvInt('PHYSIO_SPO2_MIN', 50),
    max: parseEnvInt('PHYSIO_SPO2_MAX', 100),
    normalMin: 95,
    normalMax: 100,
    unit: '%',
    label: 'Oxygen Saturation (SpO2)',
  },

  // Body Temperature (Celsius)
  // Survival boundary: <30.0 °C is profound fatal hypothermia; >44.0 °C is fatal hyperpyrexia/heat stroke.
  // Standard core: 36.1 - 37.5 °C. Fever: >= 38.0 °C.
  temperatureC: {
    min: parseEnvFloat('PHYSIO_TEMP_MIN', 30.0),
    max: parseEnvFloat('PHYSIO_TEMP_MAX', 44.0),
    normalMin: 36.1,
    normalMax: 37.5,
    unit: '°C',
    label: 'Body Temperature',
  },

  // Respiration Rate (breaths per minute)
  // Survival boundary: <4 breaths/min is respiratory arrest; >60 breaths/min is severe hyperventilatory failure.
  // Standard adult: 12 - 20 breaths/min. NEWS2 extreme alert <= 8 or >= 25.
  respirationRate: {
    min: parseEnvInt('PHYSIO_RR_MIN', 4),
    max: parseEnvInt('PHYSIO_RR_MAX', 60),
    normalMin: 12,
    normalMax: 20,
    unit: 'breaths/min',
    label: 'Respiration Rate',
  },

  // Twice-Daily Assessment Slots
  // Morning: pre-food, pre-activity, pre-medication baseline.
  // Evening: end-of-day physiological response.
  slots: ['morning', 'evening'],

  // Vitals Source Types
  // NFR4 ensures 'manual' is always functional with zero hardware dependencies.
  // 'wearable' is the canonical automated telemetry source; 'oauth' supported for backward-compatibility.
  sources: ['manual', 'wearable', 'oauth'],

  // Standard Clinical Symptoms (CLAUDE.md §5 H-7)
  // Chest pain and confusion act as independent clinical escalators.
  symptoms: {
    allowed: [
      'dyspnea',
      'chest_pain',
      'dizziness',
      'confusion',
      'swelling',
      'reduced_urine',
      'cough_fever',
    ],
    maxPerReading: 4,
    escalators: ['chest_pain', 'confusion'],
  },

  // SpO2 Scale (Scale 1: Standard, Scale 2: Hypercapnic Respiratory Failure / COPD Target 88-92%)
  spo2Scales: [1, 2],

  // 7-day Medication Adherence Rate (Proportion of Days Covered: 0.0 to 1.0)
  adherenceRate: {
    min: 0.0,
    max: 1.0,
  },
};

export default PHYSIOLOGICAL_THRESHOLDS;
