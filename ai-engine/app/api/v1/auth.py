# Directory - ai-engine/app/api/v1/auth.py

"""CareOClock AI Engine — Internal Service Authentication Middleware & Dependencies (A-1).

Complies with NFR1 (Security) and prevents unauthenticated access to the AI engine
when deployed on separate public/private hosts.
"""

import secrets
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import get_settings


def verify_internal_key(
    x_internal_service_key: Optional[str] = Header(
        default=None,
        alias="X-Internal-Service-Key",
        description="Shared secret key for internal service-to-service communication (Express -> AI Engine)",
    ),
) -> str:
    """Validate internal service-to-service key.

    Rejects requests with 401 Unauthorized if the header is missing or does not match
    the configured AI_ENGINE_INTERNAL_KEY using constant-time comparison.
    """
    settings = get_settings()
    expected_key = settings.AI_ENGINE_INTERNAL_KEY
    if not x_internal_service_key or not secrets.compare_digest(
        x_internal_service_key, expected_key
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal service key (X-Internal-Service-Key required)",
        )
    return x_internal_service_key
