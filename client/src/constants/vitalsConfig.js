/**
 * CareOClock — Client Vitals Configuration & Physiological Thresholds
 *
 * Configurable physiological boundaries derived from NEWS2 and AHA/ACC guidelines.
 * Mirrors the server-side thresholds in server/src/constants/physiologicalThresholds.js.
 */

export const PHYSIOLOGICAL_BOUNDS = {
  systolicBp: {
    min: 50,
    max: 260,
    normalMin: 90,
    normalMax: 120,
    unit: 'mmHg',
    label: 'Systolic Blood Pressure',
    hint: 'Upper number (Normal: 90–120 mmHg)',
  },
  diastolicBp: {
    min: 30,
    max: 160,
    normalMin: 60,
    normalMax: 80,
    unit: 'mmHg',
    label: 'Diastolic Blood Pressure',
    hint: 'Lower number (Normal: 60–80 mmHg)',
  },
  pulsePressure: {
    minDiff: 10,
    hint: 'Systolic must exceed diastolic by at least 10 mmHg',
  },
  heartRate: {
    min: 25,
    max: 250,
    normalMin: 60,
    normalMax: 100,
    unit: 'bpm',
    label: 'Heart Rate',
    hint: 'Resting pulse (Normal: 60–100 bpm)',
  },
  spo2: {
    min: 50,
    max: 100,
    normalMin: 95,
    normalMax: 100,
    unit: '%',
    label: 'Oxygen Saturation (SpO2)',
    hint: 'Blood oxygen (Normal: 95–100%)',
  },
  temperatureC: {
    min: 30.0,
    max: 44.0,
    normalMin: 36.1,
    normalMax: 37.5,
    unit: '°C',
    label: 'Body Temperature',
    hint: 'Oral/Core temp (Normal: 36.1–37.5 °C)',
  },
  respirationRate: {
    min: 4,
    max: 60,
    normalMin: 12,
    normalMax: 20,
    unit: 'breaths/min',
    label: 'Respiration Rate',
    hint: 'Breaths per minute (Normal: 12–20)',
  },
};

/**
 * Standard 7 Clinical Symptoms (CLAUDE.md §5 H-7)
 */
export const CLINICAL_SYMPTOMS = [
  {
    id: 'dyspnea',
    label: 'Shortness of breath',
    subtext: 'Difficulty breathing or panting',
    isEscalator: false,
  },
  {
    id: 'chest_pain',
    label: 'Chest pain / tightness',
    subtext: 'Pressure or discomfort in chest',
    isEscalator: true, // Independent clinical escalator
  },
  {
    id: 'dizziness',
    label: 'Dizziness / Lightheaded',
    subtext: 'Feeling faint or unsteady',
    isEscalator: false,
  },
  {
    id: 'confusion',
    label: 'New confusion / Fog',
    subtext: 'Disorientation or acute memory lapse',
    isEscalator: true, // Independent clinical escalator
  },
  {
    id: 'swelling',
    label: 'Swelling in legs / feet',
    subtext: 'Fluid retention or edema',
    isEscalator: false,
  },
  {
    id: 'reduced_urine',
    label: 'Reduced urination',
    subtext: 'Noticeable drop in fluid output',
    isEscalator: false,
  },
  {
    id: 'cough_fever',
    label: 'Cough or chills',
    subtext: 'Persistent cough or shivering',
    isEscalator: false,
  },
];

/**
 * Determine the smart default twice-daily slot based on local time.
 * - Before 14:00 (2:00 PM) -> 'morning' (pre-food/meds baseline)
 * - After 14:00 (2:00 PM)  -> 'evening' (end-of-day response)
 */
export function getDefaultSlot() {
  const currentHour = new Date().getHours();
  return currentHour < 14 ? 'morning' : 'evening';
}

/**
 * Classify a vital reading value against clinical normal and boundary ranges.
 * @returns {'normal' | 'elevated' | 'alert' | 'invalid'}
 */
export function classifyVital(field, value) {
  if (value === '' || value === null || value === undefined || isNaN(value)) {
    return 'empty';
  }

  const num = parseFloat(value);
  const bounds = PHYSIOLOGICAL_BOUNDS[field];
  if (!bounds) return 'normal';

  // Absolute impossibility bounds
  if (num < bounds.min || num > bounds.max) {
    return 'invalid';
  }

  // Normal range
  if (num >= bounds.normalMin && num <= bounds.normalMax) {
    return 'normal';
  }

  // Borderline vs Alert (using NEWS2 alert triggers)
  if (field === 'spo2' && num <= 91) return 'alert';
  if (field === 'systolicBp' && (num <= 90 || num >= 180)) return 'alert';
  if (field === 'heartRate' && (num <= 40 || num >= 130)) return 'alert';
  if (field === 'temperatureC' && (num <= 35.0 || num >= 39.1)) return 'alert';
  if (field === 'respirationRate' && (num <= 8 || num >= 25)) return 'alert';

  return 'elevated';
}
