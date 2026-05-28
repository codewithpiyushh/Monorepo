from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./drms.db"

    SECRET_KEY: str = "drms-super-secret-key-change-in-production-abc123"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOAD_DIR: str = "./uploads"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@drms.local"
    SMTP_USE_TLS: bool = True
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 43200
    MFA_OTP_EXPIRE_MINUTES: int = 10
    ALLOWED_DB_IMPORT_HOSTS: str = "localhost,127.0.0.1"
    ALLOWED_API_IMPORT_HOSTS: str = "localhost,127.0.0.1"

    class Config:
        env_file = ".env"
        extra = "ignore"  # 👈 prevents crash if extra env vars exist


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
