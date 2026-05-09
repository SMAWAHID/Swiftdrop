"""
SwiftDrop :: Configuration
Uses pydantic-settings v2 for environment variable management.
All secrets are read from environment — never hardcoded.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
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
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

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
