# Directory - ai-engine/tests/test_phase3_unit.py

"""Phase 3 Unit Test Suite for CareOClock Layer 2 Anomaly Detection.

Verifies pure functions and boundary safety with zero server dependencies:
1. aggregate_readings_by_day:
   - H-13: Reading dated exactly == today_date strictly excluded.
   - Window ceiling: Reading dated at today_date - 29 days strictly excluded.
   - Window boundary: Reading dated at today_date - 28 days strictly included.
   - A-12: Duplicate (date, slot) entries — latest received reading supersedes.
   - Freezegun: Frozen temporal anchor verification for unrecorded reading dates.
2. compute_baseline_statistics:
   - count == 1 -> std == 0.0, never NaN from ddof=1.
3. z-score computation & zero-variance handling:
   - Baseline std < 1e-4 clamps to +/-3.5 without raising ZeroDivisionError.
4. classify_anomaly_tier:
   - Exact boundary values (1.8, 2.5, 3.5) with lower-bound inclusive semantics.
5. Cold-start gate:
   - Boundary at exactly 6 days (inactive) vs 7 days (active).
6. Layer2ScoringRequest.validate_patient_integrity:
   - Rejects mismatched patient_id on current reading and at ANY position in history.
"""

from datetime import date, datetime, timedelta, timezone
from typing import List
import freezegun
import numpy as np
import pytest
from pydantic import ValidationError

from app.models.vitals import (
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    VitalsReading,
)
from app.scoring.constants import (
    L2_COLD_START_STATUS,
    MATURE_WINDOW_DAYS,
)
from app.scoring.personalized_anomaly import (
    DayVitalAggregation,
    aggregate_readings_by_day,
    classify_anomaly_tier,
    compute_baseline_statistics,
    compute_personalized_anomaly,
)

# =====================================================================
# 1. aggregate_readings_by_day Boundary & Deduplication Tests
# =====================================================================


def test_aggregate_readings_by_day_h13_today_date_excluded():
    """H-13 & A-14: Readings dated >= today_date must NEVER enter the fitted window."""
    today = date(2026, 9, 16)
    history = [
        HistoricalVitalsReading(
            patientId="PAT_UNIT_01",
            recordedAt=datetime(2026, 9, 16, 8, 30, tzinfo=timezone.utc),  # Today's morning
            slot="morning",
            systolicBp=122.0,
            heartRate=72.0,
        ),
        HistoricalVitalsReading(
            patientId="PAT_UNIT_01",
            recordedAt=datetime(2026, 9, 15, 18, 0, tzinfo=timezone.utc),  # Yesterday
            slot="evening",
            systolicBp=120.0,
            heartRate=70.0,
        ),
    ]

    day_aggs, days_of_history = aggregate_readings_by_day(history, today_date=today)

    # Scored day (Sept 16) is strictly excluded
    dates_in_aggs = [agg.date for agg in day_aggs]
    assert today not in dates_in_aggs
    assert date(2026, 9, 15) in dates_in_aggs
    assert len(day_aggs) == 1
    assert days_of_history["systolic_bp"] == 1


def test_aggregate_readings_by_day_window_ceiling_and_boundary():
    """Window ceiling test: today - 28 days included; today - 29 days excluded."""
    today = date(2026, 9, 30)
    day_28_prior = today - timedelta(days=MATURE_WINDOW_DAYS)  # today - 28 days
    day_29_prior = today - timedelta(days=MATURE_WINDOW_DAYS + 1)  # today - 29 days

    history = [
        HistoricalVitalsReading(
            patientId="PAT_UNIT_02",
            recordedAt=datetime.combine(day_28_prior, datetime.min.time(), tzinfo=timezone.utc),
            slot="morning",
            systolicBp=118.0,
        ),
        HistoricalVitalsReading(
            patientId="PAT_UNIT_02",
            recordedAt=datetime.combine(day_29_prior, datetime.min.time(), tzinfo=timezone.utc),
            slot="morning",
            systolicBp=140.0,
        ),
    ]

    day_aggs, days_of_history = aggregate_readings_by_day(history, today_date=today)

    dates_in_aggs = [agg.date for agg in day_aggs]
    assert day_28_prior in dates_in_aggs, "Boundary day (today - 28d) must be included (inclusive)"
    assert day_29_prior not in dates_in_aggs, "Day beyond ceiling (today - 29d) must be excluded"
    assert len(day_aggs) == 1


def test_aggregate_readings_by_day_duplicate_slot_latest_received_wins():
    """A-12: Defensive deduplication keeping latest-received reading per (date, slot)."""
    today = date(2026, 9, 16)
    target_date = today - timedelta(days=2)

    # Reading A received first (initial reading: 115.0)
    reading_a = HistoricalVitalsReading(
        patientId="PAT_UNIT_03",
        recordedAt=datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc),
        slot="morning",
        systolicBp=115.0,
    )
    # Reading B received second (corrected / updated reading: 135.0)
    reading_b = HistoricalVitalsReading(
        patientId="PAT_UNIT_03",
        recordedAt=datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc),
        slot="morning",
        systolicBp=135.0,
    )

    day_aggs, _ = aggregate_readings_by_day([reading_a, reading_b], today_date=today)

    assert len(day_aggs) == 1
    agg = day_aggs[0]
    assert agg.date == target_date
    assert agg.morning_reading is not None
    # Latest reading (reading_b) must win
    assert agg.morning_reading.systolic_bp == 135.0


def test_aggregate_readings_by_day_freezegun_temporal_fallback():
    """Verify fallback date resolution when recorded_at is omitted using freezegun."""
    with freezegun.freeze_time("2026-07-20 14:00:00"):
        today = date(2026, 7, 20)
        # Reading with no recorded_at falls back to today_date - 1 day
        reading_no_dt = HistoricalVitalsReading(
            patientId="PAT_UNIT_04",
            slot="morning",
            systolicBp=124.0,
        )

        day_aggs, days_of_history = aggregate_readings_by_day([reading_no_dt], today_date=today)

        assert len(day_aggs) == 1
        assert day_aggs[0].date == date(2026, 7, 19)
        assert days_of_history["systolic_bp"] == 1


# =====================================================================
# 2. compute_baseline_statistics Edge Cases
# =====================================================================


def test_compute_baseline_statistics_single_count_std_zero():
    """When count == 1, sample standard deviation must return 0.0, not NaN (ddof=1)."""
    target_date = date(2026, 9, 10)
    single_reading = HistoricalVitalsReading(
        patientId="PAT_UNIT_05",
        recordedAt=datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc),
        slot="morning",
        systolicBp=126.0,
        heartRate=74.0,
    )
    agg = DayVitalAggregation(date=target_date, morning_reading=single_reading)

    stats = compute_baseline_statistics([agg], active_vitals=["systolic_bp", "heart_rate"])

    assert stats["systolic_bp"]["count"] == 1.0
    assert stats["systolic_bp"]["mean"] == 126.0
    assert stats["systolic_bp"]["std"] == 0.0
    assert not np.isnan(stats["systolic_bp"]["std"])

    assert stats["heart_rate"]["count"] == 1.0
    assert stats["heart_rate"]["mean"] == 74.0
    assert stats["heart_rate"]["std"] == 0.0
    assert not np.isnan(stats["heart_rate"]["std"])


# =====================================================================
# 3. z-Score Zero-Variance Clamping & Classification
# =====================================================================


def test_z_score_zero_and_near_zero_std_clamping():
    """Verify that baseline std < 1e-4 clamps to +/-3.5 without ZeroDivisionError."""
    today = date(2026, 9, 15)
    # Generate 10 identical historical readings (std = 0.0)
    history = []
    for i in range(1, 11):
        dt = today - timedelta(days=i)
        history.append(
            HistoricalVitalsReading(
                patientId="PAT_UNIT_06",
                recordedAt=datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc),
                slot="morning",
                systolicBp=120.0,
                diastolicBp=80.0,
                heartRate=70.0,
            )
        )

    # Case A: Current value exceeds zero-variance mean -> clamps to +3.5
    req_higher = Layer2ScoringRequest(
        patientId="PAT_UNIT_06",
        history=history,
        currentReading=VitalsReading(
            patientId="PAT_UNIT_06", systolicBp=130.0, diastolicBp=80.0, heartRate=70.0
        ),
        currentDate=today,
    )
    res_higher = compute_personalized_anomaly(req_higher)
    assert res_higher.feature_deviations["systolic_bp"] == 3.5
    assert res_higher.layer2_tier == "Critical"

    # Case B: Current value is lower than zero-variance mean -> clamps to -3.5
    req_lower = Layer2ScoringRequest(
        patientId="PAT_UNIT_06",
        history=history,
        currentReading=VitalsReading(
            patientId="PAT_UNIT_06", systolicBp=110.0, diastolicBp=80.0, heartRate=70.0
        ),
        currentDate=today,
    )
    res_lower = compute_personalized_anomaly(req_lower)
    assert res_lower.feature_deviations["systolic_bp"] == -3.5
    assert res_lower.layer2_tier == "Critical"

    # Case C: Current value exactly equals zero-variance mean -> z-score is 0.0
    req_equal = Layer2ScoringRequest(
        patientId="PAT_UNIT_06",
        history=history,
        currentReading=VitalsReading(
            patientId="PAT_UNIT_06", systolicBp=120.0, diastolicBp=80.0, heartRate=70.0
        ),
        currentDate=today,
    )
    res_equal = compute_personalized_anomaly(req_equal)
    assert res_equal.feature_deviations["systolic_bp"] == 0.0
    assert res_equal.layer2_tier == "Low"


def test_classify_anomaly_tier_exact_boundaries():
    """Verify tier classification at exact numeric boundaries (1.8, 2.5, 3.5).

    Contract:
    - Low: |z| < 1.8
    - Moderate: 1.8 <= |z| < 2.5
    - High: 2.5 <= |z| < 3.5
    - Critical: |z| >= 3.5
    """
    assert classify_anomaly_tier(0.0) == "Low"
    assert classify_anomaly_tier(1.0) == "Low"
    assert classify_anomaly_tier(1.799) == "Low"

    # 1.8 boundary: Moderate
    assert classify_anomaly_tier(1.800) == "Moderate"
    assert classify_anomaly_tier(2.0) == "Moderate"
    assert classify_anomaly_tier(2.499) == "Moderate"

    # 2.5 boundary: High
    assert classify_anomaly_tier(2.500) == "High"
    assert classify_anomaly_tier(3.0) == "High"
    assert classify_anomaly_tier(3.499) == "High"

    # 3.5 boundary: Critical
    assert classify_anomaly_tier(3.500) == "Critical"
    assert classify_anomaly_tier(4.2) == "Critical"


# =====================================================================
# 4. Cold-Start Gate Boundary (6 vs 7 distinct days)
# =====================================================================


def _generate_history_days(count: int, anchor: date) -> List[HistoricalVitalsReading]:
    readings = []
    for i in range(1, count + 1):
        dt = anchor - timedelta(days=i)
        readings.append(
            HistoricalVitalsReading(
                patientId="PAT_COLD_01",
                recordedAt=datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc),
                slot="morning",
                systolicBp=120.0 + (i % 5),
                diastolicBp=80.0,
                heartRate=72.0,
            )
        )
    return readings


def test_cold_start_gate_boundary_6_vs_7_days():
    """Verify exact 6 distinct days is rejected; exactly 7 distinct days activates."""
    anchor = date(2026, 9, 20)
    current = VitalsReading(
        patientId="PAT_COLD_01", systolicBp=122.0, diastolicBp=80.0, heartRate=72.0
    )

    # 6 distinct days -> Cold start active
    history_6d = _generate_history_days(6, anchor)
    req_6d = Layer2ScoringRequest(
        patientId="PAT_COLD_01",
        history=history_6d,
        currentReading=current,
        currentDate=anchor,
    )
    res_6d = compute_personalized_anomaly(req_6d)
    assert res_6d.status == L2_COLD_START_STATUS
    assert res_6d.layer2_tier == L2_COLD_START_STATUS
    assert res_6d.active_features == []

    # 7 distinct days -> Cold start clears
    history_7d = _generate_history_days(7, anchor)
    req_7d = Layer2ScoringRequest(
        patientId="PAT_COLD_01",
        history=history_7d,
        currentReading=current,
        currentDate=anchor,
    )
    res_7d = compute_personalized_anomaly(req_7d)
    assert res_7d.status == "active"
    assert res_7d.layer2_tier in ("Low", "Moderate", "High", "Critical")
    assert "systolic_bp" in res_7d.active_features


# =====================================================================
# 5. Cross-Patient Integrity Validation
# =====================================================================


def test_validate_patient_integrity_rejects_cross_patient_leakage():
    """Strict privacy: Mismatched patient_id rejected on current reading and at ANY position in history."""
    anchor = date(2026, 9, 20)
    valid_history = _generate_history_days(8, anchor)
    valid_current = VitalsReading(patientId="PAT_MAIN", systolicBp=120.0, diastolicBp=80.0)

    # Case 1: Mismatched patient_id on current reading
    mismatched_current = VitalsReading(patientId="PAT_INTRUDER", systolicBp=120.0, diastolicBp=80.0)
    with pytest.raises(ValidationError, match="Cross-patient integrity violation"):
        Layer2ScoringRequest(
            patientId="PAT_MAIN",
            history=valid_history,
            currentReading=mismatched_current,
            currentDate=anchor,
        )

    # Case 2: Mismatched patient_id on history[0]
    history_tampered_first = [
        HistoricalVitalsReading(
            patientId="PAT_INTRUDER",
            recordedAt=valid_history[0].recorded_at,
            slot="morning",
            systolicBp=120.0,
        )
    ] + valid_history[1:]
    with pytest.raises(ValidationError, match="Cross-patient integrity violation"):
        Layer2ScoringRequest(
            patientId="PAT_MAIN",
            history=history_tampered_first,
            currentReading=valid_current,
            currentDate=anchor,
        )

    # Case 3: Mismatched patient_id deep in history (history[4])
    history_tampered_mid = valid_history.copy()
    history_tampered_mid[4] = HistoricalVitalsReading(
        patientId="PAT_LEAK",
        recordedAt=valid_history[4].recorded_at,
        slot="morning",
        systolicBp=120.0,
    )
    with pytest.raises(ValidationError, match="Cross-patient integrity violation"):
        Layer2ScoringRequest(
            patientId="PAT_MAIN",
            history=history_tampered_mid,
            currentReading=valid_current,
            currentDate=anchor,
        )

    # Case 4: Mismatched patient_id at last history index
    history_tampered_last = valid_history.copy()
    history_tampered_last[-1] = HistoricalVitalsReading(
        patientId="PAT_LEAK_LAST",
        recordedAt=valid_history[-1].recorded_at,
        slot="morning",
        systolicBp=120.0,
    )
    with pytest.raises(ValidationError, match="Cross-patient integrity violation"):
        Layer2ScoringRequest(
            patientId="PAT_MAIN",
            history=history_tampered_last,
            currentReading=valid_current,
            currentDate=anchor,
        )
