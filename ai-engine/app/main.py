# Directory - ai-engine/app/main.py

"""CareOClock AI Engine — FastAPI Service."""

import sys
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure the ai-engine root is in sys.path even if executed directly
project_root = str(Path(__file__).resolve().parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app.api.v1.scoring import router as scoring_router  # noqa: E402
from app.config import get_settings  # noqa: E402

# Startup fail-closed configuration validation (NFR1 / Finding 3)
settings = get_settings()

app = FastAPI(
    title="CareOClock AI Decision Support Engine",
    description="Microservice providing Layer 1 Modified Home-NEWS & Layer 2 Personalized Anomaly Detection",
    version="0.1.0",
)

# CORS Middleware setup
# Restrict allowed origins strictly to known clients; avoid wildcard with allow_credentials=True
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Internal-Service-Key"],
)

# Register API routers
app.include_router(scoring_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    """Service health check endpoint for scaffolding validation."""
    return {
        "status": "ok",
        "service": "careoclock-ai-engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/")
def root():
    """Root metadata endpoint."""
    return {
        "name": "CareOClock AI Decision Support Engine",
        "status": "running",
        "version": "0.1.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "layer1_score": "/api/v1/score/layer1",
            "layer2_score": "/api/v1/score/layer2",
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = settings.PORT
    host = settings.HOST
    print(f"Starting CareOClock AI Engine on http://{host}:{port} ...")
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
