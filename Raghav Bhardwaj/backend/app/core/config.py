"""
backend/app/core/config.py  (FULL REPLACEMENT)

Adds DEMO_MODE boolean to the settings manager.
All other existing settings are preserved exactly.
"""

from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./drms.db"

    # ── Security ───────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    refresh_token_expire_minutes: int = 43200
    mfa_otp_expire_minutes: int = 10

    # ── Application ────────────────────────────────────────────────────────
    APP_NAME: str = "DRMS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"   # development | staging | production
    upload_dir: str = "./uploads"
    allowed_db_import_hosts: str = "localhost,127.0.0.1"
    allowed_api_import_hosts: str = "localhost,127.0.0.1"

    # ── DEMO MODE ──────────────────────────────────────────────────────────
    DEMO_MODE: bool = False

    # ── Email / SMTP (optional) ────────────────────────────────────────────
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: str = "noreply@drms.local"
    smtp_username: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_use_tls: bool = True

    # ── CORS ───────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── MFA ────────────────────────────────────────────────────────────────
    MFA_ISSUER: str = "DRMS"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False # This should make Pydantic map lowercase .env keys to uppercase class attributes
        extra = "ignore"

    @property
    def REFRESH_TOKEN_EXPIRE_MINUTES(self):
        return self.refresh_token_expire_minutes


settings = Settings()

# ── Restored Utility Function for database.py ──────────────────────────────
def resolve_sqlite_database_path(db_url: str) -> Path | None:
    """Extracts the file path from a sqlite:/// URL."""
    if not db_url.startswith("sqlite"):
        return None
    # Strip the sqlite:/// prefix to get the raw path
    path_str = db_url.replace("sqlite+pysqlite:///", "").replace("sqlite:///", "").replace("sqlite://", "")
    if path_str == ":memory:":
        return Path(":memory:")
    return Path(path_str).absolute()