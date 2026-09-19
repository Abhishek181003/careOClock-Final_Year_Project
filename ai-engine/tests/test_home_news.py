"""Comprehensive Unit Tests for Layer 1 Modified Home-NEWS & Care Additions."""

import os
from fastapi.testclient import TestClient
from app.main import app
from app.models.vitals import VitalsReading
from app.scoring.home_news import (
    compute_home_news,
    score_respiration_rate,
    score_spo2_scale1,
    score_spo2_scale2,
    score_systolic_bp,
    score_heart_rate,
    score_temperature,
    score_hypertension,
    score_symptoms,
    score_adherence,
)

client = TestClient(app)
VALID_KEY = os.getenv("AI_ENGINE_INTERNAL_KEY", "careoclock-internal-secret-key-dev")
AUTH_HEADERS = {"X-Internal-Service-Key": VALID_KEY}


def test_respiration_rate_scoring():
    assert score_respiration_rate(None) is None
    assert score_respiration_rate(8.0) == 3
    assert score_respiration_rate(10.0) == 1
    assert score_respiration_rate(16.0) == 0
    assert score_respiration_rate(22.0) == 2
    assert score_respiration_rate(26.0) == 3


def test_spo2_scale1_scoring():
    assert score_spo2_scale1(90.0) == 3
    assert score_spo2_scale1(92.0) == 2
    assert score_spo2_scale1(94.0) == 1
    assert score_spo2_scale1(98.0) == 0


def test_spo2_scale2_scoring_copd():
    # Target 88-92% on oxygen
    assert score_spo2_scale2(90.0, on_oxygen=True) == 0
    assert score_spo2_scale2(82.0, on_oxygen=True) == 3
    assert score_spo2_scale2(85.0, on_oxygen=True) == 2
    assert score_spo2_scale2(94.0, on_oxygen=True) == 1
    assert score_spo2_scale2(98.0, on_oxygen=True) == 3


def test_systolic_bp_scoring():
    assert score_systolic_bp(85.0) == 3
    assert score_systolic_bp(95.0) == 2
    assert score_systolic_bp(105.0) == 1
    assert score_systolic_bp(120.0) == 0
    assert score_systolic_bp(225.0) == 3


def test_heart_rate_scoring():
    assert score_heart_rate(38.0) == 3
    assert score_heart_rate(45.0) == 1
    assert score_heart_rate(72.0) == 0
    assert score_heart_rate(95.0) == 1
    assert score_heart_rate(115.0) == 2
    assert score_heart_rate(135.0) == 3


def test_temperature_scoring():
    assert score_temperature(34.5) == 3
    assert score_temperature(35.5) == 1
    assert score_temperature(36.8) == 0
    assert score_temperature(38.4) == 1
    assert score_temperature(39.5) == 2


def test_care_hypertension_staging():
    # Normal BP
    pts, urgency, _ = score_hypertension(120.0, 80.0)
    assert pts == 1  # DBP 80 is Stage 1
    assert not urgency

    pts, urgency, _ = score_hypertension(118.0, 75.0)
    assert pts == 0
    assert not urgency

    # Stage 2 HTN (SBP >= 140 or DBP >= 90)
    pts, urgency, _ = score_hypertension(145.0, 92.0)
    assert pts == 2
    assert not urgency

    # Hypertensive Crisis / Urgency (SBP >= 180 or DBP >= 120)
    pts, urgency, _ = score_hypertension(185.0, 110.0)
    assert pts == 3
    assert urgency


def test_care_symptoms_scoring():
    pts, esc = score_symptoms([])
    assert pts == 0
    assert esc == []

    pts, esc = score_symptoms(["dyspnea"])
    assert pts == 1
    assert esc == []

    pts, esc = score_symptoms(["chest_pain"])
    assert pts == 1
    assert "chest_pain" in esc


def test_care_adherence_scoring():
    pts, _ = score_adherence(None)
    assert pts == 0
    pts, _ = score_adherence(0.95)
    assert pts == 0
    pts, _ = score_adherence(0.70)
    assert pts == 1
    pts, _ = score_adherence(0.40)
    assert pts == 2


def test_full_score_home_news_stable_reading():
    reading = VitalsReading(
        patientId="pat-101",
        systolicBp=120.0,
        diastolicBp=80.0,
        heartRate=72.0,
        spo2=98.0,
        temperatureC=36.6,
        respirationRate=16.0,
    )
    res = compute_home_news(reading)
    assert res.layer1_tier in ["Low", "Moderate"]
    assert res.news2_subtotal == 0
    assert not res.red_flag_triggered


def test_full_score_home_news_red_flag_escalation():
    # Severe tachycardia (HR = 135) triggers Red Flag 3 points
    reading = VitalsReading(
        patientId="pat-102",
        systolicBp=120.0,
        diastolicBp=80.0,
        heartRate=135.0,
        spo2=98.0,
        temperatureC=36.6,
    )
    res = compute_home_news(reading)
    assert res.red_flag_triggered
    assert res.layer1_tier in ["High", "Critical"]


def test_api_layer1_unauthorized_missing_key():
    payload = {
        "patientId": "pat-test",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "heartRate": 72.0,
        "spo2": 98.0,
        "temperatureC": 36.6,
    }
    response = client.post("/api/v1/score/layer1", json=payload)
    assert response.status_code == 401


def test_api_layer1_unauthorized_invalid_key():
    payload = {
        "patientId": "pat-test",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "heartRate": 72.0,
        "spo2": 98.0,
        "temperatureC": 36.6,
    }
    response = client.post(
        "/api/v1/score/layer1",
        json=payload,
        headers={"X-Internal-Service-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_api_layer1_authorized_success():
    payload = {
        "patientId": "pat-test",
        "systolicBp": 120.0,
        "diastolicBp": 80.0,
        "heartRate": 72.0,
        "spo2": 98.0,
        "temperatureC": 36.6,
    }
    response = client.post(
        "/api/v1/score/layer1",
        json=payload,
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["layer1_tier"] in ["Low", "Moderate"]
    assert data["news2_subtotal"] == 0
