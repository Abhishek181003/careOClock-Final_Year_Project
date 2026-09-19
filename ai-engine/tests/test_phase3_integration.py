# Directory - ai-engine/tests/test_phase3_integration.py

"""Phase 3 Integration Test Suite for CareOClock FastAPI AI Engine.

Verifies end-to-end HTTP contracts using FastAPI TestClient:
1. Day-by-day history maturation:
   - Feed patient history growing day-by-day (0 -> 10 days).
   - Verify status transitions from 'not yet available' to 'active' at exactly day 7.
   - Verify independent per-vital cold start clock (A-5): secondary vital introduced
     mid-window (day 4) activates on its own 7th day (day 10).
2. Auth middleware permanent regression suite:
   - 401 with no header, 401 with invalid key, 200 with valid key across /layer1 and /layer2.
3. Malformed input error handling:
   - SpO2 Scale 2 without on_supplemental_oxygen -> 422 (never 500).
   - SpO2 Scale 2 submitted by non-clinician role -> 422 (never 500).
"""

from datetime import date, datetime, timedelta, timezone
from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from app.scoring.constants import AI_ENGINE_INTERNAL_KEY_DEFAULT

client = TestClient(app)
AUTH_HEADERS = {"X-Internal-Service-Key": AI_ENGINE_INTERNAL_KEY_DEFAULT}


# =====================================================================
# 1. Day-by-Day Maturation & Per-Feature Cold-Start Clock (A-5)
# =====================================================================


def test_day_by_day_maturation_and_independent_vital_clock():
    """Verify status flips to 'active' at exactly day 7, and mid-window vital activates independently."""
    anchor = date(2026, 9, 25)
    patient_id = "PAT_INT_GROWTH"

    # We will build history day by day for 10 historical days
    # Days 1-3: only BP and HR
    # Days 4-10: BP, HR, AND Respiration Rate
    all_readings = []
    for day_idx in range(1, 11):
        reading_date = anchor - timedelta(days=(11 - day_idx))  # Chronological order
        dt = datetime.combine(reading_date, datetime.min.time(), tzinfo=timezone.utc)

        reading = {
            "patientId": patient_id,
            "recordedAt": dt.isoformat(),
            "slot": "morning",
            "systolicBp": 122.0 + (day_idx % 4),
            "diastolicBp": 80.0,
            "heartRate": 72.0,
        }
        # Secondary vital introduced starting on day 4
        if day_idx >= 4:
            reading["respirationRate"] = 18.0

        all_readings.append(reading)

    current_reading = {
        "patientId": patient_id,
        "systolicBp": 124.0,
        "diastolicBp": 82.0,
        "heartRate": 74.0,
        "respirationRate": 18.0,
    }

    # Test growth from 0 to 10 days
    for num_days in range(11):
        history_slice = all_readings[:num_days]
        payload = {
            "patientId": patient_id,
            "history": history_slice,
            "currentReading": current_reading,
            "currentDate": anchor.isoformat(),
        }

        resp = client.post("/api/v1/score/layer2", json=payload, headers=AUTH_HEADERS)
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()

        if num_days < 7:
            # Days 0 to 6: Cold start active
            assert data["status"] == "not yet available"
            assert data["layer2_tier"] == "not yet available"
            assert data["active_features"] == []
        elif 7 <= num_days < 10:
            # Days 7 to 9: BP and HR have reached 7+ days, but RR has NOT (only num_days - 3 days)
            assert data["status"] == "active"
            assert data["layer2_tier"] in ("Low", "Moderate", "High", "Critical")
            assert "systolic_bp" in data["active_features"]
            assert "heart_rate" in data["active_features"]
            assert (
                "respiration_rate" not in data["active_features"]
            ), f"Respiration rate should not activate at day {num_days} (needs 7 days of its own data)"
        else:
            # Day 10: RR has now been collected for 7 distinct days (days 4, 5, 6, 7, 8, 9, 10)
            assert data["status"] == "active"
            assert "systolic_bp" in data["active_features"]
            assert "heart_rate" in data["active_features"]
            assert (
                "respiration_rate" in data["active_features"]
            ), "Respiration rate must now activate on its own 7-day clock"


# =====================================================================
# 2. Auth Middleware Permanent Regression Suite
# =====================================================================


def test_auth_middleware_layer1_and_layer2():
    """Verify missing or invalid auth keys return 401, valid returns 200."""
    payload_l1 = {
        "patientId": "PAT_AUTH_TEST",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "heartRate": 70.0,
    }
    payload_l2 = {
        "patientId": "PAT_AUTH_TEST",
        "history": [],
        "currentReading": payload_l1,
    }

    for path, payload in [
        ("/api/v1/score/layer1", payload_l1),
        ("/api/v1/score/layer2", payload_l2),
    ]:
        # 1. Missing header -> 401
        res_none = client.post(path, json=payload)
        assert res_none.status_code == status.HTTP_401_UNAUTHORIZED

        # 2. Invalid header -> 401
        res_bad = client.post(
            path, json=payload, headers={"X-Internal-Service-Key": "wrong-secret-key"}
        )
        assert res_bad.status_code == status.HTTP_401_UNAUTHORIZED

        # 3. Valid header -> 200
        res_good = client.post(path, json=payload, headers=AUTH_HEADERS)
        assert res_good.status_code == status.HTTP_200_OK


# =====================================================================
# 3. Malformed Input Error Gating (422, Never 500)
# =====================================================================


def test_malformed_spo2_scale2_missing_oxygen_returns_422():
    """SpO2 Scale 2 without on_supplemental_oxygen must return 422 Unprocessable Content."""
    payload = {
        "patientId": "PAT_MALFORMED_01",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "spo2": 89.0,
        "spo2Scale": 2,
        # onSupplementalOxygen is omitted!
    }
    resp = client.post("/api/v1/score/layer1", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 422
    assert (
        "on_supplemental_oxygen" in resp.text.lower() or "onsupplementaloxygen" in resp.text.lower()
    )


def test_malformed_spo2_scale2_non_doctor_returns_422():
    """SpO2 Scale 2 submitted by patient role must return 422."""
    payload = {
        "patientId": "PAT_MALFORMED_02",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "spo2": 89.0,
        "spo2Scale": 2,
        "onSupplementalOxygen": False,
        "requestingRole": "patient",  # Not doctor!
    }
    resp = client.post("/api/v1/score/layer1", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 422
    assert "restricted to clinician" in resp.text.lower()


# =====================================================================
# 4. Workstream 5: Tuning Knob Isolation from Public HTTP Schema
# =====================================================================


def test_layer2_tuning_knobs_rejected_with_http_422():
    """Tuning dials ('contamination', 'nEstimators', 'n_estimators') must be rejected with 422 on Layer 2 endpoint."""
    base_payload = {
        "patientId": "PAT_KNOB_ISOLATION",
        "currentReading": {
            "patientId": "PAT_KNOB_ISOLATION",
            "systolicBp": 120.0,
            "diastolicBp": 80.0,
            "heartRate": 70.0,
        },
        "history": [],
    }

    # Attempt injecting tuning knobs: must trigger Pydantic extra='forbid' validation failure
    for field in ["contamination", "nEstimators", "n_estimators"]:
        payload = {**base_payload, field: 0.1 if "contamination" in field else 50}
        resp = client.post("/api/v1/score/layer2", json=payload, headers=AUTH_HEADERS)
        assert resp.status_code == 422, f"Expected 422 when injecting '{field}', got {resp.status_code}: {resp.text}"
        assert "extra" in resp.text.lower() or field.lower() in resp.text.lower()

