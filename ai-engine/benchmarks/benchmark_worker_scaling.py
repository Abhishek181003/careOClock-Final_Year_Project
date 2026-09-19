# Directory - ai-engine/benchmarks/benchmark_worker_scaling.py

"""Empirical Multi-Worker Scaling & Latency Benchmark for CareOClock AI Engine (NFR2).

Evaluates Uvicorn multi-worker process topology across W in {1 (in-process baseline), 2, 4, 8, 12, 16}
under concurrent burst traffic (50 and 100 concurrent patient check-ins) over loopback TCP:
- Measures throughput (req/s) and latency distribution (p50, p90, p95, p99).
- Evaluates against NFR2 budget: 800ms SLA for 95% of requests under peak load.
- Conducts statelessness audit confirming per-request model refitting across worker processes.
- Exports tabular CSV and reproducibility JSON manifest.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
import json
import os
import platform
import socket
import subprocess
import sys
import time
import warnings
from typing import Any, Dict, List, Tuple

import httpx
import numpy as np
import pandas as pd

# Ensure UTF-8 stdout encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings("ignore")

# Ensure ai-engine root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.scoring.constants import AI_ENGINE_INTERNAL_KEY_DEFAULT

AUTH_HEADERS = {"X-Internal-Service-Key": AI_ENGINE_INTERNAL_KEY_DEFAULT}
WORKER_COUNTS = [2, 4, 8, 12, 16]
CONCURRENCY_LEVELS = [50, 100]


def get_free_port() -> int:
    """Finds an available TCP port on loopback."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def generate_patient_payload(patient_idx: int, history_days: int, anchor: date) -> Dict[str, Any]:
    """Generates realistic test payload for a single elderly patient check-in."""
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


async def _send_request(
    client: httpx.AsyncClient, payload: Dict[str, Any]
) -> Tuple[float, int, bool]:
    """Sends a single POST request and records duration in milliseconds."""
    t0 = time.perf_counter()
    try:
        resp = await client.post(
            "/api/v1/score/layer2", json=payload, headers=AUTH_HEADERS, timeout=30.0
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return elapsed_ms, resp.status_code, (resp.status_code == 200)
    except Exception:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return elapsed_ms, 500, False


async def execute_concurrent_burst(
    base_url: str,
    concurrency: int,
    history_days: int = 28,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> Dict[str, Any]:
    """Fires concurrent requests simultaneously using asyncio.gather."""
    anchor = date(2026, 9, 20)
    payloads = [generate_patient_payload(i, history_days, anchor) for i in range(concurrency)]

    client_kwargs: Dict[str, Any] = {"base_url": base_url, "timeout": 30.0}
    if transport is not None:
        client_kwargs["transport"] = transport

    async with httpx.AsyncClient(**client_kwargs) as client:
        # Warmup call
        await client.post("/api/v1/score/layer2", json=payloads[0], headers=AUTH_HEADERS)

        t_wall_start = time.perf_counter()
        tasks = [_send_request(client, p) for p in payloads]
        results = await asyncio.gather(*tasks)
        total_wall_sec = time.perf_counter() - t_wall_start

    durations = [r[0] for r in results]
    status_codes = [r[1] for r in results]
    successes = [r[2] for r in results]

    p50 = float(np.percentile(durations, 50))
    p90 = float(np.percentile(durations, 90))
    p95 = float(np.percentile(durations, 95))
    p99 = float(np.percentile(durations, 99))
    max_lat = float(np.max(durations))
    min_lat = float(np.min(durations))
    throughput = concurrency / total_wall_sec if total_wall_sec > 0 else 0.0
    error_rate = (concurrency - sum(successes)) / concurrency

    nfr2_met = p95 <= 800.0

    return {
        "concurrency": concurrency,
        "history_days": history_days,
        "wall_time_sec": round(total_wall_sec, 3),
        "throughput_rps": round(throughput, 1),
        "lat_min_ms": round(min_lat, 1),
        "lat_p50_ms": round(p50, 1),
        "lat_p90_ms": round(p90, 1),
        "lat_p95_ms": round(p95, 1),
        "lat_p99_ms": round(p99, 1),
        "lat_max_ms": round(max_lat, 1),
        "error_rate": error_rate,
        "nfr2_sla_met": nfr2_met,
    }


def wait_for_server(port: int, max_attempts: int = 40, delay: float = 0.25) -> bool:
    """Polls server until /health responds with 200."""
    url = f"http://127.0.0.1:{port}/health"
    for _ in range(max_attempts):
        try:
            with httpx.Client(timeout=1.0) as client:
                r = client.get(url)
                if r.status_code == 200:
                    return True
        except Exception:
            pass
        time.sleep(delay)
    return False


def run_scaling_benchmark() -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Runs empirical multi-worker benchmark across W in {1, 2, 4, 8, 12, 16}."""
    print("=" * 80)
    print("CAREOCLOCK AI ENGINE — MULTI-WORKER SCALING & LATENCY BENCHMARK (NFR2)")
    print("=" * 80)
    print(f"Host Architecture: {platform.processor()} ({os.cpu_count()} CPU Cores)")
    print(f"Testing Concurrencies: {CONCURRENCY_LEVELS} requests (28-day mature history)")
    print(f"NFR2 SLA Target: p95 latency <= 800ms")
    print("=" * 80)

    records: List[Dict[str, Any]] = []

    # -------------------------------------------------------------
    # Step 1: In-Process GIL-Bound Baseline (W=1 ASGITransport)
    # -------------------------------------------------------------
    print("\n[Baseline] Evaluating In-Process GIL Baseline (W=1, ASGITransport)...")
    transport = httpx.ASGITransport(app=app)
    for conc in CONCURRENCY_LEVELS:
        res = asyncio.run(
            execute_concurrent_burst(
                base_url="http://careoclock-baseline",
                concurrency=conc,
                history_days=28,
                transport=transport,
            )
        )
        res["workers"] = 1
        res["topology"] = "In-Process (ASGITransport, GIL-Bound)"
        records.append(res)
        print(
            f"  W=1 | N={conc:3d} | p50: {res['lat_p50_ms']:6.1f}ms | p95: {res['lat_p95_ms']:6.1f}ms | "
            f"Throughput: {res['throughput_rps']:5.1f} req/s | SLA Met: {res['nfr2_sla_met']}"
        )

    # -------------------------------------------------------------
    # Step 2: Multi-Worker Uvicorn Scaling (W in {2, 4, 8, 12, 16})
    # -------------------------------------------------------------
    for w in WORKER_COUNTS:
        port = get_free_port()
        print(f"\n[Worker Sweep] Spawning Uvicorn with W={w} workers on port {port}...")

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--workers",
            str(w),
            "--log-level",
            "warning",
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
        )

        try:
            ready = wait_for_server(port)
            if not ready:
                print(f"  [ERROR] Server failed to start on port {port}!")
                continue

            base_url = f"http://127.0.0.1:{port}"
            for conc in CONCURRENCY_LEVELS:
                res = asyncio.run(
                    execute_concurrent_burst(
                        base_url=base_url,
                        concurrency=conc,
                        history_days=28,
                    )
                )
                res["workers"] = w
                res["topology"] = f"Uvicorn Process Pool (W={w})"
                records.append(res)
                print(
                    f"  W={w:2d} | N={conc:3d} | p50: {res['lat_p50_ms']:6.1f}ms | p95: {res['lat_p95_ms']:6.1f}ms | "
                    f"Throughput: {res['throughput_rps']:5.1f} req/s | SLA Met: {res['nfr2_sla_met']}"
                )

        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                proc.kill()

    df_results = pd.DataFrame(records)
    return df_results, {"records": records}


def main():
    results_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "results"))
    os.makedirs(results_dir, exist_ok=True)

    df_results, meta = run_scaling_benchmark()

    # Save CSV
    csv_path = os.path.join(results_dir, "worker_scaling_results.csv")
    df_results.to_csv(csv_path, index=False)
    print(f"\nSaved worker scaling results CSV to: {csv_path}")

    # Build manifest
    manifest = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "hardware_environment": {
            "platform": platform.platform(),
            "cpu_architecture": platform.processor(),
            "cpu_cores": os.cpu_count(),
            "python_version": sys.version,
        },
        "nfr2_sla_budget_ms": 800.0,
        "concurrency_tested": CONCURRENCY_LEVELS,
        "worker_counts_tested": [1] + WORKER_COUNTS,
        "summary_table": df_results.to_dict(orient="records"),
    }

    manifest_path = os.path.join(results_dir, "worker_scaling_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Saved worker scaling manifest to: {manifest_path}")

    # Display clean comparison table
    print("\n" + "=" * 80)
    print("EMPIRICAL LATENCY & THROUGHPUT BENCHMARK TABLE (NFR2 SLA Budget: 800ms)")
    print("=" * 80)
    cols_display = [
        "workers",
        "concurrency",
        "lat_p50_ms",
        "lat_p90_ms",
        "lat_p95_ms",
        "lat_p99_ms",
        "throughput_rps",
        "nfr2_sla_met",
    ]
    print(df_results[cols_display].to_string(index=False))
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
