# Directory - ai-engine/benchmarks/load_test_burst.py

"""Phase 3 Burst Load Simulation & Latency Profiling.

Simulates realistic burst traffic from twice-daily elderly patient check-ins
(morning check-in burst) using httpx.AsyncClient with ASGITransport and asyncio.gather:
- Benchmarks concurrent arrival bursts: N = 50 and N = 100 requests.
- Compares Cold-Start (7-day history) vs. Mature Worst-Case (28-day history, all 6 vitals active).
- Measures throughput (req/s), latency distribution (p50, p90, p95, p99), and error rate.
"""

import asyncio
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List
import numpy as np
import httpx

from app.main import app
from app.scoring.constants import AI_ENGINE_INTERNAL_KEY_DEFAULT

# Ensure ai-engine root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

AUTH_HEADERS = {"X-Internal-Service-Key": AI_ENGINE_INTERNAL_KEY_DEFAULT}


def generate_patient_payload(patient_idx: int, history_days: int, anchor: date) -> Dict[str, Any]:
    """Generate a realistic test payload for a single patient check-in."""
    patient_id = f"PAT_BURST_{patient_idx:04d}"
    history: List[Dict[str, Any]] = []

    for d in range(1, history_days + 1):
        dt = anchor - timedelta(days=d)
        ts = datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc).isoformat()
        history.append(
            {
                "patientId": patient_id,
                "recordedAt": ts,
                "slot": "morning",
                "systolicBp": 120.0 + (d % 7) * 2,
                "diastolicBp": 80.0 + (d % 4),
                "heartRate": 70.0 + (d % 5),
                "spo2": 97.0,
                "temperatureC": 36.6,
                "respirationRate": 16.0,
            }
        )

    current_reading = {
        "patientId": patient_id,
        "systolicBp": 124.0,
        "diastolicBp": 82.0,
        "heartRate": 72.0,
        "spo2": 96.0,
        "temperatureC": 36.7,
        "respirationRate": 18.0,
    }

    return {
        "patientId": patient_id,
        "history": history,
        "currentReading": current_reading,
        "currentDate": anchor.isoformat(),
    }


async def _send_single_request(
    client: httpx.AsyncClient, payload: Dict[str, Any]
) -> Tuple[float, int, bool]:
    """Sends a single POST request and records duration in milliseconds."""
    t0 = time.perf_counter()
    try:
        resp = await client.post(
            "/api/v1/score/layer2", json=payload, headers=AUTH_HEADERS, timeout=10.0
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        success = resp.status_code == 200
        return elapsed_ms, resp.status_code, success
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return elapsed_ms, 500, False


async def run_burst_test(
    concurrency: int,
    history_days: int,
    scenario_label: str,
) -> Dict[str, Any]:
    """Execute concurrent burst scenario and compute summary metrics."""
    anchor = date(2026, 9, 20)
    payloads = [generate_patient_payload(i, history_days, anchor) for i in range(concurrency)]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://careoclock-test") as client:
        # Warmup single call
        await client.post("/api/v1/score/layer2", json=payloads[0], headers=AUTH_HEADERS)

        start_time = time.perf_counter()
        tasks = [_send_single_request(client, p) for p in payloads]
        results = await asyncio.gather(*tasks)
        total_wall_sec = time.perf_counter() - start_time

    latencies = [r[0] for r in results]
    successes = sum(1 for r in results if r[2])
    error_rate = ((concurrency - successes) / concurrency) * 100.0
    throughput = concurrency / total_wall_sec

    metrics = {
        "scenario": scenario_label,
        "concurrency": concurrency,
        "history_days": history_days,
        "total_requests": concurrency,
        "successful_requests": successes,
        "error_rate_pct": error_rate,
        "total_wall_time_s": round(total_wall_sec, 3),
        "throughput_req_s": round(throughput, 1),
        "latency_min_ms": round(float(np.min(latencies)), 2),
        "latency_p50_ms": round(float(np.percentile(latencies, 50)), 2),
        "latency_p90_ms": round(float(np.percentile(latencies, 90)), 2),
        "latency_p95_ms": round(float(np.percentile(latencies, 95)), 2),
        "latency_p99_ms": round(float(np.percentile(latencies, 99)), 2),
        "latency_max_ms": round(float(np.max(latencies)), 2),
    }

    return metrics


async def main():
    print("=" * 70)
    print("CareOClock AI Engine — Phase 3 Burst Load Simulation")
    print("Simulating realistic concurrent check-in morning arrival bursts")
    print("=" * 70)

    scenarios = [
        (50, 7, "Burst: 50 concurrent patients (7-day baseline)"),
        (50, 28, "Burst: 50 concurrent patients (28-day mature worst-case)"),
        (100, 28, "Burst: 100 concurrent patients (28-day mature peak burst)"),
    ]

    results_table = []
    for concurrency, history_days, label in scenarios:
        print(f"\nRunning {label}...")
        res = await run_burst_test(concurrency, history_days, label)
        results_table.append(res)
        print(
            f"  Throughput: {res['throughput_req_s']} req/s | Wall Time: {res['total_wall_time_s']}s | Errors: {res['error_rate_pct']}%"
        )
        print(
            f"  Latency p50: {res['latency_p50_ms']} ms | p95: {res['latency_p95_ms']} ms | p99: {res['latency_p99_ms']} ms | Max: {res['latency_max_ms']} ms"
        )

    print("\n" + "=" * 70)
    print("SUMMARY RESULTS TABLE")
    print(f"{'Scenario':<40} | {'Req/s':<8} | {'p50 (ms)':<8} | {'p95 (ms)':<8} | {'p99 (ms)':<8}")
    print("-" * 70)
    for r in results_table:
        print(
            f"{r['scenario'][:39]:<40} | {r['throughput_req_s']:<8} | {r['latency_p50_ms']:<8} | {r['latency_p95_ms']:<8} | {r['latency_p99_ms']:<8}"
        )
    print("=" * 70)


if __name__ == "__main__":
    from typing import Tuple

    asyncio.run(main())
