"""
SwiftDrop :: Configuration
Uses pydantic-settings v2 for environment variable management.
All secrets are read from environment — never hardcoded.
"""
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = (
        "postgresql://swiftdrop:swiftdrop_pass@localhost:5432/swiftdrop"
    )

    # JWT
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_SECRETS_MANAGER"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # App
    APP_NAME: str = "SwiftDrop API"
    DEBUG: bool = False

    # NoDecode stops pydantic-settings from JSON-parsing the env var before the
    # validator runs. Without it, CORS_ORIGINS in a hosting dashboard has to be
    # written as a JSON array (["https://x.app"]) and anything else crashes the
    # app at import time with a confusing SettingsError.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # ── Connection pool ───────────────────────────────────────────────────────
    # Free-tier Postgres allows far fewer concurrent connections than a
    # self-hosted server, so these are configurable and default low.
    DB_POOL_MIN_SIZE: int = 1
    DB_POOL_MAX_SIZE: int = 5

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> list[str]:
        """Accept a JSON array, a comma-separated string, or a real list."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                return [str(o).strip() for o in json.loads(v)]
            return [o.strip() for o in v.split(",") if o.strip()]
        return list(v)  # type: ignore[arg-type]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor for settings (lru_cache = 1 instance)."""
    return Settings()


settings: Settings = get_settings()
