"""Health check tests for CareOClock AI Engine."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify health endpoint returns 200 OK and expected payload structure."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "careoclock-ai-engine"
    assert "timestamp" in data


def test_root_endpoint():
    """Verify root endpoint returns service metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "CareOClock AI Decision Support Engine"
    assert data["status"] == "running"
