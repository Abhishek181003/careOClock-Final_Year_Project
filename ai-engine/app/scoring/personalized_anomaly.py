# Directory - ai-engine/app/scoring/personalized_anomaly.py

"""CareOClock AI Engine — Layer 2: Personalized Anomaly Detection (FR4).

Evaluates patient physiological readings against personal historical baselines:
1. Authoritative Clinical Arm (Statistical Baseline):
   - layer2_tier is derived deterministically from the maximum standardized |z|-score
     deviation across active vitals, ensuring clinical interpretability and exact
     adherence to physician-approved escalation thresholds (Finding 1).
2. Machine Learning Benchmark Arms (Phase 12 Sensitivity & Comparison):
   - scikit-learn IsolationForest and LocalOutlierFactor are fit statelessly per-request
     on the patient's scaled rolling feature matrix.
   - Raw decision_function scores, outlier predictions, and contamination rates are
     isolated exclusively in evaluation_metadata for model sensitivity sweeps and benchmarking.

Architectural & Security Safeguards:
- Strict Patient Privacy: Zero cross-patient comparison or global baseline aggregation.
- Cold-Start Guardrails: Minimum 7 distinct calendar days required per feature;
  returns "not yet available" without guessing or estimating scores (< 7 days).
- H-11: Stateless on-demand refit eliminating stale-model and serialization bugs.
- H-12 & A-17: Per-patient StandardScaler (required for LOF distance-based metric;
  invariant for tree-based IsolationForest).
- H-13 & A-14: Window leak boundary enforcement (history strictly precedes today in UTC).
- A-4: Single-day gap imputation (forward-fill / rolling mean) + explicit missingness flag.
- A-5: Per-feature history tracking supporting mid-monitoring device upgrades.
- A-6 & Finding 1: Authority separation — layer2_tier driven from statistical baseline max |z|;
  raw ML model metrics isolated in evaluation_metadata.
- A-8: Log-redaction hygiene — raw health readings are never logged with patient_id.
- A-10: Feature matrix columns comprise [day_mean, day_variability, missing_flag] per vital.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler

from app.models.vitals import (
    EvaluationMetadata,
    FeatureDeviation,
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    PersonalizedAnomalyResult,
    VitalsReading,
)
from app.scoring.constants import (
    CLINICAL_DISCLAIMER,
    CONTAMINATION,
    DEFAULT_N_ESTIMATORS,
    L2_COLD_START_STATUS,
    L2_TIER_THRESHOLDS,
    MATURE_WINDOW_DAYS,
    MIN_DAYS_TO_ACTIVATE,
    RANDOM_SEED,
    TRACKED_VITALS,
)

# A-8: Dedicated redacted logger for clinical tracing
logger = logging.getLogger("careoclock.layer2")


@dataclass
class DayVitalAggregation:
    """Aggregated physiological readings for a single calendar day."""

    date: date
    morning_reading: Optional[HistoricalVitalsReading] = None
    evening_reading: Optional[HistoricalVitalsReading] = None
    readings: Optional[List[HistoricalVitalsReading]] = None

    def get_vital_values(self, vital_key: str) -> Tuple[Optional[float], Optional[float]]:
        """Extract (mean_value, within_day_range) for this vital sign on this day."""
        m_val = getattr(self.morning_reading, vital_key, None) if self.morning_reading else None
        e_val = getattr(self.evening_reading, vital_key, None) if self.evening_reading else None

        if m_val is not None and e_val is not None:
            mean_val = (m_val + e_val) / 2.0
            range_val = abs(e_val - m_val)
            return mean_val, range_val

        if m_val is not None:
            return m_val, 0.0

        if e_val is not None:
            return e_val, 0.0

        # Fallback to any unslotted readings on that calendar day
        if self.readings:
            all_vals = [getattr(r, vital_key) for r in self.readings if getattr(r, vital_key, None) is not None]
            if all_vals:
                if len(all_vals) > 1:
                    return float(np.mean(all_vals)), float(np.ptp(all_vals))
                return float(all_vals[0]), 0.0

        return None, None


def normalize_to_utc_date(dt_or_date: Any) -> date:
    """Normalize timestamp or date representation to a canonical UTC calendar date (A-14)."""
    if isinstance(dt_or_date, datetime):
        if dt_or_date.tzinfo is None:
            return dt_or_date.replace(tzinfo=timezone.utc).date()
        return dt_or_date.astimezone(timezone.utc).date()
    if isinstance(dt_or_date, date):
        return dt_or_date
    if isinstance(dt_or_date, str):
        # ISO format parsing
        try:
            parsed = datetime.fromisoformat(dt_or_date.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc).date()
            return parsed.astimezone(timezone.utc).date()
        except Exception:
            return date.fromisoformat(dt_or_date)
    raise ValueError(f"Unsupported date/datetime format: {dt_or_date}")


def aggregate_readings_by_day(
    history: List[HistoricalVitalsReading],
    today_date: date,
) -> Tuple[List[DayVitalAggregation], Dict[str, int]]:
    """Group, deduplicate, and aggregate historical vitals readings by UTC calendar day.

    Guarantees:
    - H-13 & A-14: Readings dated >= today_date are strictly excluded from the training window.
    - Window ceiling: Retains strictly the last MATURE_WINDOW_DAYS (28 days).
    - A-12: Defensive deduplication keeping the latest-received reading per (date, slot).
    - A-5: Computes independent history days per vital sign.
    """
    earliest_date = today_date - timedelta(days=MATURE_WINDOW_DAYS)

    # 1. Deduplicate by (date, slot) and filter by window
    # Key: (date, slot) -> HistoricalVitalsReading
    deduped_slot_readings: Dict[Tuple[date, str], HistoricalVitalsReading] = {}
    # Key: date -> list of unslotted readings
    unslotted_readings: Dict[date, List[HistoricalVitalsReading]] = defaultdict(list)

    for reading in history:
        # Determine UTC date for this reading
        if reading.recorded_at:
            reading_date = normalize_to_utc_date(reading.recorded_at)
        else:
            # Fallback if only date was provided in caller payload
            reading_date = today_date - timedelta(days=1)

        # H-13 Assertion & Filter: Scored day must NEVER be in the fitted window
        if reading_date >= today_date:
            continue

        # Cap to rolling window ceiling (28 days)
        if reading_date < earliest_date:
            continue

        slot = reading.slot
        if slot in ("morning", "evening"):
            # A-12: Keep latest received reading for that (date, slot)
            deduped_slot_readings[(reading_date, slot)] = reading
        else:
            unslotted_readings[reading_date].append(reading)

    # 2. Assemble sorted list of distinct calendar days
    all_dates = sorted(
        set(d for (d, _) in deduped_slot_readings.keys()).union(unslotted_readings.keys())
    )

    day_aggregations: List[DayVitalAggregation] = []
    days_of_history: Dict[str, int] = defaultdict(int)

    for d in all_dates:
        m_reading = deduped_slot_readings.get((d, "morning"))
        e_reading = deduped_slot_readings.get((d, "evening"))
        other_readings = unslotted_readings.get(d, [])

        day_agg = DayVitalAggregation(
            date=d,
            morning_reading=m_reading,
            evening_reading=e_reading,
            readings=other_readings,
        )
        day_aggregations.append(day_agg)

        # Count active days per vital sign (A-5)
        for v in TRACKED_VITALS:
            mean_val, _ = day_agg.get_vital_values(v)
            if mean_val is not None:
                days_of_history[v] += 1

    return day_aggregations, dict(days_of_history)


def compute_baseline_statistics(
    day_aggregations: List[DayVitalAggregation],
    active_vitals: List[str],
) -> Dict[str, Dict[str, float]]:
    """Compute rolling baseline mean, sample standard deviation, and sample count per active vital.

    Only uses valid, non-imputed readings across the historical window.
    """
    baseline: Dict[str, Dict[str, float]] = {}

    for v in active_vitals:
        vals = []
        for day in day_aggregations:
            mean_val, _ = day.get_vital_values(v)
            if mean_val is not None:
                vals.append(mean_val)

        count = len(vals)
        if count == 0:
            continue

        arr = np.array(vals, dtype=float)
        mean_val = float(np.mean(arr))
        # Use ddof=1 (sample standard deviation) when count > 1
        std_val = float(np.std(arr, ddof=1)) if count > 1 else 0.0

        baseline[v] = {
            "mean": round(mean_val, 2),
            "std": round(std_val, 2),
            "count": float(count),
        }

    return baseline


def build_feature_matrix(
    day_aggregations: List[DayVitalAggregation],
    active_vitals: List[str],
    baseline_stats: Dict[str, Dict[str, float]],
) -> np.ndarray:
    """Construct N x (3 x D) training matrix with explicit mean, variability, and missingness columns (A-4, A-10).

    Optimized via NumPy array extraction, temporal forward-fill imputation, and column interleaving.
    Note: At N <= 28 and D <= 6, pure-Python loops took ~0.067 ms; vectorization ensures clean
    architectural scaling to higher-frequency monitoring without changing numerical results.

    Columns per active vital:
    1. <vital>_mean: Day mean value (forward-filled or window-mean imputed if missing)
    2. <vital>_variability: Within-day range (evening - morning) or 0.0
    3. <vital>_missing: 1.0 if imputed for this day, 0.0 if measured
    """
    n_days = len(day_aggregations)
    n_vitals = len(active_vitals)

    # 1. Extract raw measurements into (N, D) float buffers
    raw_means = np.full((n_days, n_vitals), np.nan, dtype=float)
    raw_vars = np.full((n_days, n_vitals), np.nan, dtype=float)

    for d_idx, day in enumerate(day_aggregations):
        for v_idx, vital in enumerate(active_vitals):
            m, v = day.get_vital_values(vital)
            if m is not None:
                raw_means[d_idx, v_idx] = m
                raw_vars[d_idx, v_idx] = v if v is not None else 0.0

    missing_mask = np.isnan(raw_means)
    imputed_means = raw_means.copy()
    imputed_vars = raw_vars.copy()

    # 2. Impute missing values via temporal forward-fill (or window mean if missing on day 0)
    for v_idx, vital in enumerate(active_vitals):
        mask = missing_mask[:, v_idx]
        if mask.any():
            win_mean = baseline_stats[vital]["mean"]
            last_m = win_mean
            last_v = 0.0
            for d in range(n_days):
                if mask[d]:
                    imputed_means[d, v_idx] = last_m
                    imputed_vars[d, v_idx] = last_v
                else:
                    last_m = imputed_means[d, v_idx]
                    last_v = imputed_vars[d, v_idx]

    # 3. Interleave [mean, variability, missing_flag] per vital into (N, 3 * D)
    features_3d = np.stack([imputed_means, imputed_vars, missing_mask.astype(float)], axis=2)
    return features_3d.reshape((n_days, n_vitals * 3))


def build_today_vector(
    current_reading: VitalsReading,
    active_vitals: List[str],
    baseline_stats: Dict[str, Dict[str, float]],
) -> np.ndarray:
    """Vectorize today's new incoming reading matching the exact feature matrix layout (A-10)."""
    n_vitals = len(active_vitals)
    raw_vals = [getattr(current_reading, v, None) for v in active_vitals]
    missing_mask = np.array([v is None for v in raw_vals], dtype=bool)

    means = np.array(
        [baseline_stats[v]["mean"] if raw_vals[i] is None else float(raw_vals[i]) for i, v in enumerate(active_vitals)],
        dtype=float,
    )
    vars_ = np.zeros(n_vitals, dtype=float)
    missing_flags = missing_mask.astype(float)

    return np.stack([means, vars_, missing_flags], axis=1).reshape((1, n_vitals * 3))


def classify_anomaly_tier(max_z: float) -> str:
    """Map maximum absolute z-score deviation to clinical risk tier (H-2, A-3, A-16).

    Statistical & clinical justification:
    - Low (< 1.8 SD): Within normal personal variation (~96th percentile)
    - Moderate (1.8 <= |z| < 2.5): Outside 2 SD (~98.8th percentile); worth watching
    - High (2.5 <= |z| < 3.5): Outside 3 SD (~99.9th percentile); clinically notable
    - Critical (>= 3.5 SD): Extreme departure from personal baseline (~99.95th percentile)
    """
    if max_z >= L2_TIER_THRESHOLDS["Critical"]:
        return "Critical"
    if max_z >= L2_TIER_THRESHOLDS["High"]:
        return "High"
    if max_z >= L2_TIER_THRESHOLDS["Moderate"]:
        return "Moderate"
    return "Low"


def compute_personalized_anomaly(
    request: Layer2ScoringRequest,
    contamination: Optional[float] = None,
    n_estimators: Optional[int] = None,
) -> PersonalizedAnomalyResult:
    """Execute Layer 2 Personalized Anomaly Detection for a single patient.

    Zero cross-patient comparison: Evaluates strictly within the patient's own historical data.
    Stateless refit on demand: Fits IsolationForest and LocalOutlierFactor in < 5ms.
    Authoritative tier is driven by the statistical baseline z-score distribution,
    while Isolation Forest and LOF results are benchmark arms recorded in evaluation_metadata.

    Parameters:
    - contamination: Optional override for sensitivity sweeps (internal/testing only).
    - n_estimators: Optional tree count override for efficiency/AUROC benchmarking (internal/testing only).
    """
    patient_id = request.patient_id

    # Resolve effective hyperparameters (Finding 4 & Phase 2 Optimization)
    effective_contamination = (
        contamination
        if contamination is not None
        else CONTAMINATION
    )
    effective_n_estimators = (
        n_estimators
        if n_estimators is not None
        else DEFAULT_N_ESTIMATORS
    )

    # Determine reference date for "today" (Finding 2)
    if request.current_date:
        today_date = request.current_date
    elif request.current_reading.recorded_at:
        today_date = normalize_to_utc_date(request.current_reading.recorded_at)
    else:
        today_date = datetime.now(timezone.utc).date()

    # 1. Aggregate and deduplicate history strictly prior to today_date (H-13, A-12, A-14)
    day_aggregations, days_of_history = aggregate_readings_by_day(request.history, today_date)

    # 2. Identify active features clearing the 7-day cold-start gate (A-5)
    active_features = [
        v for v in TRACKED_VITALS
        if days_of_history.get(v, 0) >= MIN_DAYS_TO_ACTIVATE
    ]

    total_calendar_days = len(day_aggregations)

    # 3. Cold Start Guardrail: If no features have at least 7 days of history
    if not active_features or total_calendar_days < MIN_DAYS_TO_ACTIVATE:
        max_days = max(days_of_history.values()) if days_of_history else total_calendar_days
        logger.info(
            "Cold start active for patient %s. History days: %d / %d required. Active features: 0",
            patient_id,
            max_days,
            MIN_DAYS_TO_ACTIVATE,
        )
        return PersonalizedAnomalyResult(
            patient_id=patient_id,
            status=L2_COLD_START_STATUS,
            message=(
                f"Personalized anomaly detection is not yet available. "
                f"Minimum {MIN_DAYS_TO_ACTIVATE} days of historical readings required "
                f"(current: {max_days} days). Building baseline."
            ),
            days_of_history=days_of_history,
            active_features=[],
            rolling_baseline=None,
            layer2_tier=L2_COLD_START_STATUS,
            max_z_score=None,
            feature_deviations=None,
            detailed_deviations=None,
            confidence=None,
            evaluation_metadata=None,
            disclaimer=CLINICAL_DISCLAIMER,
        )

    # 4. Compute personal rolling baseline statistics
    baseline_stats = compute_baseline_statistics(day_aggregations, active_features)

    # 5. Build N x (3 x D) training matrix (A-4, A-10)
    X_raw = build_feature_matrix(day_aggregations, active_features, baseline_stats)
    x_today_raw = build_today_vector(request.current_reading, active_features, baseline_stats)

    # 6. Apply per-patient StandardScaler (H-12, A-17)
    # StandardScaler is mandatory for LOF (distance-based, heterogeneous units: mmHg, bpm, °C)
    # and invariant for IsolationForest (tree-based splits).
    scaler = StandardScaler().fit(X_raw)
    X_scaled = scaler.transform(X_raw)
    x_today_scaled = scaler.transform(x_today_raw)

    # 7. Stateless model fitting: Isolation Forest & Local Outlier Factor (A-2, A-18, H-11, Finding 4)
    if_model = IsolationForest(
        random_state=RANDOM_SEED,
        contamination=effective_contamination,
        n_estimators=effective_n_estimators,
    ).fit(X_scaled)

    if_score = float(if_model.decision_function(x_today_scaled)[0])
    if_pred = int(if_model.predict(x_today_scaled)[0])
    if_is_anomaly = bool(if_pred == -1)

    # Mandatory LOF comparison baseline (A-2, A-18, Finding 4)
    n_samples = X_scaled.shape[0]
    n_neighbors = min(20, max(1, n_samples - 1))
    lof_model = LocalOutlierFactor(
        novelty=True,
        contamination=effective_contamination,
        n_neighbors=n_neighbors,
    ).fit(X_scaled)

    lof_score = float(lof_model.decision_function(x_today_scaled)[0])
    lof_pred = int(lof_model.predict(x_today_scaled)[0])
    lof_is_anomaly = bool(lof_pred == -1)

    # 8. Compute per-feature clinical z-scores & deviations (H-2, Spec §6.10)
    detailed_deviations: List[FeatureDeviation] = []
    feature_deviations: Dict[str, float] = {}

    for v in active_features:
        curr_val = getattr(request.current_reading, v, None)
        if curr_val is None:
            continue

        mean = baseline_stats[v]["mean"]
        std = baseline_stats[v]["std"]

        # Safe division handling near-zero standard deviation
        if std > 1e-4:
            z = (curr_val - mean) / std
        else:
            diff = curr_val - mean
            if abs(diff) < 1e-4:
                z = 0.0
            else:
                z = 3.5 if diff > 0 else -3.5

        z_rounded = round(float(z), 2)
        feature_deviations[v] = z_rounded

        if z_rounded >= 1.0:
            direction = "higher"
        elif z_rounded <= -1.0:
            direction = "lower"
        else:
            direction = "normal"

        detailed_deviations.append(
            FeatureDeviation(
                feature=v,
                current_value=round(float(curr_val), 2),
                baseline_mean=mean,
                baseline_std=std,
                z_score=z_rounded,
                direction=direction,
            )
        )

    # Sort detailed deviations by absolute z-score descending for doctor triage
    detailed_deviations.sort(key=lambda d: abs(d.z_score), reverse=True)

    # 9. Derive authoritative Layer 2 risk tier from max |z| (A-3, H-2, Finding 1)
    max_z = max((abs(d.z_score) for d in detailed_deviations), default=0.0)
    max_z_rounded = round(max_z, 2)
    layer2_tier = classify_anomaly_tier(max_z_rounded)

    # 10. Confidence scaling toward mature 28-day baseline
    confidence = min(round(total_calendar_days / MATURE_WINDOW_DAYS, 2), 1.0)

    # 11. Prepare non-UI evaluation metadata for Phase 12 benchmarks (A-6, Finding 4)
    eval_metadata = EvaluationMetadata(
        isolation_forest_decision_function=round(if_score, 4),
        isolation_forest_is_anomaly=if_is_anomaly,
        lof_decision_function=round(lof_score, 4),
        lof_is_anomaly=lof_is_anomaly,
        contamination_used=effective_contamination,
        n_estimators_used=effective_n_estimators,
    )

    # Safe log redaction (A-8)
    logger.info(
        "Layer 2 evaluated for patient %s. History days: %d. Active features: %s. Tier: %s. Max |z|: %.2f",
        patient_id,
        total_calendar_days,
        active_features,
        layer2_tier,
        max_z_rounded,
    )

    return PersonalizedAnomalyResult(
        patient_id=patient_id,
        status="active",
        message="Personalized anomaly detection active based on patient baseline history.",
        days_of_history=days_of_history,
        days_of_history_total=total_calendar_days,
        active_features=active_features,
        rolling_baseline=baseline_stats,
        layer2_tier=layer2_tier,
        max_z_score=max_z_rounded,
        feature_deviations=feature_deviations,
        detailed_deviations=detailed_deviations,
        confidence=confidence,
        evaluation_metadata=eval_metadata,
        disclaimer=CLINICAL_DISCLAIMER,
    )
