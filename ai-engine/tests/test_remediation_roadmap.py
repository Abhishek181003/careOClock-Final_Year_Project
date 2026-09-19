# Directory - ai-engine/tests/test_remediation_roadmap.py

"""Comprehensive Test Suite for Phase 1 Remediation Roadmap (Findings 1 through 7).

Verifies all 7 roadmap findings and review refinements:
1. layer2_tier statistical baseline arm vs ML benchmark clarification (Finding 1)
2. recorded_at temporal anchoring without wall-clock dependency (Finding 2)
3. Fail-closed production authentication with pydantic-settings (Finding 3 & Gap 3)
4. Parameterized contamination enabling sensitivity sweeps (Finding 4)
5. UI copy contract alignment and natural clinical sentence generation (Finding 5 & Gap 2)
6. Clinician-gating defense-in-depth on SpO2 Scale 2 (Finding 6 & Gap 1)
7. Absence of orphaned pandas dependency from requirements (Finding 7)
"""

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models.vitals import (
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    PersonalizedAnomalyResult,
    VitalsReading,
)
from app.scoring.constants import (
    AI_ENGINE_INTERNAL_KEY_DEFAULT,
    CLINICAL_SYMPTOMS,
    CONTAMINATION,
)
from app.scoring.home_news import compute_home_news
from app.scoring.personalized_anomaly import (
    compute_personalized_anomaly,
    normalize_to_utc_date,
)


def _build_synthetic_history(
    n_days: int,
    anchor_date: date,
    patient_id: str = "PAT_REMED_01",
    noise_scale: float = 1.5,
) -> list:
    """Generate n_days of historical morning/evening vitals with realistic variation."""
    history = []
    for i in range(n_days, 0, -1):
        day = anchor_date - timedelta(days=i)
        m_dt = datetime(day.year, day.month, day.day, 8, 0, tzinfo=timezone.utc)
        e_dt = datetime(day.year, day.month, day.day, 20, 0, tzinfo=timezone.utc)
        # Add slight natural daily variation so the feature matrix is non-singular
        delta_m = (i % 5) * 0.8 * noise_scale
        delta_e = ((i + 2) % 5) * 0.8 * noise_scale
        history.append(
            HistoricalVitalsReading(
                patientId=patient_id,
                recordedAt=m_dt,
                slot="morning",
                systolicBp=round(120.0 + delta_m, 1),
                diastolicBp=80.0,
                heartRate=round(72.0 + delta_m, 1),
                spo2=98.0,
                temperatureC=36.6,
                respirationRate=16.0,
            )
        )
        history.append(
            HistoricalVitalsReading(
                patientId=patient_id,
                recordedAt=e_dt,
                slot="evening",
                systolicBp=round(122.0 + delta_e, 1),
                diastolicBp=81.0,
                heartRate=round(74.0 + delta_e, 1),
                spo2=98.0,
                temperatureC=36.7,
                respirationRate=16.0,
            )
        )
    return history


# =====================================================================
# Finding 1: Statistical Baseline Arm vs ML Benchmark Arm
# =====================================================================


def test_finding1_statistical_baseline_arm_and_metadata():
    """Verify layer2_tier is the statistical baseline arm and ML metrics are in evaluation_metadata."""
    anchor = date(2026, 9, 10)
    history = _build_synthetic_history(14, anchor)

    # Moderate deviation reading: SBP 140 (baseline is ~121, std ~1.0 -> z ~ 19 -> Critical)
    current = VitalsReading(
        patientId="PAT_REMED_01",
        systolicBp=140.0,
        diastolicBp=80.0,
        heartRate=72.0,
        recordedAt=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
    )

    req = Layer2ScoringRequest(
        patientId="PAT_REMED_01",
        history=history,
        currentReading=current,
        currentDate=anchor,
    )
    result = compute_personalized_anomaly(req)

    # layer2_tier is derived from statistical baseline z-scores
    assert result.layer2_tier in ("Moderate", "High", "Critical")
    assert result.max_z_score is not None

    # ML benchmark metrics reside exclusively in evaluation_metadata
    assert result.evaluation_metadata is not None
    assert result.evaluation_metadata.isolation_forest_decision_function is not None
    assert isinstance(result.evaluation_metadata.isolation_forest_is_anomaly, bool)
    assert result.evaluation_metadata.lof_decision_function is not None
    assert isinstance(result.evaluation_metadata.lof_is_anomaly, bool)

    # Field description explicitly documents statistical baseline arm
    field_desc = PersonalizedAnomalyResult.model_fields["layer2_tier"].description
    assert "statistical baseline" in field_desc.lower()


# =====================================================================
# Finding 2: Temporal Anchoring via recorded_at (Dead Branch Eliminated)
# =====================================================================


def test_finding2_recorded_at_temporal_anchoring():
    """Verify that a reading timestamp ≠ wall-clock time correctly anchors today_date."""
    # Reading timestamp 10 days in the past
    past_dt = datetime(2026, 1, 15, 14, 30, tzinfo=timezone.utc)
    reading = VitalsReading(
        patientId="PAT_REMED_02",
        recordedAt=past_dt,
        systolicBp=120.0,
        diastolicBp=80.0,
        heartRate=70.0,
    )

    # Verify field is present and correctly populated
    assert reading.recorded_at == past_dt
    expected_anchor = date(2026, 1, 15)
    assert normalize_to_utc_date(reading.recorded_at) == expected_anchor

    # History contains readings strictly before 2026-01-15, plus one on 2026-01-16 (future to past_dt)
    history = _build_synthetic_history(10, expected_anchor, patient_id="PAT_REMED_02")
    future_to_reading = HistoricalVitalsReading(
        patientId="PAT_REMED_02",
        recordedAt=datetime(2026, 1, 16, 8, 0, tzinfo=timezone.utc),
        slot="morning",
        systolicBp=199.0,
    )
    history.append(future_to_reading)

    # When currentDate is omitted, compute_personalized_anomaly must anchor to reading.recorded_at
    req = Layer2ScoringRequest(
        patientId="PAT_REMED_02",
        history=history,
        currentReading=reading,
    )
    result = compute_personalized_anomaly(req)

    # System must activate using the 10 days prior to 2026-01-15
    assert result.status == "active"
    # Reading from 2026-01-16 must NOT be in the fitted baseline (mean SBP should be ~121, not inflated)
    assert result.rolling_baseline["systolic_bp"]["mean"] < 130.0


# =====================================================================
# Finding 3: Fail-Closed Production Auth & Settings Config (Gap 3)
# =====================================================================


def test_finding3_production_fails_closed_with_default_or_missing_key():
    """Verify app fails to boot if ENVIRONMENT='production' with default or missing secret."""
    # Production with default key -> must raise ValidationError
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENVIRONMENT="production",
            AI_ENGINE_INTERNAL_KEY=AI_ENGINE_INTERNAL_KEY_DEFAULT,
        )
    assert "FATAL SECURITY VIOLATION" in str(exc_info.value)

    # Production with empty key -> must raise ValidationError
    with pytest.raises(ValidationError) as exc_info2:
        Settings(
            ENVIRONMENT="production",
            AI_ENGINE_INTERNAL_KEY="",
        )
    assert "FATAL SECURITY VIOLATION" in str(exc_info2.value)

    # Production with secure, non-default key -> boots cleanly
    prod_settings = Settings(
        ENVIRONMENT="production",
        AI_ENGINE_INTERNAL_KEY="a-very-secure-random-secret-key-32chars!",
    )
    assert prod_settings.ENVIRONMENT == "production"
    assert prod_settings.AI_ENGINE_INTERNAL_KEY == "a-very-secure-random-secret-key-32chars!"

    # Development allows default key for rapid local workflows
    dev_settings = Settings(
        ENVIRONMENT="development",
        AI_ENGINE_INTERNAL_KEY=AI_ENGINE_INTERNAL_KEY_DEFAULT,
    )
    assert dev_settings.ENVIRONMENT == "development"


# =====================================================================
# Finding 4: Contamination Parameterization for Sensitivity Sweeps
# =====================================================================


def test_finding4_contamination_parameterization():
    """Verify calling with contamination=0.10 changes if_score without code edits."""
    anchor = date(2026, 9, 10)
    history = _build_synthetic_history(14, anchor, patient_id="PAT_REMED_04")
    current = VitalsReading(
        patientId="PAT_REMED_04",
        systolicBp=132.0,
        diastolicBp=82.0,
        heartRate=75.0,
        recordedAt=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
    )

    req = Layer2ScoringRequest(
        patientId="PAT_REMED_04",
        history=history,
        currentReading=current,
        currentDate=anchor,
    )

    # Run 1: Default contamination (0.05)
    res_default = compute_personalized_anomaly(req)
    if_score_default = res_default.evaluation_metadata.isolation_forest_decision_function
    assert res_default.evaluation_metadata.contamination_used == CONTAMINATION

    # Run 2: Swept contamination (0.10) passed via parameter
    res_swept = compute_personalized_anomaly(req, contamination=0.10)
    if_score_swept = res_swept.evaluation_metadata.isolation_forest_decision_function
    assert res_swept.evaluation_metadata.contamination_used == 0.10

    # Decision function output shifts due to the offset_ quantile changing
    assert if_score_default != if_score_swept

    # Run 3: Swept contamination (0.15) passed via parameter
    res_param_15 = compute_personalized_anomaly(req, contamination=0.15)
    assert res_param_15.evaluation_metadata.contamination_used == 0.15

    # Run 4: Verify patient-facing request schema does NOT expose test dials
    with pytest.raises(ValidationError):
        Layer2ScoringRequest(
            patientId="PAT_REMED_04",
            history=history,
            currentReading=current,
            currentDate=anchor,
            contamination=0.15,  # Extra forbidden field
        )


# =====================================================================
# Finding 5: Clinical Symptoms UI Copy Contract & Natural Phrasing (Gap 2)
# =====================================================================


def test_finding5_symptom_label_and_sentence_synthesis():
    """Verify confusion label matches UI copy contract while explanations use natural short_label."""
    confusion_def = CLINICAL_SYMPTOMS["confusion"]

    # Checkbox label must strictly match the Phase 9 UI Copy contract
    expected_ui_copy = "New or acute confusion/disorientation compared to patient's normal baseline"
    assert confusion_def["label"] == expected_ui_copy

    # Short label for sentence synthesis
    assert confusion_def["short_label"] == "acute confusion"

    # Verify sentence synthesis produces crisp clinical phrasing
    vitals = VitalsReading(
        patientId="PAT_REMED_05",
        systolicBp=120.0,
        diastolicBp=80.0,
        heartRate=70.0,
        symptomFlags=["confusion"],
    )
    result = compute_home_news(vitals)
    assert result.layer1_tier == "High"  # Confusion is an independent escalator
    assert "acute confusion" in result.plain_language_reason
    # Ensure the clunky run-on checkbox sentence is NOT dumped into the doctor reason
    assert "compared to patient's normal baseline" not in result.plain_language_reason


# =====================================================================
# Finding 6: Clinician-Gating Defense-in-Depth for SpO2 Scale 2 (Gap 1)
# =====================================================================


def test_finding6_clinician_gating_defense_in_depth():
    """Verify SpO2 Scale 2 is rejected when requested by non-doctor role."""
    # 1. Non-doctor (patient) specifying Scale 2 -> rejected
    with pytest.raises(ValidationError) as exc_info:
        VitalsReading(
            patientId="PAT_REMED_06",
            systolicBp=120.0,
            diastolicBp=80.0,
            spo2=90.0,
            spo2Scale=2,
            onSupplementalOxygen=False,
            requestingRole="patient",
        )
    assert "restricted to clinician (doctor)" in str(exc_info.value)

    # 2. Non-doctor (caregiver) specifying Scale 2 -> rejected
    with pytest.raises(ValidationError) as exc_info2:
        VitalsReading(
            patientId="PAT_REMED_06",
            systolicBp=120.0,
            diastolicBp=80.0,
            spo2=90.0,
            spo2Scale=2,
            onSupplementalOxygen=False,
            requestingRole="caregiver",
        )
    assert "restricted to clinician (doctor)" in str(exc_info2.value)

    # 3. Doctor specifying Scale 2 -> permitted
    doctor_reading = VitalsReading(
        patientId="PAT_REMED_06",
        systolicBp=120.0,
        diastolicBp=80.0,
        spo2=90.0,
        spo2Scale=2,
        onSupplementalOxygen=False,
        requestingRole="doctor",
    )
    assert doctor_reading.spo2_scale == 2

    # 4. Standard Scale 1 specifying patient role -> permitted
    patient_scale1 = VitalsReading(
        patientId="PAT_REMED_06",
        systolicBp=120.0,
        diastolicBp=80.0,
        spo2=98.0,
        spo2Scale=1,
        requestingRole="patient",
    )
    assert patient_scale1.spo2_scale == 1


# =====================================================================
# Finding 7: Unused pandas Dependency Removed
# =====================================================================


def test_finding7_pandas_not_in_requirements():
    """Verify pandas is removed from requirements.txt and not an orphaned heavy dependency."""
    req_path = Path(__file__).resolve().parent.parent / "requirements.txt"
    assert req_path.exists(), "requirements.txt must exist"

    content = req_path.read_text(encoding="utf-8")
    lines = [
        line.strip() for line in content.splitlines() if line.strip() and not line.startswith("#")
    ]
    package_names = [line.split(">=")[0].split("==")[0].strip().lower() for line in lines]

    assert "pandas" not in package_names, "pandas must NOT be in requirements.txt"
