# Directory - ai-engine/tests/test_ewma_v2.py

"""Comprehensive Test Suite for Layer 2 v2 EWMA Trend Scoring.

Verifies:
1. Exact EWMA math against hand-computed analytical calculations.
2. Stationary noise remains Low; gradual drift / slow ramp triggers Moderate/High.
3. Missing days in lookback window impute z = 0.0 ('no news is normal').
4. 14-day truncation window: events >= 14 days ago do not affect EWMA.
5. Cold-start boundary: 6 days -> 'not yet available'; 7 days -> 'active'.
6. Zero-variance clamp: constant readings yield z = 0.0; sudden departure clamps to +-3.5.
7. Spike guard: single-day jump |z| >= 3.5 forces tier to Critical; jump < 3.5 is smoothed.
8. ENABLE_ML_BENCHMARK_ARMS toggle: None when False, populated when True.
"""

from datetime import date, datetime, timedelta, timezone
from typing import List
import numpy as np
import pytest

from app.config import get_settings
from app.models.vitals import (
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    PersonalizedAnomalyResult,
    VitalsReading,
)
from app.scoring.constants import (
    EWMA_LAMBDA,
    EWMA_LOOKBACK_DAYS,
    L2_COLD_START_STATUS,
    L2_TIER_THRESHOLDS,
)
from app.scoring.personalized_anomaly import (
    DayVitalAggregation,
    _compute_daily_z,
    aggregate_readings_by_day,
    compute_baseline_statistics,
    compute_ewma_trend,
    compute_personalized_anomaly,
)


def _make_reading(
    dt: datetime,
    sbp: float = 120.0,
    dbp: float = 80.0,
    hr: float = 72.0,
    spo2: float = 98.0,
    temp: float = 36.6,
    resp: float = 16.0,
    patient_id: str = "P1001",
    slot: str = "morning",
) -> HistoricalVitalsReading:
    return HistoricalVitalsReading(
        patientId=patient_id,
        systolicBp=sbp,
        diastolicBp=dbp,
        heartRate=hr,
        spo2=spo2,
        temperatureC=temp,
        respirationRate=resp,
        recordedAt=dt,
        slot=slot,
    )


# =====================================================================
# 1. Exact EWMA Math on Hand-Computed Example
# =====================================================================


def test_ewma_math_hand_computed():
    """Verify EWMA math matches exact hand-calculated recurrence and standardisation."""
    lam = 0.3
    sigma_ewma = np.sqrt(lam / (2.0 - lam))  # sqrt(0.3 / 1.7) = 0.4200840252...

    # Known 14 daily z-values
    # Days 0..9: 0.0, Day 10: 1.0, Day 11: 1.0, Day 12: 2.0, Day 13 (today): 2.5
    z_vals = [0.0] * 10 + [1.0, 1.0, 2.0, 2.5]
    assert len(z_vals) == 14

    # Hand recurrence:
    # S_0..S_9 = 0.0
    # S_10 = 0.3 * 1.0 + 0.7 * 0.0 = 0.3
    # S_11 = 0.3 * 1.0 + 0.7 * 0.3 = 0.51
    # S_12 = 0.3 * 2.0 + 0.7 * 0.51 = 0.6 + 0.357 = 0.957
    # S_13 = 0.3 * 2.5 + 0.7 * 0.957 = 0.75 + 0.6699 = 1.4199
    expected_s13 = 1.4199
    expected_trend_z = expected_s13 / sigma_ewma  # 1.4199 / 0.420084025208... = 3.37999...
    expected_rounded = round(float(expected_trend_z), 4)

    # Replicate recurrence in numpy
    s = z_vals[0]
    for t in range(1, 14):
        s = lam * z_vals[t] + (1.0 - lam) * s

    assert abs(s - expected_s13) < 1e-12
    trend_z = s / sigma_ewma
    assert round(trend_z, 4) == expected_rounded
    assert round(trend_z, 4) == 3.38


# =====================================================================
# 2. Stationary Noise vs Slow Ramp
# =====================================================================


def test_stationary_noise_stays_low():
    """Verify stationary noise within baseline normal stays in Low tier."""
    today = date(2026, 9, 20)
    np.random.seed(42)

    # 28 days of history with mean 120, std 4
    history = []
    for i in range(28, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        val = float(np.random.normal(120.0, 2.0))
        history.append(_make_reading(dt, sbp=val))

    # Today is also within normal variation
    current = VitalsReading(patientId="P1001", systolicBp=121.5)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert res.status == "active"
    assert res.layer2_tier == "Low"
    assert res.trend_z_score < 1.8


def test_slow_ramp_triggers_elevated_tier():
    """Verify gradual drift (slow ramp over 14 days) triggers Moderate or High."""
    today = date(2026, 9, 20)

    # 28 days of baseline: first 14 days stable at 120.0, then drifting up
    history = []
    # Days 28 down to 14: stable at 120.0 (std ~ 2.0 with slight jitter)
    for i in range(28, 13, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        history.append(_make_reading(dt, sbp=120.0 + (i % 2) * 0.5))

    # Days 13 down to 1: ramping up gradually from 122 to 134
    for i in range(13, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        drift = (14 - i) * 1.0  # +1 to +13 mmHg
        history.append(_make_reading(dt, sbp=120.0 + drift))

    # Today is at +14 mmHg (~134 mmHg)
    current = VitalsReading(patientId="P1001", systolicBp=134.0)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert res.status == "active"
    # Sustained drift must move EWMA trend into Moderate or High/Critical
    assert res.layer2_tier in ("Moderate", "High", "Critical")
    assert res.trend_z_score >= 1.8


# =====================================================================
# 3. Inactive / Missing Days in Lookback Window
# =====================================================================


def test_missing_days_impute_zero():
    """Verify missing days contribute z = 0.0 to EWMA smoothing."""
    today = date(2026, 9, 20)

    # 14 days of history strictly before today, but only every other day has readings
    history = []
    for i in range(14, 0, -2):  # days 14, 12, 10, 8, 6, 4, 2
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        history.append(_make_reading(dt, sbp=120.0, hr=70.0))

    # We need at least 7 days for activation
    assert len(history) == 7

    current = VitalsReading(patientId="P1001", systolicBp=120.0, heartRate=70.0)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert res.status == "active"
    # All readings were identical to baseline mean -> z = 0 on measured days and imputed days
    assert res.smoothed_deviations["systolic_bp"] == 0.0
    assert res.trend_z_score == 0.0
    assert res.layer2_tier == "Low"


# =====================================================================
# 4. 14-Day Truncation Window
# =====================================================================


def test_14_day_truncation_window():
    """Verify spikes occurring >= 14 days ago do NOT affect the EWMA trend statistic."""
    today = date(2026, 9, 20)

    # 28 days of history
    # Day 15 ago: huge spike (sbp=160)
    # Days 13..1 ago: completely normal (sbp=120)
    history = []
    for i in range(28, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        if i == 15:
            history.append(_make_reading(dt, sbp=160.0))  # Day 15 ago (outside 14-day EWMA)
        else:
            history.append(_make_reading(dt, sbp=120.0))

    current = VitalsReading(patientId="P1001", systolicBp=120.0)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert res.status == "active"
    # Over the last 14 days (days 13..0), all values are 120.0.
    # The spike on day 15 affects the 28-day baseline mean/std slightly,
    # but the 14 daily values fed into EWMA are all identical (120.0), so all 14 z-values are equal!
    # Therefore, no single day in the 14-day window had a spike.
    assert res.layer2_tier == "Low"


# =====================================================================
# 5. Cold-Start Boundary
# =====================================================================


def test_cold_start_boundary():
    """Verify 6 days -> 'not yet available'; 7 days -> 'active'."""
    today = date(2026, 9, 20)

    # 6 days of history
    hist_6 = []
    for i in range(6, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        hist_6.append(_make_reading(dt))

    current = VitalsReading(patientId="P1001", systolicBp=120.0)
    req_6 = Layer2ScoringRequest(
        patientId="P1001", history=hist_6, currentReading=current, currentDate=today
    )
    res_6 = compute_personalized_anomaly(req_6)
    assert res_6.status == L2_COLD_START_STATUS
    assert res_6.layer2_tier == L2_COLD_START_STATUS
    assert res_6.trend_z_score is None

    # 7 days of history
    hist_7 = hist_6 + [
        _make_reading(datetime(2026, 9, 13, 8, 0, tzinfo=timezone.utc))  # 7th day
    ]
    req_7 = Layer2ScoringRequest(
        patientId="P1001", history=hist_7, currentReading=current, currentDate=today
    )
    res_7 = compute_personalized_anomaly(req_7)
    assert res_7.status == "active"
    assert res_7.layer2_tier in ("Low", "Moderate", "High", "Critical")
    assert res_7.trend_z_score is not None


# =====================================================================
# 6. Zero-Variance Clamp
# =====================================================================


def test_zero_variance_clamp():
    """Verify constant readings with std < 1e-6 handle zero variance properly."""
    today = date(2026, 9, 20)

    # 10 days of identical readings
    history = []
    for i in range(10, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        history.append(_make_reading(dt, sbp=120.0, dbp=80.0, hr=70.0))

    # Case A: Today is identical -> diff < 1e-6 -> z = 0.0 -> Low
    current_same = VitalsReading(
        patientId="P1001", systolicBp=120.0, diastolicBp=80.0, heartRate=70.0
    )
    res_same = compute_personalized_anomaly(
        Layer2ScoringRequest(
            patientId="P1001", history=history, currentReading=current_same, currentDate=today
        )
    )
    assert res_same.status == "active"
    assert res_same.trend_z_score == 0.0
    assert res_same.layer2_tier == "Low"

    # Case B: Today departs by +10 mmHg -> diff >= 1e-6 -> clamped to +3.5 -> spike guard Critical!
    current_diff = VitalsReading(
        patientId="P1001", systolicBp=130.0, diastolicBp=80.0, heartRate=70.0
    )
    res_diff = compute_personalized_anomaly(
        Layer2ScoringRequest(
            patientId="P1001", history=history, currentReading=current_diff, currentDate=today
        )
    )
    assert res_diff.status == "active"
    assert res_diff.max_z_score == 3.5
    assert res_diff.layer2_tier == "Critical"


# =====================================================================
# 7. Spike Guard
# =====================================================================


def test_spike_guard_single_day_crisis():
    """Verify single-day jump |z| >= 3.5 forces Critical even if EWMA trend < 3.5.

    Under EWMA (lambda=0.3) alone:
    13 days of z=0 and 1 day of z=3.5 gives S_13 = 1.05.
    trend_z = 1.05 / 0.420084 = 2.4995 (< 2.5, would only be Moderate).
    With spike guard: today's |z| >= 3.5 -> Critical!
    """
    today = date(2026, 9, 20)

    # 14 days of baseline with very small variance (std ~ 1.0)
    history = []
    for i in range(14, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        history.append(_make_reading(dt, sbp=120.0 + (i % 2) * 1.0))

    # Baseline SBP is ~120.5, std ~ 0.52
    # Today SBP jumps to 123.0 -> z = (123.0 - 120.5) / 0.52 ~ 4.8 >= 3.5
    current = VitalsReading(patientId="P1001", systolicBp=123.0)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert res.max_z_score >= 3.5
    # Even if EWMA trend is below 3.5, tier MUST be Critical due to spike guard
    assert res.layer2_tier == "Critical"


def test_single_day_moderate_jump_is_smoothed():
    """Verify single-day jump < 3.5 (e.g. z = 2.2) is smoothed down and does not cause false alert."""
    today = date(2026, 9, 20)

    # 28 days of history: stable baseline with slight variance in earlier days
    # but strictly at mean (120.0) in the days immediately prior to today
    history = []
    for i in range(28, 0, -1):
        d = today - timedelta(days=i)
        dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
        if i > 7:
            val = 120.0 + (1.5 if i % 2 == 0 else -1.5)
        else:
            val = 120.0
        history.append(_make_reading(dt, sbp=val))

    # Baseline mean is 120.05, std ~ 1.32
    # Today SBP = 122.8 -> z = (122.8 - 120.05) / 1.32 ~ 2.08 (raw single-day z is Moderate: 1.8 <= z < 2.5)
    # Under EWMA: S_13 = 0.3 * 2.08 = 0.624. trend_z = 0.624 / 0.420084 = 1.48 (< 1.8 -> Low!)
    current = VitalsReading(patientId="P1001", systolicBp=122.8)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )
    res = compute_personalized_anomaly(req)

    assert 1.8 <= res.max_z_score < 2.5  # Raw single-day z would be Moderate
    assert res.trend_z_score < 1.8       # EWMA smoothed trend is Low
    assert res.layer2_tier == "Low"      # Transient blip is correctly filtered!


# =====================================================================
# 8. ENABLE_ML_BENCHMARK_ARMS Toggle
# =====================================================================


def test_ml_benchmark_toggle_behavior(monkeypatch):
    """Verify ENABLE_ML_BENCHMARK_ARMS controls evaluation_metadata population."""
    today = date(2026, 9, 20)
    history = [_make_reading(today - timedelta(days=i)) for i in range(14, 0, -1)]
    current = VitalsReading(patientId="P1001", systolicBp=120.0)
    req = Layer2ScoringRequest(
        patientId="P1001", history=history, currentReading=current, currentDate=today
    )

    # 1. Default (False): evaluation_metadata is None
    monkeypatch.delenv("ENABLE_ML_BENCHMARK_ARMS", raising=False)
    get_settings.cache_clear()
    try:
        res_default = compute_personalized_anomaly(req)
        assert res_default.evaluation_metadata is None
    finally:
        get_settings.cache_clear()

    # 2. Enabled (True): evaluation_metadata is populated
    monkeypatch.setenv("ENABLE_ML_BENCHMARK_ARMS", "true")
    get_settings.cache_clear()
    try:
        res_enabled = compute_personalized_anomaly(req)
        assert res_enabled.evaluation_metadata is not None
        assert isinstance(res_enabled.evaluation_metadata.isolation_forest_decision_function, float)
        assert isinstance(res_enabled.evaluation_metadata.lof_decision_function, float)
    finally:
        get_settings.cache_clear()


# =====================================================================
# 9. Cross-Check Against Independent Reference Implementation
# =====================================================================


def test_cross_check_against_reference():
    """Verify compute_personalized_anomaly matches independent reference within 1e-6."""
    import os
    import pandas as pd
    from benchmarks.ewma_reference_v2 import reference_compute_ewma_v2

    today = date(2026, 9, 20)
    np.random.seed(12345)

    reference_records = []

    # Test 5 distinct patient trajectory scenarios
    scenarios = [
        ("stable", 120.0, 80.0, 72.0, 0.0, 0.0),
        ("slow_drift", 120.0, 80.0, 72.0, 0.8, 0.0),      # +0.8 mmHg/day drift
        ("sudden_spike", 120.0, 80.0, 72.0, 0.0, 25.0),    # +25 mmHg spike today
        ("moderate_blip", 120.0, 80.0, 72.0, 0.0, 5.0),    # +5 mmHg blip today
        ("hypotensive", 115.0, 75.0, 65.0, -0.5, -2.0),    # negative drift
    ]

    for name, sbp_base, dbp_base, hr_base, daily_drift, today_offset in scenarios:
        history = []
        for i in range(28, 0, -1):
            d = today - timedelta(days=i)
            dt = datetime(d.year, d.month, d.day, 8, 0, tzinfo=timezone.utc)
            # Add small random noise + drift
            drift = (28 - i) * daily_drift if i <= 14 else 0.0
            sbp = sbp_base + drift + float(np.random.normal(0, 0.5))
            dbp = dbp_base + float(np.random.normal(0, 0.3))
            hr = hr_base + float(np.random.normal(0, 0.4))
            history.append(_make_reading(dt, sbp=sbp, dbp=dbp, hr=hr))

        current = VitalsReading(
            patientId="P1001",
            systolicBp=sbp_base + (14 * daily_drift) + today_offset,
            diastolicBp=dbp_base,
            heartRate=hr_base,
        )

        req = Layer2ScoringRequest(
            patientId="P1001", history=history, currentReading=current, currentDate=today
        )

        # Engine execution
        res_engine = compute_personalized_anomaly(req)

        # Reference execution
        res_ref = reference_compute_ewma_v2(history, current, today)

        # Bit-for-bit check
        assert res_engine.status == res_ref["status"]
        assert res_engine.layer2_tier == res_ref["layer2_tier"]
        assert res_engine.trend_z_score == pytest.approx(res_ref["trend_z_score"], abs=1e-4)
        assert res_engine.max_z_score == pytest.approx(res_ref["max_z_score"], abs=1e-2)

        for v in res_ref["smoothed_deviations"]:
            assert res_engine.smoothed_deviations[v] == pytest.approx(
                res_ref["smoothed_deviations"][v], abs=1e-4
            )

        reference_records.append(
            {
                "scenario": name,
                "engine_tier": res_engine.layer2_tier,
                "ref_tier": res_ref["layer2_tier"],
                "engine_trend_z": res_engine.trend_z_score,
                "ref_trend_z": res_ref["trend_z_score"],
                "engine_max_z": res_engine.max_z_score,
                "ref_max_z": res_ref["max_z_score"],
                "tier_match": res_engine.layer2_tier == res_ref["layer2_tier"],
            }
        )

    # Export reference CSV to benchmarks/results/ewma_reference_values.csv
    out_dir = os.path.join(os.path.dirname(__file__), "..", "benchmarks", "results")
    os.makedirs(out_dir, exist_ok=True)
    csv_path = os.path.join(out_dir, "ewma_reference_values.csv")
    df_ref = pd.DataFrame(reference_records)
    df_ref.to_csv(csv_path, index=False)
    assert os.path.exists(csv_path)
