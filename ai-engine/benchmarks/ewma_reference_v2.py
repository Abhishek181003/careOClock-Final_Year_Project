# Directory - ai-engine/benchmarks/ewma_reference_v2.py

"""Independent reference implementation of Layer 2 v2 EWMA trend scoring.

Built strictly according to the design specification:
1. Baseline: mean, sample std (ddof=1) computed from <= 28 days strictly before today.
2. 14 daily values for dates [today - 13, ..., today]:
   - If date has reading: z = (x - mean) / std (with zero-variance clamp: if std < 1e-6 and |x - mean| < 1e-6 -> 0; if |x - mean| >= 1e-6 -> +-3.5)
   - If date has no reading: z = 0.0
3. EWMA: lambda = 0.3
   S_0 = z_0
   S_t = 0.3 * z_t + 0.7 * S_{t-1} for t = 1..13
4. Standardisation:
   sigma_ewma = sqrt(0.3 / 1.7) = 0.4200840252...
   trend_z = S_13 / sigma_ewma
5. Vital-level trend: round(trend_z, 4)
6. max_trend_z = max(|trend_z|) over active vitals
7. Tier rule:
   - Spike guard: if today's own max |z_today| >= 3.5 -> Critical
   - Else from max_trend_z:
     >= 3.5 -> Critical
     >= 2.5 -> High
     >= 1.8 -> Moderate
     else -> Low
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import numpy as np


TRACKED_VITALS = [
    "systolic_bp",
    "diastolic_bp",
    "heart_rate",
    "spo2",
    "temperature_c",
    "respiration_rate",
]


def reference_compute_ewma_v2(
    history_readings: List[Any],
    current_reading: Any,
    today_date: date,
) -> Dict[str, Any]:
    """Compute Layer 2 v2 EWMA trend from raw readings strictly following spec."""
    # 1. Aggregate historical readings by UTC date strictly before today_date
    earliest_date = today_date - timedelta(days=28)
    daily_values: Dict[Tuple[date, str], List[float]] = defaultdict(list)
    days_present: Dict[str, set] = defaultdict(set)

    for r in history_readings:
        dt = getattr(r, "recorded_at", None) or getattr(r, "recordedAt", None)
        if isinstance(dt, datetime):
            r_date = dt.astimezone(timezone.utc).date() if dt.tzinfo else dt.date()
        elif isinstance(dt, date):
            r_date = dt
        else:
            continue

        if r_date >= today_date or r_date < earliest_date:
            continue

        for v in TRACKED_VITALS:
            val = getattr(r, v, None)
            if val is None:
                # check camelCase
                camel_map = {
                    "systolic_bp": "systolicBp",
                    "diastolic_bp": "diastolicBp",
                    "heart_rate": "heartRate",
                    "spo2": "spo2",
                    "temperature_c": "temperatureC",
                    "respiration_rate": "respirationRate",
                }
                val = getattr(r, camel_map.get(v, ""), None)

            if val is not None:
                daily_values[(r_date, v)].append(float(val))
                days_present[v].add(r_date)

    # Active vitals have >= 7 distinct calendar days
    active_vitals = [v for v in TRACKED_VITALS if len(days_present[v]) >= 7]
    if not active_vitals:
        return {
            "status": "not yet available",
            "layer2_tier": "not yet available",
            "trend_z_score": None,
            "max_z_score": None,
            "smoothed_deviations": {},
        }

    # 2. Compute baseline mean and std (unrounded)
    baseline_stats: Dict[str, Dict[str, float]] = {}
    for v in active_vitals:
        day_means = [
            float(np.mean(daily_values[(d, v)]))
            for d in sorted(days_present[v])
            if (d, v) in daily_values
        ]
        mean_val = float(np.mean(day_means))
        std_val = float(np.std(day_means, ddof=1)) if len(day_means) > 1 else 0.0
        baseline_stats[v] = {"mean": mean_val, "std": std_val}

    # 3. 14 Daily values [today_date - 13, ..., today_date]
    lookback_dates = [today_date - timedelta(days=i) for i in range(13, -1, -1)]
    lam = 0.3
    sigma_ewma = np.sqrt(lam / (2.0 - lam))

    smoothed_deviations: Dict[str, float] = {}
    today_z_scores: Dict[str, float] = {}

    for v in active_vitals:
        mu = baseline_stats[v]["mean"]
        sigma = baseline_stats[v]["std"]

        z_seq = []
        for d in lookback_dates:
            if d == today_date:
                val = getattr(current_reading, v, None)
                if val is None:
                    camel_map = {
                        "systolic_bp": "systolicBp",
                        "diastolic_bp": "diastolicBp",
                        "heart_rate": "heartRate",
                        "spo2": "spo2",
                        "temperature_c": "temperatureC",
                        "respiration_rate": "respirationRate",
                    }
                    val = getattr(current_reading, camel_map.get(v, ""), None)
            else:
                vals = daily_values.get((d, v), [])
                val = float(np.mean(vals)) if vals else None

            if val is None:
                z = 0.0
            else:
                x = float(val)
                if sigma >= 1e-6:
                    z = (x - mu) / sigma
                else:
                    diff = x - mu
                    if abs(diff) < 1e-6:
                        z = 0.0
                    else:
                        z = 3.5 if diff > 0 else -3.5

            if d == today_date and val is not None:
                today_z_scores[v] = round(float(z), 2)

            z_seq.append(z)

        # EWMA
        s = z_seq[0]
        for t in range(1, 14):
            s = lam * z_seq[t] + (1.0 - lam) * s

        trend_z = s / sigma_ewma if sigma_ewma > 0 else 0.0
        smoothed_deviations[v] = round(float(trend_z), 4)

    # Patient level trend_z
    max_trend_z = max((abs(v) for v in smoothed_deviations.values()), default=0.0)
    max_trend_z = round(float(max_trend_z), 4)

    # Today's max |z|
    max_z_today = max((abs(z) for z in today_z_scores.values()), default=0.0)
    max_z_today_rounded = round(float(max_z_today), 2)

    # Tier derivation
    if max_trend_z >= 3.5:
        tier = "Critical"
    elif max_trend_z >= 2.5:
        tier = "High"
    elif max_trend_z >= 1.8:
        tier = "Moderate"
    else:
        tier = "Low"

    # Spike guard
    if max_z_today_rounded >= 3.5:
        tier = "Critical"

    return {
        "status": "active",
        "layer2_tier": tier,
        "trend_z_score": max_trend_z,
        "max_z_score": max_z_today_rounded,
        "smoothed_deviations": smoothed_deviations,
        "baseline_stats": baseline_stats,
    }
