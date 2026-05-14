from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    SITE_URL: str = ""
    SITE_USER: str = ""
    SITE_PASS: str = ""
    HEADLESS: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:4321"
    LOG_LEVEL: str = "INFO"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
