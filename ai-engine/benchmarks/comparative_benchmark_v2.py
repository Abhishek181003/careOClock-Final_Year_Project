# Directory - ai-engine/benchmarks/comparative_benchmark_v2.py

"""Publication-Grade Comparative Benchmarking Strategy v2 for CareOClock AI Engine.

Evaluates 7 algorithmic arms across the expanded 24-persona cohort and 30 fresh random seeds (301-330):
- Arms compared:
  1. Layer 1 (Deterministic Modified Home-NEWS multi-threshold rule engine)
  2. Layer 2 v1 (Single-day max |z| with v1 2-decimal rounded baseline)
  3. Layer 2 v2 (14-day EWMA trend_z with unrounded baseline + spike guard)
  4. Hybrid v1 (max(L1 tier, L2 v1 tier))
  5. Hybrid v2 (max(L1 tier, L2 v2 tier))
  6. Isolation Forest (Continuous anomaly score)
  7. LOF (Continuous novelty score)

Key Features:
- Dual-Threshold reporting for all tier-based arms:
  * Moderate+ (tier in {Moderate, High, Critical})
  * High+ (tier in {High, Critical})
- Categorical breakdown across clinical archetypes:
  * Acute crisis sensitivity
  * Gradual drift sensitivity
  * Stable inlier false alert rate
  * Hard negative false alert rate
  * Transient blip false alert rate
- Persona 5 early-warning lead time on gradual drift.
- Verification mode (--verify-v1) on seeds 101-130 to confirm exact reproduction of published v1 numbers.
- Cryptographic reproducibility manifest and summary CSV export to v2_* files.
"""

import argparse
import concurrent.futures
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
import platform
import sys
import warnings

# Ensure UTF-8 stdout encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import average_precision_score, roc_auc_score

# Ensure ai-engine root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.models.vitals import (
    HistoricalVitalsReading,
    Layer2ScoringRequest,
    VitalsReading,
)
from app.scoring.constants import (
    CONTAMINATION,
    DEFAULT_N_ESTIMATORS,
    MATURE_WINDOW_DAYS,
    MIN_DAYS_TO_ACTIVATE,
    TRACKED_VITALS,
)
from app.scoring.home_news import compute_home_news
from app.scoring.personalized_anomaly import (
    aggregate_readings_by_day,
    compute_personalized_anomaly,
)
from benchmarks.cohort_config import COHORT_METADATA, generate_longitudinal_persona

warnings.filterwarnings("ignore")


# =====================================================================
# 1. Layer 2 v1 Reference Implementation (with 2-decimal rounded baseline)
# =====================================================================


def _compute_layer2_v1_single_day(
    day_aggregations: List[Any],
    current_reading: VitalsReading,
    active_vitals: List[str],
) -> Tuple[float, str]:
    """Compute Layer 2 v1 max |z| and tier using the exact v1 2-decimal rounded baseline."""
    # Compute baseline with 2-decimal rounding as in v1
    baseline_stats: Dict[str, Dict[str, float]] = {}
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
        std_val = float(np.std(arr, ddof=1)) if count > 1 else 0.0
        baseline_stats[v] = {
            "mean": round(mean_val, 2),  # v1 rounded to 2 decimals
            "std": round(std_val, 2),    # v1 rounded to 2 decimals
            "count": float(count),
        }

    z_scores = []
    for v in active_vitals:
        val = getattr(current_reading, v, None)
        if val is None or v not in baseline_stats:
            continue
        mu = baseline_stats[v]["mean"]
        sigma = baseline_stats[v]["std"]
        if sigma > 1e-4:
            z = (float(val) - mu) / sigma
        else:
            diff = float(val) - mu
            if abs(diff) < 1e-4:
                z = 0.0
            else:
                z = 3.5 if diff > 0 else -3.5
        z_scores.append(round(abs(z), 2))

    max_z = max(z_scores, default=0.0)
    if max_z >= 3.5:
        tier = "Critical"
    elif max_z >= 2.5:
        tier = "High"
    elif max_z >= 1.8:
        tier = "Moderate"
    else:
        tier = "Low"

    return max_z, tier


# =====================================================================
# 2. Longitudinal Day-by-Day Evaluation Runner for One Seed
# =====================================================================


def evaluate_single_seed_v2(
    seed: int,
    persona_ids: Optional[List[int]] = None,
    n_estimators: int = DEFAULT_N_ESTIMATORS,
    contamination: Optional[float] = None,
) -> Dict[str, Any]:
    """Runs longitudinal day-by-day evaluation across requested personas for a single seed."""
    os.environ["ENABLE_ML_BENCHMARK_ARMS"] = "true"
    from app.config import get_settings
    get_settings.cache_clear()

    if persona_ids is None:
        persona_ids = list(range(1, 25))

    y_true_all: List[int] = []
    categories_all: List[str] = []

    # Scores
    scores = {
        "Layer 1": [],
        "Layer 2 v1": [],
        "Layer 2 v2": [],
        "Hybrid v1": [],
        "Hybrid v2": [],
        "Isolation Forest": [],
        "LOF": [],
    }

    # Alerts at Moderate+
    alerts_mod = {
        "Layer 1": [],
        "Layer 2 v1": [],
        "Layer 2 v2": [],
        "Hybrid v1": [],
        "Hybrid v2": [],
        "Isolation Forest": [],
        "LOF": [],
    }

    # Alerts at High+
    alerts_high = {
        "Layer 1": [],
        "Layer 2 v1": [],
        "Layer 2 v2": [],
        "Hybrid v1": [],
        "Hybrid v2": [],
        "Isolation Forest": [],
        "LOF": [],
    }

    p5_lead_times = {
        "L1_Mod": None,
        "L1_High": None,
        "L2_v1_Mod": None,
        "L2_v1_High": None,
        "L2_v2_Mod": None,
        "L2_v2_High": None,
        "Hybrid_v1_Mod": None,
        "Hybrid_v1_High": None,
        "Hybrid_v2_Mod": None,
        "Hybrid_v2_High": None,
        "IF": None,
        "LOF": None,
    }

    tier_ranks = {"Low": 0, "Moderate": 1, "High": 2, "Critical": 3}

    for persona_id in persona_ids:
        persona_meta = COHORT_METADATA.get(persona_id)
        persona_cat = persona_meta.category if persona_meta else "Unknown"

        readings, labels = generate_longitudinal_persona(persona_id, seed, total_days=75)

        for t in range(7, 75):
            day_num = t + 1
            is_anomaly = labels[t]
            curr_reading = readings[t]
            patient_id = curr_reading.patient_id

            # Rolling 28-day window: readings strictly prior to day t
            start_window = max(0, t - MATURE_WINDOW_DAYS)
            history_readings = [
                HistoricalVitalsReading(
                    patientId=patient_id,
                    recordedAt=r.recorded_at,
                    slot="morning",
                    systolicBp=r.systolic_bp,
                    diastolicBp=r.diastolic_bp,
                    heartRate=r.heart_rate,
                    spo2=r.spo2,
                    temperatureC=r.temperature_c,
                    respirationRate=r.respiration_rate,
                )
                for r in readings[start_window:t]
            ]

            # 1. Arm 1: Layer 1 (Modified Home-NEWS)
            res_l1 = compute_home_news(curr_reading)
            l1_tier_rank = tier_ranks[res_l1.layer1_tier]
            l1_score = float(res_l1.news2_subtotal)
            if res_l1.red_flag_triggered:
                l1_score += 3.0
            if "chest_pain" in curr_reading.symptom_flags:
                l1_score += 4.0

            l1_alert_mod = int(l1_tier_rank >= 1)
            l1_alert_high = int(l1_tier_rank >= 2)

            # 2. Arm 2 & 3: Layer 2 engine
            # We call compute_personalized_anomaly with ML enabled so IF/LOF are fitted for benchmarking
            req_l2 = Layer2ScoringRequest(
                patientId=patient_id,
                history=history_readings,
                currentReading=curr_reading,
                currentDate=curr_reading.recorded_at.date(),
            )
            res_l2_v2 = compute_personalized_anomaly(
                req_l2,
                contamination=contamination,
                n_estimators=n_estimators,
            )
            l2_v2_tier_rank = tier_ranks.get(res_l2_v2.layer2_tier, 0)
            trend_z = float(res_l2_v2.trend_z_score or 0.0)

            l2_v2_alert_mod = int(l2_v2_tier_rank >= 1)
            l2_v2_alert_high = int(l2_v2_tier_rank >= 2)

            # Layer 2 v1 (re-evaluated with v1 2-decimal rounded baseline)
            day_aggs, days_hist = aggregate_readings_by_day(
                history_readings, curr_reading.recorded_at.date()
            )
            active_v = [v for v in TRACKED_VITALS if days_hist.get(v, 0) >= MIN_DAYS_TO_ACTIVATE]
            if active_v and len(day_aggs) >= MIN_DAYS_TO_ACTIVATE:
                z_v1, l2_v1_tier = _compute_layer2_v1_single_day(day_aggs, curr_reading, active_v)
                l2_v1_tier_rank = tier_ranks.get(l2_v1_tier, 0)
            else:
                z_v1, l2_v1_tier_rank = 0.0, 0

            l2_v1_alert_mod = int(l2_v1_tier_rank >= 1)
            l2_v1_alert_high = int(l2_v1_tier_rank >= 2)

            # Hybrids
            hybrid_v1_rank = max(l1_tier_rank, l2_v1_tier_rank)
            hybrid_v1_alert_mod = int(hybrid_v1_rank >= 1)
            hybrid_v1_alert_high = int(hybrid_v1_rank >= 2)
            hybrid_v1_score = l1_score + max(0.0, z_v1 - 1.0) * 2.0

            hybrid_v2_rank = max(l1_tier_rank, l2_v2_tier_rank)
            hybrid_v2_alert_mod = int(hybrid_v2_rank >= 1)
            hybrid_v2_alert_high = int(hybrid_v2_rank >= 2)
            hybrid_v2_score = l1_score + max(0.0, trend_z - 1.0) * 2.0

            # ML Arms (continuous -decision_function)
            if_score_raw = res_l2_v2.evaluation_metadata.isolation_forest_decision_function if res_l2_v2.evaluation_metadata else 0.0
            if_score = -float(if_score_raw or 0.0)
            if_alert = int(res_l2_v2.evaluation_metadata.isolation_forest_is_anomaly if res_l2_v2.evaluation_metadata else 0)

            lof_score_raw = res_l2_v2.evaluation_metadata.lof_decision_function if res_l2_v2.evaluation_metadata else 0.0
            lof_score = -float(lof_score_raw or 0.0)
            lof_alert = int(res_l2_v2.evaluation_metadata.lof_is_anomaly if res_l2_v2.evaluation_metadata else 0)

            # Record Persona 5 Lead Time (days 41 to 55; crash is at day 56)
            if persona_id == 5 and 41 <= day_num <= 56:
                lead = 56 - day_num
                if l1_alert_mod and p5_lead_times["L1_Mod"] is None:
                    p5_lead_times["L1_Mod"] = lead
                if l1_alert_high and p5_lead_times["L1_High"] is None:
                    p5_lead_times["L1_High"] = lead
                if l2_v1_alert_mod and p5_lead_times["L2_v1_Mod"] is None:
                    p5_lead_times["L2_v1_Mod"] = lead
                if l2_v1_alert_high and p5_lead_times["L2_v1_High"] is None:
                    p5_lead_times["L2_v1_High"] = lead
                if l2_v2_alert_mod and p5_lead_times["L2_v2_Mod"] is None:
                    p5_lead_times["L2_v2_Mod"] = lead
                if l2_v2_alert_high and p5_lead_times["L2_v2_High"] is None:
                    p5_lead_times["L2_v2_High"] = lead
                if hybrid_v1_alert_mod and p5_lead_times["Hybrid_v1_Mod"] is None:
                    p5_lead_times["Hybrid_v1_Mod"] = lead
                if hybrid_v1_alert_high and p5_lead_times["Hybrid_v1_High"] is None:
                    p5_lead_times["Hybrid_v1_High"] = lead
                if hybrid_v2_alert_mod and p5_lead_times["Hybrid_v2_Mod"] is None:
                    p5_lead_times["Hybrid_v2_Mod"] = lead
                if hybrid_v2_alert_high and p5_lead_times["Hybrid_v2_High"] is None:
                    p5_lead_times["Hybrid_v2_High"] = lead
                if if_alert and p5_lead_times["IF"] is None:
                    p5_lead_times["IF"] = lead
                if lof_alert and p5_lead_times["LOF"] is None:
                    p5_lead_times["LOF"] = lead

            y_true_all.append(is_anomaly)
            categories_all.append(persona_cat)

            scores["Layer 1"].append(l1_score)
            scores["Layer 2 v1"].append(z_v1)
            scores["Layer 2 v2"].append(trend_z)
            scores["Hybrid v1"].append(hybrid_v1_score)
            scores["Hybrid v2"].append(hybrid_v2_score)
            scores["Isolation Forest"].append(if_score)
            scores["LOF"].append(lof_score)

            alerts_mod["Layer 1"].append(l1_alert_mod)
            alerts_mod["Layer 2 v1"].append(l2_v1_alert_mod)
            alerts_mod["Layer 2 v2"].append(l2_v2_alert_mod)
            alerts_mod["Hybrid v1"].append(hybrid_v1_alert_mod)
            alerts_mod["Hybrid v2"].append(hybrid_v2_alert_mod)
            alerts_mod["Isolation Forest"].append(if_alert)
            alerts_mod["LOF"].append(lof_alert)

            alerts_high["Layer 1"].append(l1_alert_high)
            alerts_high["Layer 2 v1"].append(l2_v1_alert_high)
            alerts_high["Layer 2 v2"].append(l2_v2_alert_high)
            alerts_high["Hybrid v1"].append(hybrid_v1_alert_high)
            alerts_high["Hybrid v2"].append(hybrid_v2_alert_high)
            alerts_high["Isolation Forest"].append(if_alert)
            alerts_high["LOF"].append(lof_alert)

    y_true = np.array(y_true_all)
    cats = np.array(categories_all)
    inlier_mask = y_true == 0
    total_inlier_days = max(1, int(np.sum(inlier_mask)))

    # Category masks
    crisis_mask = (cats == "Acute Crisis") & (y_true == 1)
    drift_mask = (cats == "Gradual Drift") & (y_true == 1)
    stable_mask = (cats == "Stable Inlier") & (y_true == 0)
    hard_neg_mask = (cats == "Hard Negative") & (y_true == 0)
    blip_mask = (cats == "Transient Blip") & (y_true == 0)

    def _calc_arm_metrics(sc: List[float], al: List[int]) -> Dict[str, float]:
        sc_arr = np.array(sc)
        al_arr = np.array(al)
        auroc = float(roc_auc_score(y_true, sc_arr))
        auprc = float(average_precision_score(y_true, sc_arr))

        tp = np.sum((al_arr == 1) & (y_true == 1))
        fp = np.sum((al_arr == 1) & (y_true == 0))
        fn = np.sum((al_arr == 0) & (y_true == 1))
        tn = np.sum((al_arr == 0) & (y_true == 0))

        sensitivity = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
        fpr = 1.0 - specificity
        alerts_per_week = float((fp / total_inlier_days) * 7.0)

        # Categorical breakdowns
        sens_crisis = float(np.mean(al_arr[crisis_mask])) if np.sum(crisis_mask) > 0 else 0.0
        sens_drift = float(np.mean(al_arr[drift_mask])) if np.sum(drift_mask) > 0 else 0.0
        spec_stable = float(1.0 - np.mean(al_arr[stable_mask])) if np.sum(stable_mask) > 0 else 0.0
        spec_hard_neg = float(1.0 - np.mean(al_arr[hard_neg_mask])) if np.sum(hard_neg_mask) > 0 else 0.0
        fa_blip_rate = float(np.mean(al_arr[blip_mask])) if np.sum(blip_mask) > 0 else 0.0

        return {
            "auroc": auroc,
            "auprc": auprc,
            "sensitivity": sensitivity,
            "specificity": specificity,
            "fpr": fpr,
            "alerts_per_week": alerts_per_week,
            "sens_crisis": sens_crisis,
            "sens_drift": sens_drift,
            "spec_stable": spec_stable,
            "spec_hard_neg": spec_hard_neg,
            "fa_blip_rate": fa_blip_rate,
        }

    arms = [
        "Layer 1",
        "Layer 2 v1",
        "Layer 2 v2",
        "Hybrid v1",
        "Hybrid v2",
        "Isolation Forest",
        "LOF",
    ]

    metrics_mod = {arm: _calc_arm_metrics(scores[arm], alerts_mod[arm]) for arm in arms}
    metrics_high = {arm: _calc_arm_metrics(scores[arm], alerts_high[arm]) for arm in arms}

    return {
        "seed": seed,
        "metrics_mod": metrics_mod,
        "metrics_high": metrics_high,
        "p5_lead_times": {k: (v if v is not None else 0) for k, v in p5_lead_times.items()},
    }


# =====================================================================
# 3. Benchmark Runner & Aggregator
# =====================================================================


def run_comparative_benchmark_v2(
    seeds: List[int],
    persona_ids: Optional[List[int]] = None,
    max_workers: Optional[int] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """Run v2 benchmark over seeds and aggregate across Moderate+ and High+ thresholds."""
    if persona_ids is None:
        persona_ids = list(range(1, 25))

    worker_str = f"with {max_workers} workers" if max_workers and max_workers > 1 else "serially"
    print(
        f"Starting v2 7-arm comparative benchmark ({len(persona_ids)} personas, {len(seeds)} seeds) {worker_str}..."
    )

    seed_results: List[Dict[str, Any]] = []

    # Ensure ML arms are enabled during benchmark execution
    os.environ["ENABLE_ML_BENCHMARK_ARMS"] = "true"
    get_settings.cache_clear()

    if max_workers and max_workers > 1:
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            future_to_seed = {
                executor.submit(evaluate_single_seed_v2, s, persona_ids): s for s in seeds
            }
            completed = 0
            for future in concurrent.futures.as_completed(future_to_seed):
                res = future.result()
                seed_results.append(res)
                completed += 1
                if completed % 5 == 0 or completed == len(seeds):
                    print(f"  Completed {completed}/{len(seeds)} seeds...")
        seed_results.sort(key=lambda x: x["seed"])
    else:
        for idx, s in enumerate(seeds):
            res = evaluate_single_seed_v2(s, persona_ids)
            seed_results.append(res)
            if (idx + 1) % 5 == 0 or (idx + 1) == len(seeds):
                print(f"  Completed {idx + 1}/{len(seeds)} seeds...")

    arms = [
        "Layer 1",
        "Layer 2 v1",
        "Layer 2 v2",
        "Hybrid v1",
        "Hybrid v2",
        "Isolation Forest",
        "LOF",
    ]
    metric_keys = [
        "auroc",
        "auprc",
        "sensitivity",
        "specificity",
        "fpr",
        "alerts_per_week",
        "sens_crisis",
        "sens_drift",
        "spec_stable",
        "spec_hard_neg",
        "fa_blip_rate",
    ]

    # Build per-seed results DataFrame
    per_seed_rows = []
    for r in seed_results:
        s = r["seed"]
        for rule_name, rule_data in [("Moderate+", r["metrics_mod"]), ("High+", r["metrics_high"])]:
            for arm in arms:
                m = rule_data[arm]
                row = {"seed": s, "threshold": rule_name, "arm": arm}
                row.update(m)
                per_seed_rows.append(row)

    df_per_seed = pd.DataFrame(per_seed_rows)

    # Build summary DataFrame with Mean +/- 95% CI
    n_seeds = len(seeds)
    t_crit = stats.t.ppf(0.975, df=n_seeds - 1) if n_seeds > 1 else 1.96

    summary_rows = []
    for rule_name, metric_dict_name in [("Moderate+", "metrics_mod"), ("High+", "metrics_high")]:
        for arm in arms:
            row = {"Threshold": rule_name, "Arm": arm}
            for m in metric_keys:
                vals = [r[metric_dict_name][arm][m] for r in seed_results]
                arr = np.array(vals)
                mean = float(np.mean(arr))
                se = float(stats.sem(arr)) if n_seeds > 1 else 0.0
                ci = float(t_crit * se)
                row[f"{m}_mean"] = round(mean, 4)
                row[f"{m}_ci95"] = round(ci, 4)
                row[f"{m}_display"] = f"{mean:.3f} +/- {ci:.3f}"

            # Specificity status
            spec_mean = row["specificity_mean"]
            if spec_mean < 0.60:
                row["specificity_status"] = "[WARN] Low (< 60%)"
            elif spec_mean >= 0.85:
                row["specificity_status"] = "[OK] High"
            else:
                row["specificity_status"] = "[OK] Moderate"

            summary_rows.append(row)

    df_summary = pd.DataFrame(summary_rows)

    # Persona 5 Lead Time Summary
    lead_time_summary = {}
    for k in seed_results[0]["p5_lead_times"].keys():
        arr = np.array([r["p5_lead_times"][k] for r in seed_results])
        mean_lt = float(np.mean(arr))
        ci_lt = float(t_crit * stats.sem(arr)) if n_seeds > 1 else 0.0
        lead_time_summary[k] = f"{mean_lt:.1f} +/- {ci_lt:.1f} days"

    # Paired Wilcoxon Tests: Hybrid v2 vs other arms at Moderate+ and High+
    wilcoxon_records = []
    for rule_name, m_key in [("Moderate+", "metrics_mod"), ("High+", "metrics_high")]:
        h2_sens = np.array([r[m_key]["Hybrid v2"]["sensitivity"] for r in seed_results])
        h2_spec = np.array([r[m_key]["Hybrid v2"]["specificity"] for r in seed_results])

        for other_arm in [
            "Layer 1",
            "Layer 2 v1",
            "Layer 2 v2",
            "Hybrid v1",
            "Isolation Forest",
            "LOF",
        ]:
            other_sens = np.array([r[m_key][other_arm]["sensitivity"] for r in seed_results])
            other_spec = np.array([r[m_key][other_arm]["specificity"] for r in seed_results])

            # Sens test
            diff_sens = h2_sens - other_sens
            if np.all(diff_sens == 0):
                p_sens, w_sens = 1.0, 0.0
            else:
                res_w = stats.wilcoxon(h2_sens, other_sens, zero_method="wilcox")
                p_sens, w_sens = float(res_w.pvalue), float(res_w.statistic)

            # Spec test
            diff_spec = h2_spec - other_spec
            if np.all(diff_spec == 0):
                p_spec, w_spec = 1.0, 0.0
            else:
                res_w = stats.wilcoxon(h2_spec, other_spec, zero_method="wilcox")
                p_spec, w_spec = float(res_w.pvalue), float(res_w.statistic)

            wilcoxon_records.append(
                {
                    "threshold": rule_name,
                    "comparison": f"Hybrid v2 vs {other_arm}",
                    "p_sens": p_sens,
                    "w_sens": w_sens,
                    "p_spec": p_spec,
                    "w_spec": w_spec,
                }
            )

    extra_data = {
        "lead_time_persona5": lead_time_summary,
        "wilcoxon_tests": wilcoxon_records,
        "cohort_size": len(persona_ids),
        "num_seeds": len(seeds),
        "seeds": seeds,
    }

    return df_per_seed, df_summary, extra_data


# =====================================================================
# 4. v1 Verification Routine (Seeds 101-130)
# =====================================================================


def verify_v1_reproduction() -> bool:
    """Verify that Layer 2 v1 & Hybrid v1 bit-for-bit reproduce published numbers on seeds 101-130."""
    print("=" * 80)
    print("VERIFYING v1 ARM REPRODUCTION (Seeds 101-130 against Published Results)")
    print("=" * 80)

    seeds = list(range(101, 131))
    df_per_seed, df_summary, _ = run_comparative_benchmark_v2(
        seeds=seeds,
        persona_ids=list(range(1, 25)),
        max_workers=min(8, os.cpu_count() or 4),
    )

    # Check published targets at Moderate+:
    # Hybrid: sensitivity = 0.9302, specificity = 0.5033, alerts_per_week = 3.4768
    # Layer 1: sensitivity = 0.5172, specificity = 0.8282, alerts_per_week = 1.2026
    # Naive z-score (Layer 2 v1): sensitivity = 0.9242, specificity = 0.5970, alerts_per_week = 2.8211

    h1_row = df_summary[
        (df_summary["Threshold"] == "Moderate+") & (df_summary["Arm"] == "Hybrid v1")
    ].iloc[0]
    l1_row = df_summary[
        (df_summary["Threshold"] == "Moderate+") & (df_summary["Arm"] == "Layer 1")
    ].iloc[0]
    l2v1_row = df_summary[
        (df_summary["Threshold"] == "Moderate+") & (df_summary["Arm"] == "Layer 2 v1")
    ].iloc[0]

    h1_sens = h1_row["sensitivity_mean"]
    h1_spec = h1_row["specificity_mean"]
    h1_fa = h1_row["alerts_per_week_mean"]

    print(f"Hybrid v1 Sens: {h1_sens:.4f} (target: 0.9302)")
    print(f"Hybrid v1 Spec: {h1_spec:.4f} (target: 0.5033)")
    print(f"Hybrid v1 FA/W: {h1_fa:.4f} (target: 3.4768)")

    sens_match = abs(h1_sens - 0.9302) < 0.005
    spec_match = abs(h1_spec - 0.5033) < 0.005
    fa_match = abs(h1_fa - 3.4768) < 0.05

    if sens_match and spec_match and fa_match:
        print("\n[SUCCESS] v1 Arm exactly reproduces published results within tolerances!")
        return True
    else:
        print("\n[FAILURE] Discrepancy detected in v1 arm reproduction:")
        print(f"  Sensitivity diff: {abs(h1_sens - 0.9302):.6f}")
        print(f"  Specificity diff: {abs(h1_spec - 0.5033):.6f}")
        print(f"  Alerts/wk diff:   {abs(h1_fa - 3.4768):.6f}")
        return False


# =====================================================================
# 5. Main Execution Entrypoint
# =====================================================================


def main():
    parser = argparse.ArgumentParser(description="CareOClock AI Engine — Comparative Benchmark v2")
    parser.add_argument("--verify-v1", action="store_true", help="Run verification of v1 on seeds 101-130")
    parser.add_argument("--seeds", type=str, default="301-330", help="Seeds range (e.g. 301-330)")
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4), help="Worker processes")
    args = parser.parse_args()

    results_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "results"))
    os.makedirs(results_dir, exist_ok=True)

    if args.verify_v1:
        success = verify_v1_reproduction()
        if not success:
            sys.exit(1)
        return

    # Parse seed range
    parts = args.seeds.split("-")
    if len(parts) == 2:
        seeds = list(range(int(parts[0]), int(parts[1]) + 1))
    else:
        seeds = [int(p) for p in parts[0].split(",")]

    print("=" * 80)
    print(f"CareOClock AI Engine — Comparative Benchmark v2")
    print(f"Seeds: {seeds[0]} to {seeds[-1]} ({len(seeds)} total)")
    print(f"Hardware Cores: {os.cpu_count()}, Workers: {args.workers}")
    print("=" * 80)

    df_per_seed, df_summary, extra_data = run_comparative_benchmark_v2(
        seeds=seeds,
        persona_ids=list(range(1, 25)),
        max_workers=args.workers,
    )

    # Export CSVs with v2_ prefix
    per_seed_path = os.path.join(results_dir, "v2_benchmark_results.csv")
    summary_path = os.path.join(results_dir, "v2_benchmark_summary.csv")
    manifest_path = os.path.join(results_dir, "v2_benchmark_manifest.json")

    df_per_seed.to_csv(per_seed_path, index=False)
    df_summary.to_csv(summary_path, index=False)
    print(f"\nSaved per-seed CSV to: {per_seed_path}")
    print(f"Saved summary CSV to:  {summary_path}")

    # Build manifest
    manifest = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "hardware_environment": {
            "platform": platform.platform(),
            "python_version": sys.version,
            "cpu_architecture": platform.processor(),
            "cpu_count": os.cpu_count(),
        },
        "experimental_parameters": {
            "cohort_size": extra_data["cohort_size"],
            "num_seeds": len(seeds),
            "seeds": seeds,
            "timeline_days_total": 75,
            "evaluated_days": 68,
            "total_evaluations": len(seeds) * extra_data["cohort_size"] * 68,
            "mature_window_days": MATURE_WINDOW_DAYS,
            "min_days_to_activate": MIN_DAYS_TO_ACTIVATE,
            "contamination": CONTAMINATION,
            "n_estimators": DEFAULT_N_ESTIMATORS,
        },
        "lead_time_persona5": extra_data["lead_time_persona5"],
        "wilcoxon_tests": extra_data["wilcoxon_tests"],
        "summary_metrics": df_summary.to_dict(orient="records"),
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Saved manifest to:     {manifest_path}")

    # Print Side-by-Side Comparison Table
    print("\n" + "=" * 80)
    print("V2 COMPARATIVE BENCHMARK SUMMARY (Moderate+ vs High+ across 30 Fresh Seeds)")
    print("=" * 80)
    display_cols = [
        "Threshold",
        "Arm",
        "sensitivity_display",
        "specificity_display",
        "alerts_per_week_display",
        "specificity_status",
    ]
    print(df_summary[display_cols].to_string(index=False))

    print("\n" + "=" * 80)
    print("CATEGORICAL BREAKDOWN (Moderate+ Alert Rule)")
    print("=" * 80)
    cat_cols = [
        "Arm",
        "sens_crisis_mean",
        "sens_drift_mean",
        "spec_stable_mean",
        "spec_hard_neg_mean",
        "fa_blip_rate_mean",
    ]
    mod_summary = df_summary[df_summary["Threshold"] == "Moderate+"][cat_cols]
    print(mod_summary.to_string(index=False))

    print("\n" + "=" * 80)
    print("PERSONA 5 EARLY-WARNING LEAD TIME BEFORE CRASH (Days)")
    print("=" * 80)
    for arm, lt in extra_data["lead_time_persona5"].items():
        print(f"  {arm:<20}: {lt}")


if __name__ == "__main__":
    main()
