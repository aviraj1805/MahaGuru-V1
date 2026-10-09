"""Typed application settings, loaded from environment variables (and `.env` in development)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "production"]
ProviderName = Literal["gemini", "openai_compat", "fake"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Environment = "development"
    app_name: str = "MahaGuru AI"
    # Public origin of the web app, e.g. https://mahaguru.example.com. Used for CORS in dev.
    web_origin: str = "http://localhost:5173"
    # Extra allowed CORS origins (comma separated). The app is normally served same-origin.
    cors_origins: str = ""

    database_url: str = "sqlite+aiosqlite:///./mahaguru.db"

    # Secret used to sign nothing sensitive client-side (sessions are opaque DB tokens), but it
    # salts token hashes and must still be unique per deployment.
    secret_key: str = Field(default="dev-only-change-me", min_length=8)
    session_days: int = 30
    guest_session_days: int = 7
    cookie_name: str = "mg_session"

    # --- LLM provider -------------------------------------------------------------------
    llm_provider: ProviderName = "gemini"
    # Main model: conversation, teaching, curriculum. Fast model: state updates, grading.
    llm_model: str = "gemini-2.5-flash"
    llm_fast_model: str = "gemini-2.5-flash-lite"
    llm_timeout_seconds: float = 60.0
    llm_max_concurrency: int = 4
    gemini_api_key: str | None = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    # Thinking budget for Gemini Flash models (0 turns thinking off: faster, saves quota).
    # Unset (empty) leaves the model default.
    gemini_thinking_budget: int | None = 0
    # OpenAI-compatible endpoints: Groq, OpenRouter, Ollama (http://localhost:11434/v1), etc.
    openai_base_url: str = "https://api.groq.com/openai/v1"
    openai_api_key: str | None = None

    # --- Quotas (rolling 24h) -----------------------------------------------------------
    guest_daily_messages: int = 25
    user_daily_messages: int = 150
    guest_daily_classroom_actions: int = 30
    user_daily_classroom_actions: int = 200
    guest_max_classrooms: int = 1
    user_max_classrooms: int = 10

    # --- Classroom resources --------------------------------------------------------------
    validate_resource_links: bool = True

    # Serve the built web app from this directory if it exists (single-service deploy).
    web_dist_dir: str = "../web/dist"

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if self.env == "production":
            if self.secret_key == "dev-only-change-me" or len(self.secret_key) < 32:  # noqa: S105
                raise ValueError(
                    "SECRET_KEY must be set to a random value of 32+ chars in production"
                )
            if self.llm_provider == "fake":
                raise ValueError("LLM_PROVIDER=fake is only allowed in development and tests")
        if self.llm_provider == "gemini" and not self.gemini_api_key and self.env != "test":
            raise ValueError(
                "GEMINI_API_KEY is required when LLM_PROVIDER=gemini. Get a free key at "
                "https://aistudio.google.com/apikey, or set LLM_PROVIDER=fake for offline UI work."
            )
        if self.llm_provider == "openai_compat" and not self.openai_base_url:
            raise ValueError("OPENAI_BASE_URL is required when LLM_PROVIDER=openai_compat")
        return self

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.web_origin] + [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return list(dict.fromkeys(origins))


@lru_cache
def get_settings() -> Settings:
    return Settings()
