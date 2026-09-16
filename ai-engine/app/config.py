# Directory - ai-engine/app/config.py

"""CareOClock AI Engine — Application Configuration & Environment Settings.

Leverages pydantic-settings (BaseSettings) for typed environment variable loading.
Enforces fail-closed security at app startup (NFR1 / Finding 3):
- Rejects launch with ENVIRONMENT='production' if AI_ENGINE_INTERNAL_KEY is unset or default.
- Keeps scientific model parameters locked as immutable constants in constants.py.
"""

from functools import lru_cache
from typing import List
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.scoring.constants import AI_ENGINE_INTERNAL_KEY_DEFAULT


class Settings(BaseSettings):
    """Application runtime and operational settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Operational Environment
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "info"

    # Internal Service Security (A-1)
    # Defaults to shared dev key; MUST be replaced in production
    AI_ENGINE_INTERNAL_KEY: str = AI_ENGINE_INTERNAL_KEY_DEFAULT

    # CORS & Allowed Origins
    ALLOWED_ORIGINS: str = "http://localhost:5000,http://localhost:5173"

    @property
    def cors_origins(self) -> List[str]:
        """Parse comma-separated allowed origins into a clean string list."""
        if self.ALLOWED_ORIGINS and self.ALLOWED_ORIGINS.strip():
            return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
        return ["http://localhost:5000", "http://localhost:5173"]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """Fail-closed security check at boot time (Finding 3 / Gap 3).

        If running in production, the internal service key must be explicitly set
        to a non-default, high-entropy secret. Halts boot immediately otherwise.
        """
        if self.ENVIRONMENT.strip().lower() == "production":
            key = self.AI_ENGINE_INTERNAL_KEY.strip() if self.AI_ENGINE_INTERNAL_KEY else ""
            if not key or key == AI_ENGINE_INTERNAL_KEY_DEFAULT:
                raise ValueError(
                    "FATAL SECURITY VIOLATION: AI Engine cannot boot in production with a missing "
                    "or default AI_ENGINE_INTERNAL_KEY secret. Configure a secure, high-entropy key."
                )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings singleton instance."""
    return Settings()
