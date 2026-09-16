# Directory - ai-engine/app/scoring/home_news.py

"""CareOClock AI Engine — Modified Home-NEWS Scoring Logic (Layer 1).

Pure deterministic clinical rule engine adapted from NEWS2 (Royal College of Physicians, 2017):
- Evaluates single vitals readings in complete isolation with zero historical database dependencies.
- Strictly excludes AVPU (bedside-only).
- Preserves single-parameter Red Flag escalation.
- Proportional tier thresholds dynamically scaled to present vitals via get_tier_thresholds().
- Supports full RCP 2017 SpO2 Scale 1 and Scale 2 (room air vs supplemental oxygen branching).
- Explicitly isolates CareOClock additions (Hypertension staging, Symptoms, Adherence).
"""

from typing import Dict, List, Optional, Tuple
from app.models.vitals import ModifiedHomeNEWSResult, VitalsReading
from app.scoring.constants import (
    ADHERENCE_SEVERE,
    ADHERENCE_THRESHOLD,
    CLINICAL_SYMPTOMS,
    CLINICAL_DISCLAIMER,
    ESCALATOR_SYMPTOMS,
    HTN_STAGE1_DBP,
    HTN_STAGE1_SBP,
    HTN_STAGE2_DBP,
    HTN_STAGE2_SBP,
    HTN_URGENCY_DBP,
    HTN_URGENCY_SBP,
    SYMPTOM_CAP,
)


def score_respiration_rate(rr: Optional[float]) -> Optional[int]:
    """Score respiration rate according to Royal College of Physicians NEWS2 (2017).

    Returns None if respiration rate was not measured or recorded.
    """
    if rr is None:
        return None
    if rr <= 8.0:
        return 3  # Red Flag: severe bradypnea / respiratory depression
    if rr <= 11.0:
        return 1
    if rr <= 20.0:
        return 0  # Normal adult resting range
    if rr <= 24.0:
        return 2  # Tachypnea
    return 3  # Red Flag: severe tachypnea (>= 25)


def score_spo2_scale1(spo2: float) -> int:
    """Score peripheral capillary oxygen saturation under NEWS2 Scale 1 (General Population)."""
    if spo2 <= 91.0:
        return 3  # Red Flag: acute severe hypoxia
    if spo2 <= 93.0:
        return 2
    if spo2 <= 95.0:
        return 1
    return 0  # Normal healthy range (>= 96%)


def score_spo2_scale2(spo2: float, on_oxygen: bool) -> int:
    """Score oxygen saturation under NEWS2 Scale 2 (Hypercapnic Respiratory Failure / COPD Target 88–92%).

    Verified against official RCP NEWS2 (2017):
    - Values >= 93% on room air are reassuring (0 points).
    - Values >= 93% on supplemental oxygen risk blunting hypoxic respiratory drive (1-3 points).
    """
    if spo2 <= 83.0:
        return 3  # Red Flag: profound hypoxemia below COPD safe envelope
    if spo2 <= 85.0:
        return 2
    if spo2 <= 87.0:
        return 1
    if spo2 <= 92.0:
        return 0  # Clinician-prescribed target range (88–92%)

    # >= 93%:
    if not on_oxygen:
        return 0  # Room air: normal and reassuring

    # Supplemental oxygen: progressive alert for oxygen-induced hypercapnia
    if spo2 <= 94.0:
        return 1
    if spo2 <= 96.0:
        return 2
    return 3  # >= 97% on supplemental oxygen (Red Flag)


def score_systolic_bp(sbp: float) -> int:
    """Score systolic blood pressure according to Royal College of Physicians NEWS2 (2017)."""
    if sbp <= 90.0:
        return 3  # Red Flag: severe hypotension / circulatory shock
    if sbp <= 100.0:
        return 2
    if sbp <= 110.0:
        return 1
    if sbp <= 219.0:
        return 0  # Standard acute range
    return 3  # Red Flag: acute hypertensive crisis (>= 220 mmHg)


def score_heart_rate(hr: float) -> int:
    """Score resting heart rate according to Royal College of Physicians NEWS2 (2017)."""
    if hr <= 40.0:
        return 3  # Red Flag: severe bradycardia
    if hr <= 50.0:
        return 1
    if hr <= 90.0:
        return 0  # Normal resting pulse
    if hr <= 110.0:
        return 1
    if hr <= 130.0:
        return 2
    return 3  # Red Flag: severe tachycardia (>= 131 bpm)


def score_temperature(temp: float) -> int:
    """Score core body temperature in Celsius according to RCP NEWS2 (2017)."""
    if temp <= 35.0:
        return 3  # Red Flag: severe hypothermia
    if temp <= 36.0:
        return 1
    if temp <= 38.0:
        return 0  # Normal physiological core temperature
    if temp <= 39.0:
        return 1  # Pyrexia
    return 2  # High pyrexia / hyperpyrexia (>= 39.1 °C)


def score_hypertension(
    sbp: Optional[float], dbp: Optional[float]
) -> Tuple[int, bool, Optional[str]]:
    """Score chronic hypertension staging and urgency per AHA/ACC 2017 guidelines (CLAUDE.md H-6).

    Reported separately in Care Additions to avoid contaminating cited NEWS2 subtotal.
    Returns: (points, is_hypertensive_urgency_escalator, label)
    """
    if sbp is None and dbp is None:
        return 0, False, None

    # Hypertensive Urgency acts as an independent clinical escalator
    is_urgency = (sbp is not None and sbp >= HTN_URGENCY_SBP) or (
        dbp is not None and dbp >= HTN_URGENCY_DBP
    )
    if is_urgency:
        return 3, True, "Hypertensive Urgency (BP >= 180/120 mmHg)"

    # Stage 2 Hypertension
    is_stage2 = (sbp is not None and sbp >= HTN_STAGE2_SBP) or (
        dbp is not None and dbp >= HTN_STAGE2_DBP
    )
    if is_stage2:
        return 2, False, "Stage 2 Hypertension (BP >= 140/90 mmHg)"

    # Stage 1 Hypertension
    is_stage1 = (sbp is not None and sbp >= HTN_STAGE1_SBP) or (
        dbp is not None and dbp >= HTN_STAGE1_DBP
    )
    if is_stage1:
        return 1, False, "Stage 1 Hypertension (BP >= 130/80 mmHg)"

    return 0, False, "Normal Blood Pressure"


def score_symptoms(symptoms: List[str]) -> Tuple[int, List[str]]:
    """Score reported clinical symptoms against the closed 7-symptom dictionary (H-7).

    Awards 1 point per valid symptom, capped at SYMPTOM_CAP (4).
    Returns: (points, triggered_escalators)
    """
    valid_symptoms = [s for s in symptoms if s in CLINICAL_SYMPTOMS]
    triggered_escalators = [s for s in valid_symptoms if s in ESCALATOR_SYMPTOMS]
    points = min(len(valid_symptoms), SYMPTOM_CAP)
    return points, triggered_escalators


def score_adherence(adherence_rate: Optional[float]) -> Tuple[int, str]:
    """Score 7-day Proportion of Days Covered (PDC) medication adherence (H-8).

    Reported in Care Additions. Zero history on Day 1 returns 0 points (zero penalty).
    Returns: (points, adherence_note)
    """
    if adherence_rate is None:
        return 0, "No adherence penalty applied (new patient / no history)"
    if adherence_rate >= ADHERENCE_THRESHOLD:
        return 0, f"Optimal medication adherence ({adherence_rate*100:.0f}%)"
    if adherence_rate >= ADHERENCE_SEVERE:
        return 1, f"Suboptimal medication adherence ({adherence_rate*100:.0f}%)"
    return 2, f"Severe medication non-adherence ({adherence_rate*100:.0f}%)"


def get_tier_thresholds(max_possible_news2: int) -> Tuple[int, int, int]:
    """Calculate proportional (moderate_min, high_min, critical_min) thresholds.

    Dynamically adapts to partial vitals subsets.
    Calibrated split coefficients:
    - Moderate: 8% (minimum 1)
    - High: 27% (minimum moderate + 1)
    - Critical: 40% (minimum high + 1)

    Mathematically verified:
    - max=15 (with RR): (1, 4, 6) -> matches canonical spec H-5/H-9 exactly.
    - max=12 (without RR): (1, 3, 5) -> matches canonical spec H-5/H-9 exactly.
    - max=9 (3 vitals): (1, 2, 4).
    - max=6 (2 vitals): (1, 2, 3).
    - max=3 (1 vital):  (1, 2, 3).
    """
    safe_max = max(1, max_possible_news2)
    moderate_min = max(1, round(0.08 * safe_max))
    high_min = max(moderate_min + 1, round(0.27 * safe_max))
    critical_min = max(high_min + 1, round(0.40 * safe_max))
    return moderate_min, high_min, critical_min


def classify_tier(
    news2_subtotal: int,
    max_possible_news2: int,
    red_flag: bool,
    care_escalators: List[str],
    care_subtotal: int,
) -> str:
    """Classify final Layer 1 clinical risk tier incorporating proportional thresholds,

    independent clinical escalators, and care burden escalation rules.
    """
    moderate_min, high_min, critical_min = get_tier_thresholds(max_possible_news2)

    # 1. Base tier from proportional NEWS2 subtotal
    if news2_subtotal >= critical_min:
        base_tier = "Critical"
    elif news2_subtotal >= high_min:
        base_tier = "High"
    elif news2_subtotal >= moderate_min:
        base_tier = "Moderate"
    else:
        base_tier = "Low"

    # 2. Independent Clinical Escalators override to at least High
    has_escalators = red_flag or len(care_escalators) > 0
    if has_escalators and base_tier in ("Low", "Moderate"):
        base_tier = "High"

    # 3. Care Additions Burden Scaling (Finding 10 Resolution)
    if care_subtotal >= 6:
        # High care burden (severe non-adherence + stage 2 HTN + symptoms) bumps 2 tiers
        if base_tier == "Low":
            base_tier = "High"
        elif base_tier == "Moderate":
            base_tier = "Critical"
    elif care_subtotal >= 3:
        # Moderate care burden bumps 1 tier
        if base_tier == "Low":
            base_tier = "Moderate"
        elif base_tier == "Moderate":
            base_tier = "High"

    return base_tier


def generate_plain_language_reason(
    tier: str,
    component_points: Dict[str, int],
    care_points: Dict[str, int],
    escalators: List[str],
    vitals: VitalsReading,
) -> str:
    """Synthesizes clinical findings into a cohesive, non-redundant plain-language explanation (NFR5)."""
    # 1. Handle Critical and High Tier Escalator Cases
    if "hypertensive_urgency" in escalators:
        bp_str = (
            f"{int(vitals.systolic_bp)}/{int(vitals.diastolic_bp)} mmHg"
            if vitals.diastolic_bp
            else f"{int(vitals.systolic_bp)} mmHg"
        )
        if "symptom_confusion" in escalators:
            return (
                f"{tier} Risk: Emergency clinical escalation triggered by severe hypertensive crisis "
                f"(Blood Pressure {bp_str}) accompanied by reported new acute confusion."
            )
        if "symptom_chest_pain" in escalators:
            return (
                f"{tier} Risk: Emergency clinical escalation triggered by severe hypertensive crisis "
                f"(Blood Pressure {bp_str}) accompanied by acute chest pain."
            )
        return (
            f"{tier} Risk: Severe hypertensive urgency detected (Blood Pressure {bp_str}). "
            "Immediate clinical evaluation advised."
        )

    # Multi-parameter physiological red flags
    red_flag_components = [k for k, pts in component_points.items() if pts == 3]
    if len(red_flag_components) >= 2:
        reasons = []
        if "temperature_c" in red_flag_components:
            reasons.append(f"hypothermia (Temperature {vitals.temperature_c} °C)")
        if "respiration_rate" in red_flag_components:
            desc = "tachypnea" if vitals.respiration_rate >= 25 else "bradypnea"
            reasons.append(
                f"severe {desc} (Respiration Rate {int(vitals.respiration_rate)} breaths/min)"
            )
        if "heart_rate" in red_flag_components:
            desc = "tachycardia" if vitals.heart_rate >= 131 else "bradycardia"
            reasons.append(f"severe {desc} (Heart Rate {int(vitals.heart_rate)} bpm)")
        if "spo2" in red_flag_components:
            reasons.append(f"severe hypoxemia (SpO2 {int(vitals.spo2)}%)")
        if "systolic_bp" in red_flag_components:
            desc = "hypertensive crisis" if vitals.systolic_bp >= 220 else "hypotension/shock"
            reasons.append(f"severe {desc} (Systolic BP {int(vitals.systolic_bp)} mmHg)")

        return (
            f"{tier} Risk: Severe multi-parameter clinical deterioration indicated by "
            f"{' and '.join(reasons)}. Prompt medical attention required."
        )

    # Single physiological red flag + symptom escalator
    if red_flag_components and any(e.startswith("symptom_") for e in escalators):
        rf_key = red_flag_components[0]
        sym_escalators = [
            CLINICAL_SYMPTOMS[e.replace("symptom_", "")].get(
                "short_label", CLINICAL_SYMPTOMS[e.replace("symptom_", "")]["label"]
            ).lower()
            for e in escalators
            if e.startswith("symptom_")
        ]
        rf_desc = ""
        if rf_key == "heart_rate":
            desc = "severe tachycardia" if vitals.heart_rate >= 131 else "severe bradycardia"
            rf_desc = f"{desc} (Heart Rate {int(vitals.heart_rate)} bpm, Red Flag)"
        elif rf_key == "spo2":
            rf_desc = f"severe oxygen desaturation (SpO2 {int(vitals.spo2)}%, Red Flag)"
        elif rf_key == "systolic_bp":
            desc = "hypertensive crisis" if vitals.systolic_bp >= 220 else "severe hypotension"
            rf_desc = f"{desc} (Systolic BP {int(vitals.systolic_bp)} mmHg, Red Flag)"
        elif rf_key == "temperature_c":
            rf_desc = f"severe hypothermia (Temperature {vitals.temperature_c} °C, Red Flag)"
        elif rf_key == "respiration_rate":
            rf_desc = f"severe respiratory compromise (Respiration Rate {int(vitals.respiration_rate)} breaths/min, Red Flag)"

        return (
            f"{tier} Risk: Immediate clinical attention advised due to {rf_desc} "
            f"accompanied by reported {' and '.join(sym_escalators)}."
        )

    # Single physiological red flag alone
    if red_flag_components:
        rf_key = red_flag_components[0]
        if rf_key == "heart_rate":
            desc = "Severe tachycardia" if vitals.heart_rate >= 131 else "Severe bradycardia"
            return f"{tier} Risk: {desc} (Heart Rate {int(vitals.heart_rate)} bpm) triggers a single-parameter clinical safety alert."
        if rf_key == "spo2":
            return f"{tier} Risk: Severe hypoxemia (SpO2 {int(vitals.spo2)}%) triggers a single-parameter clinical safety alert."
        if rf_key == "systolic_bp":
            desc = (
                "Extreme hypertensive crisis" if vitals.systolic_bp >= 220 else "Severe hypotension"
            )
            return f"{tier} Risk: {desc} (Systolic BP {int(vitals.systolic_bp)} mmHg) triggers a single-parameter clinical safety alert."
        if rf_key == "temperature_c":
            return f"{tier} Risk: Severe hypothermia (Temperature {vitals.temperature_c} °C) triggers a clinical safety alert."
        if rf_key == "respiration_rate":
            return f"{tier} Risk: Severe respiratory distress (Respiration Rate {int(vitals.respiration_rate)} breaths/min) triggers a safety alert."

    # Symptom escalators alone
    if any(e.startswith("symptom_") for e in escalators):
        sym_names = [
            CLINICAL_SYMPTOMS[e.replace("symptom_", "")].get(
                "short_label", CLINICAL_SYMPTOMS[e.replace("symptom_", "")]["label"]
            )
            for e in escalators
            if e.startswith("symptom_")
        ]
        return f"{tier} Risk: Clinically significant escalator symptom reported ({', '.join(sym_names)}) requiring follow-up."

    # High tier by aggregate score
    if tier == "Critical":
        return "Critical Risk: Cumulative physiological vitals indicate severe overall clinical deterioration."
    if tier == "High":
        return "High Risk: Multiple physiological elevations indicate significant clinical vulnerability."

    # Moderate tier
    if tier == "Moderate":
        if sum(care_points.values()) >= 3 and sum(component_points.values()) == 0:
            return (
                "Moderate Risk: Baseline vitals are currently within normal range, but reported symptoms "
                "and medication non-adherence warrant proactive clinical review."
            )
        return "Moderate Risk: Mild deviation in physiological parameters observed. Continue routine monitoring."

    # Low tier
    return "Low Risk: Vital signs are stable and within normal baseline clinical parameters."


def compute_home_news(vitals: VitalsReading) -> ModifiedHomeNEWSResult:
    """Execute stateless Layer 1 Modified Home-NEWS rule scoring for a single reading."""
    component_points: Dict[str, int] = {}
    parameters_used: List[str] = []
    escalators_triggered: List[str] = []

    # 1. Respiration Rate (Optional)
    if vitals.respiration_rate is not None:
        rr_pts = score_respiration_rate(vitals.respiration_rate)
        if rr_pts is not None:
            component_points["respiration_rate"] = rr_pts
            parameters_used.append("respiration_rate")
            if rr_pts == 3:
                escalators_triggered.append("news2_red_flag_respiration_rate")

    # 2. SpO2 Oxygen Saturation (Scale 1 or Scale 2 with air/oxygen branching)
    if vitals.spo2 is not None:
        if vitals.spo2_scale == 2:
            spo2_pts = score_spo2_scale2(vitals.spo2, on_oxygen=bool(vitals.on_supplemental_oxygen))
        else:
            spo2_pts = score_spo2_scale1(vitals.spo2)

        component_points["spo2"] = spo2_pts
        parameters_used.append("spo2")
        if spo2_pts == 3:
            escalators_triggered.append("news2_red_flag_spo2")

    # 3. Systolic Blood Pressure
    if vitals.systolic_bp is not None:
        sbp_pts = score_systolic_bp(vitals.systolic_bp)
        component_points["systolic_bp"] = sbp_pts
        parameters_used.append("systolic_bp")
        if sbp_pts == 3:
            escalators_triggered.append("news2_red_flag_systolic_bp")

    # 4. Heart Rate
    if vitals.heart_rate is not None:
        hr_pts = score_heart_rate(vitals.heart_rate)
        component_points["heart_rate"] = hr_pts
        parameters_used.append("heart_rate")
        if hr_pts == 3:
            escalators_triggered.append("news2_red_flag_heart_rate")

    # 5. Temperature
    if vitals.temperature_c is not None:
        temp_pts = score_temperature(vitals.temperature_c)
        component_points["temperature_c"] = temp_pts
        parameters_used.append("temperature_c")
        if temp_pts == 3:
            escalators_triggered.append("news2_red_flag_temperature")

    # Subtotal from core physiological parameters
    news2_subtotal = sum(component_points.values())
    red_flag = any(pts >= 3 for pts in component_points.values())

    # Calculate max possible points for the vitals actually present (3 pts per parameter)
    max_possible_news2 = len(parameters_used) * 3

    # 6. CareOClock Additions (Reported Separately per Canonical Spec §6.6)
    care_component_points: Dict[str, int] = {}

    # Hypertension Staging (H-6)
    htn_pts, htn_urgency, _ = score_hypertension(vitals.systolic_bp, vitals.diastolic_bp)
    care_component_points["hypertension"] = htn_pts
    if htn_urgency:
        escalators_triggered.append("hypertensive_urgency")

    # Symptoms (H-7)
    sym_pts, sym_escalators = score_symptoms(vitals.symptom_flags)
    care_component_points["symptoms"] = sym_pts
    for sym in sym_escalators:
        escalators_triggered.append(f"symptom_{sym}")

    # Adherence (H-8)
    adh_pts, _ = score_adherence(vitals.adherence_rate_7d)
    care_component_points["adherence"] = adh_pts

    care_additions_subtotal = sum(care_component_points.values())

    # Extract non-physiological escalators for tier classification
    care_escalators = [e for e in escalators_triggered if not e.startswith("news2_red_flag_")]

    # 7. Tier Classification
    tier = classify_tier(
        news2_subtotal=news2_subtotal,
        max_possible_news2=max_possible_news2,
        red_flag=red_flag,
        care_escalators=care_escalators,
        care_subtotal=care_additions_subtotal,
    )

    # 8. Plain-Language Explanation (NFR5)
    plain_reason = generate_plain_language_reason(
        tier=tier,
        component_points=component_points,
        care_points=care_component_points,
        escalators=escalators_triggered,
        vitals=vitals,
    )

    # 9. Data Completeness Metrics
    data_completeness = {
        "parameters_present": len(parameters_used),
        "parameters_expected": 5,  # Standard complete panel: RR, SpO2, SBP, HR, Temp
        "completeness_ratio": round(len(parameters_used) / 5.0, 2),
        "has_respiration_rate": "respiration_rate" in parameters_used,
    }

    return ModifiedHomeNEWSResult(
        layer1_tier=tier,
        news2_subtotal=news2_subtotal,
        care_additions_subtotal=care_additions_subtotal,
        red_flag_triggered=red_flag,
        escalators_triggered=escalators_triggered,
        spo2_scale_used=vitals.spo2_scale,
        component_points=component_points,
        care_component_points=care_component_points,
        parameters_used=parameters_used,
        data_completeness=data_completeness,
        plain_language_reason=plain_reason,
        disclaimer=CLINICAL_DISCLAIMER,
    )
