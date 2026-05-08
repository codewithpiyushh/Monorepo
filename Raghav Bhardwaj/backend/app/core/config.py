from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str  # 👈 remove default (important)

    SECRET_KEY: str = "drms-super-secret-key-change-in-production-abc123"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOAD_DIR: str = "./uploads"

    class Config:
        env_file = ".env"
        extra = "ignore"  # 👈 prevents crash if extra env vars exist


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()