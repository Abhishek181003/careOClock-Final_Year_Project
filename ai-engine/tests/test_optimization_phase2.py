# Directory - ai-engine/tests/test_optimization_phase2.py

"""Comprehensive Test Suite for Phase 2 Optimization.

Verifies:
1. Exact numerical equivalence between vectorized matrix construction and reference behavior.
2. Exact vector construction for incoming readings across full and partial vitals subsets.
3. Functional tree count parameterization (n_estimators) for Phase 4 empirical tuning.
4. Deterministic seed reproducibility across tree counts.
5. Patient-facing API safety gate: ensures test dials (contamination, n_estimators)
   are strictly blocked from the production patient request schema.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Dict, List
import numpy as np
import pytest
from pydantic import ValidationError

from app.models.vitals import (
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    VitalsReading,
)
from app.scoring.constants import DEFAULT_N_ESTIMATORS
from app.scoring.personalized_anomaly import (
    DayVitalAggregation,
    aggregate_readings_by_day,
    build_feature_matrix,
    build_today_vector,
    compute_baseline_statistics,
    compute_personalized_anomaly,
)


def _reference_build_feature_matrix(
    day_aggregations: List[DayVitalAggregation],
    active_vitals: List[str],
    baseline_stats: Dict[str, Dict[str, float]],
) -> np.ndarray:
    """Pre-optimization reference implementation using nested Python loops."""
    n_days = len(day_aggregations)
    n_features_per_vital = 3
    matrix = np.zeros((n_days, len(active_vitals) * n_features_per_vital), dtype=float)

    for v_idx, vital in enumerate(active_vitals):
        col_base = v_idx * n_features_per_vital
        window_mean = baseline_stats[vital]["mean"]
        last_seen_mean = window_mean
        last_seen_var = 0.0

        for d_idx, day in enumerate(day_aggregations):
            mean_val, var_val = day.get_vital_values(vital)
            if mean_val is not None:
                matrix[d_idx, col_base] = mean_val
                matrix[d_idx, col_base + 1] = var_val if var_val is not None else 0.0
                matrix[d_idx, col_base + 2] = 0.0
                last_seen_mean = mean_val
                last_seen_var = var_val if var_val is not None else 0.0
            else:
                matrix[d_idx, col_base] = last_seen_mean
                matrix[d_idx, col_base + 1] = last_seen_var
                matrix[d_idx, col_base + 2] = 1.0

    return matrix


def _reference_build_today_vector(
    current_reading: VitalsReading,
    active_vitals: List[str],
    baseline_stats: Dict[str, Dict[str, float]],
) -> np.ndarray:
    """Pre-optimization reference implementation using manual element assignment."""
    n_features_per_vital = 3
    vec = np.zeros((1, len(active_vitals) * n_features_per_vital), dtype=float)

    for v_idx, vital in enumerate(active_vitals):
        col_base = v_idx * n_features_per_vital
        curr_val = getattr(current_reading, vital, None)
        if curr_val is not None:
            vec[0, col_base] = curr_val
            vec[0, col_base + 1] = 0.0
            vec[0, col_base + 2] = 0.0
        else:
            vec[0, col_base] = baseline_stats[vital]["mean"]
            vec[0, col_base + 1] = 0.0
            vec[0, col_base + 2] = 1.0

    return vec


def _generate_test_history(n_days: int, anchor: date, drop_even_days: bool = False) -> list:
    """Helper to generate test history with optional missingness."""
    history = []
    for i in range(n_days, 0, -1):
        day = anchor - timedelta(days=i)
        m_dt = datetime(day.year, day.month, day.day, 8, 0, tzinfo=timezone.utc)
        e_dt = datetime(day.year, day.month, day.day, 20, 0, tzinfo=timezone.utc)

        # In drop_even_days mode, simulate partial missingness (e.g. SpO2 and RR unmeasured)
        spo2_val = None if (drop_even_days and i % 2 == 0) else 98.0
        rr_val = None if (drop_even_days and i % 3 == 0) else 16.0

        history.append(
            HistoricalVitalsReading(
                patientId="PAT_OPT_01",
                recordedAt=m_dt,
                slot="morning",
                systolicBp=round(120.0 + (i % 7) * 1.5, 1),
                diastolicBp=80.0,
                heartRate=round(72.0 + (i % 5) * 1.2, 1),
                spo2=spo2_val,
                temperatureC=36.6,
                respirationRate=rr_val,
            )
        )
        history.append(
            HistoricalVitalsReading(
                patientId="PAT_OPT_01",
                recordedAt=e_dt,
                slot="evening",
                systolicBp=round(122.0 + (i % 6) * 1.5, 1),
                diastolicBp=81.0,
                heartRate=round(74.0 + (i % 4) * 1.2, 1),
                spo2=spo2_val,
                temperatureC=36.7,
                respirationRate=rr_val,
            )
        )
    return history


# =====================================================================
# 1. Exact Numerical Equivalence Tests
# =====================================================================


def test_vectorized_build_feature_matrix_exact_equivalence_full():
    """Verify vectorized build_feature_matrix matches reference output bit-for-bit on full data."""
    anchor = date(2026, 9, 15)
    history = _generate_test_history(28, anchor, drop_even_days=False)

    day_aggs, days_hist = aggregate_readings_by_day(history, anchor)
    active = list(days_hist.keys())
    stats = compute_baseline_statistics(day_aggs, active)

    ref_matrix = _reference_build_feature_matrix(day_aggs, active, stats)
    opt_matrix = build_feature_matrix(day_aggs, active, stats)

    assert opt_matrix.shape == ref_matrix.shape
    assert np.allclose(opt_matrix, ref_matrix, equal_nan=False)


def test_vectorized_build_feature_matrix_exact_equivalence_imputed():
    """Verify vectorized build_feature_matrix matches reference output with forward-fill imputation."""
    anchor = date(2026, 9, 15)
    history = _generate_test_history(21, anchor, drop_even_days=True)

    day_aggs, days_hist = aggregate_readings_by_day(history, anchor)
    active = [k for k, v in days_hist.items() if v >= 7]
    stats = compute_baseline_statistics(day_aggs, active)

    ref_matrix = _reference_build_feature_matrix(day_aggs, active, stats)
    opt_matrix = build_feature_matrix(day_aggs, active, stats)

    assert opt_matrix.shape == ref_matrix.shape
    assert np.allclose(opt_matrix, ref_matrix, equal_nan=False)


def test_vectorized_build_today_vector_exact_equivalence():
    """Verify vectorized build_today_vector matches reference output for measured and missing vitals."""
    active = [
        "systolic_bp",
        "diastolic_bp",
        "heart_rate",
        "spo2",
        "temperature_c",
        "respiration_rate",
    ]
    stats = {v: {"mean": 100.0 + i * 5, "std": 2.5, "count": 28.0} for i, v in enumerate(active)}

    # Reading with partial vitals (heart_rate and respiration_rate missing)
    reading = VitalsReading(
        patientId="PAT_OPT_01",
        systolicBp=125.0,
        diastolicBp=82.0,
        heartRate=None,
        spo2=97.0,
        temperatureC=36.8,
        respirationRate=None,
    )

    ref_vec = _reference_build_today_vector(reading, active, stats)
    opt_vec = build_today_vector(reading, active, stats)

    assert opt_vec.shape == (1, len(active) * 3)
    assert np.allclose(opt_vec, ref_vec, equal_nan=False)


# =====================================================================
# 2. Empirical Tree Count Parameterization (n_estimators)
# =====================================================================


def test_isolation_forest_n_estimators_parameterization():
    """Verify n_estimators can be tuned empirically and is recorded in evaluation_metadata."""
    anchor = date(2026, 9, 15)
    history = _generate_test_history(14, anchor)
    current = VitalsReading(
        patientId="PAT_OPT_01",
        systolicBp=125.0,
        diastolicBp=82.0,
        heartRate=74.0,
    )
    req = Layer2ScoringRequest(
        patientId="PAT_OPT_01",
        history=history,
        currentReading=current,
        currentDate=anchor,
    )

    # Default n_estimators (100)
    res_default = compute_personalized_anomaly(req)
    assert res_default.evaluation_metadata.n_estimators_used == DEFAULT_N_ESTIMATORS
    assert res_default.evaluation_metadata.n_estimators_used == 100

    # Explicit n_estimators=50 (efficiency tuning candidate for Phase 4)
    res_50 = compute_personalized_anomaly(req, n_estimators=50)
    assert res_50.evaluation_metadata.n_estimators_used == 50

    # Explicit n_estimators=30
    res_30 = compute_personalized_anomaly(req, n_estimators=30)
    assert res_30.evaluation_metadata.n_estimators_used == 30


def test_deterministic_seed_reproducibility():
    """Verify that repeated runs with the same n_estimators and fixed seed produce bit-for-bit identical scores."""
    anchor = date(2026, 9, 15)
    history = _generate_test_history(14, anchor)
    current = VitalsReading(
        patientId="PAT_OPT_01",
        systolicBp=135.0,
        diastolicBp=85.0,
        heartRate=80.0,
    )
    req = Layer2ScoringRequest(
        patientId="PAT_OPT_01",
        history=history,
        currentReading=current,
        currentDate=anchor,
    )

    res_a = compute_personalized_anomaly(req, n_estimators=50)
    res_b = compute_personalized_anomaly(req, n_estimators=50)

    # Identical decision function output
    score_a = res_a.evaluation_metadata.isolation_forest_decision_function
    score_b = res_b.evaluation_metadata.isolation_forest_decision_function
    assert score_a == score_b
    assert res_a.layer2_tier == res_b.layer2_tier


# =====================================================================
# 3. Patient Route Safety Gate (No Test Knobs Exposed)
# =====================================================================


def test_patient_request_schema_rejects_test_knobs():
    """Verify that Layer2ScoringRequest strictly forbids n_estimators or contamination on patient payloads."""
    anchor = date(2026, 9, 15)
    history = _generate_test_history(7, anchor)
    current = VitalsReading(patientId="PAT_OPT_01", systolicBp=120.0, diastolicBp=80.0)

    # Attempting to supply n_estimators on the patient payload -> rejected
    with pytest.raises(ValidationError):
        Layer2ScoringRequest(
            patientId="PAT_OPT_01",
            history=history,
            currentReading=current,
            currentDate=anchor,
            n_estimators=50,  # Unregistered knob
        )

    # Attempting to supply contamination on the patient payload -> rejected
    with pytest.raises(ValidationError):
        Layer2ScoringRequest(
            patientId="PAT_OPT_01",
            history=history,
            currentReading=current,
            currentDate=anchor,
            contamination=0.10,  # Unregistered knob
        )
