# Directory - ai-engine/app/api/v1/scoring.py

from fastapi import APIRouter, Depends, HTTPException, status
from app.api.v1.auth import verify_internal_key
from app.models.vitals import (
    Layer2ScoringRequest,
    ModifiedHomeNEWSResult,
    PersonalizedAnomalyResult,
    VitalsReading,
)
from app.scoring.home_news import compute_home_news
from app.scoring.personalized_anomaly import compute_personalized_anomaly

router = APIRouter(
    prefix="/score",
    tags=["Clinical Decision Support (Layers 1 & 2)"],
    dependencies=[Depends(verify_internal_key)],  # A-1: Mandatory service-to-service key check on all scoring endpoints
)


@router.post(
    "/layer1",
    response_model=ModifiedHomeNEWSResult,
    status_code=status.HTTP_200_OK,
    summary="Score a single vitals reading using Layer 1 Modified Home-NEWS",
    description=(
        "Pure deterministic clinical rule engine derived from NEWS2 (Royal College of "
        "Physicians, 2017). Operates in complete isolation on a single reading with zero "
        "historical data dependencies. Evaluates respiration rate, SpO2 (Scale 1 or 2), "
        "systolic BP, heart rate, and temperature, plus CareOClock additions (hypertension "
        "staging, symptoms, adherence)."
    ),
)
def score_layer1_endpoint(reading: VitalsReading) -> ModifiedHomeNEWSResult:
    """Evaluate a single vitals reading and return the Layer 1 clinical risk tier, subtotal, and explanation."""
    try:
        return compute_home_news(reading)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Layer 1 scoring encountered an internal error: {type(exc).__name__}",
        )


@router.post(
    "/layer2",
    response_model=PersonalizedAnomalyResult,
    status_code=status.HTTP_200_OK,
    summary="Score incoming vitals using Layer 2 Personalized Anomaly Detection (FR4)",
    description=(
        "Unsupervised anomaly detection trained per-patient on their personal trailing "
        "7 to 28 days of readings. Evaluates Isolation Forest and Local Outlier Factor models "
        "statelessly on-demand. Returns 'not yet available' during cold start (< 7 days)."
    ),
)
def score_layer2_endpoint(request: Layer2ScoringRequest) -> PersonalizedAnomalyResult:
    """Evaluate incoming vitals against the patient's personal rolling baseline.

    A-11: Running as a synchronous def function allows FastAPI to execute the CPU-bound
    scikit-learn fit/score routine in the background threadpool, preserving an unblocked
    asyncio event loop for concurrent traffic.
    """
    try:
        return compute_personalized_anomaly(request)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        # A-9: Cross-service failure containment without leaking internal stack traces
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Personalized anomaly detection encountered an internal error: {type(exc).__name__}",
        )
