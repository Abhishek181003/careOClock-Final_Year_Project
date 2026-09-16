# Directory - ai-engine/app/scoring/constants.py

"""CareOClock AI Engine — Clinical Constants & NEWS2 Thresholds.

Ground-truth clinical boundaries derived from:
- Royal College of Physicians NEWS2 (National Early Warning Score 2, 2017)
- American Heart Association / American College of Cardiology (AHA/ACC 2017)
- CareOClock Canonical Specification §6.6 & §13 (H-5, H-6, H-7, H-8, H-9)
"""

# =====================================================================
# Physiological Boundaries (Pydantic Validation Limits)
# =====================================================================
PHYSIOLOGICAL_LIMITS = {
    "systolic_bp": {"min": 50.0, "max": 260.0},
    "diastolic_bp": {"min": 30.0, "max": 160.0},
    "pulse_pressure_min": 10.0,
    "heart_rate": {"min": 25.0, "max": 250.0},
    "spo2": {"min": 50.0, "max": 100.0},
    "temperature_c": {"min": 30.0, "max": 44.0},
    "respiration_rate": {"min": 4.0, "max": 60.0},
}

# =====================================================================
# Closed Symptom Dictionary (CLAUDE.md §5 H-7)
# =====================================================================
# Phase 9 UI Copy Contract Note:
# The symptom checkbox for 'confusion' must be phrased in the UI as:
# "New or acute confusion/disorientation compared to patient's normal baseline"
# rather than confusion in the abstract, ensuring cognitive impairment baselines
# are not erroneously over-escalated while acute delirium is caught.
CLINICAL_SYMPTOMS = {
    "dyspnea": {
        "label": "Shortness of breath / difficulty breathing",
        "short_label": "shortness of breath",
        "is_escalator": False,
    },
    "chest_pain": {
        "label": "Chest pain or tightness",
        "short_label": "acute chest pain",
        "is_escalator": True,  # Independent Escalator -> forces tier >= High
    },
    "dizziness": {
        "label": "Dizziness, lightheadedness, or unsteadiness",
        "short_label": "dizziness",
        "is_escalator": False,
    },
    "confusion": {
        "label": "New or acute confusion/disorientation compared to patient's normal baseline",
        "short_label": "acute confusion",
        "is_escalator": True,  # Independent Escalator -> forces tier >= High
    },
    "swelling": {
        "label": "New swelling in legs/feet or peripheral edema",
        "short_label": "peripheral swelling",
        "is_escalator": False,
    },
    "reduced_urine": {
        "label": "Reduced urination or noticeable drop in fluid output",
        "short_label": "reduced urination",
        "is_escalator": False,
    },
    "cough_fever": {
        "label": "Persistent cough or chills / feverishness",
        "short_label": "persistent cough or fever",
        "is_escalator": False,
    },
}

SYMPTOM_CAP = 4
ESCALATOR_SYMPTOMS = {"chest_pain", "confusion"}

# =====================================================================
# AHA/ACC Hypertension Thresholds (H-6)
# =====================================================================
HTN_URGENCY_SBP = 180.0
HTN_URGENCY_DBP = 120.0
HTN_STAGE2_SBP = 140.0
HTN_STAGE2_DBP = 90.0
HTN_STAGE1_SBP = 130.0
HTN_STAGE1_DBP = 80.0

# =====================================================================
# Medication Adherence Thresholds (H-8)
# =====================================================================
ADHERENCE_THRESHOLD = 0.80  # >= 80% PDC: 0 points
ADHERENCE_SEVERE = 0.50  # 50-79% PDC: 1 point, < 50% PDC: 2 points

# =====================================================================
# Mandatory Non-Diagnostic Regulatory Disclaimer (DPDP Act 2023)
# =====================================================================
CLINICAL_DISCLAIMER = (
    "CareOClock is an AI-assisted clinical decision support tool for home risk "
    "assessment and is explicitly non-diagnostic. It does not replace professional "
    "clinical evaluation, medical diagnosis, or emergency medical services. In case "
    "of acute chest pain, severe breathlessness, sudden confusion, or physical collapse, "
    "seek emergency medical attention immediately."
)

# =====================================================================
# Phase 5 — Layer 2: Personalized Anomaly Detection Constants (FR4)
# =====================================================================
RANDOM_SEED = 42

# Cold start gate: minimum distinct calendar days required per feature
MIN_DAYS_TO_ACTIVATE = 7

# Rolling baseline historical window ceiling
MATURE_WINDOW_DAYS = 28

# Contamination hyperparameter default (A-15):
# Pinned at 0.05 (~1 in 20 readings expected anomaly). In Phase 12 evaluation,
# this is swept across {0.01, 0.03, 0.05, 0.07, 0.10, 0.15} to produce the
# sensitivity vs. alert-rate tradeoff curve.
CONTAMINATION = 0.05

# Default Isolation Forest tree count (Phase 2 Optimization / Phase 4 Benchmarking)
DEFAULT_N_ESTIMATORS = 100

# Layer 2 Anomaly Tier Thresholds based on max |z-score| deviation (A-16):
# - |z| < 1.8: Low (within ~96th percentile of normal baseline variation)
# - 1.8 <= |z| < 2.5: Moderate (outside 96th percentile; worth watching)
# - 2.5 <= |z| < 3.5: High (outside 98.8th percentile; clinically notable deviation)
# - |z| >= 3.5: Critical (outside 99.95th percentile; extreme departure from personal normal)
L2_TIER_THRESHOLDS = {
    "Critical": 3.5,
    "High": 2.5,
    "Moderate": 1.8,
    "Low": 0.0,
}

L2_COLD_START_STATUS = "not yet available"

TRACKED_VITALS = [
    "systolic_bp",
    "diastolic_bp",
    "heart_rate",
    "spo2",
    "temperature_c",
    "respiration_rate",
]

# Internal Service Key Authentication (A-1)
AI_ENGINE_INTERNAL_KEY_DEFAULT = "careoclock-internal-secret-key-dev"
