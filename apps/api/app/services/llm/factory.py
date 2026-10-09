from app.core.config import Settings, get_settings
from app.services.llm.base import LLMProvider

_provider: LLMProvider | None = None


def build_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "gemini":
        from app.services.llm.gemini import GeminiProvider

        return GeminiProvider(
            api_key=settings.gemini_api_key or "",
            base_url=settings.gemini_base_url,
            timeout=settings.llm_timeout_seconds,
            max_concurrency=settings.llm_max_concurrency,
            thinking_budget=settings.gemini_thinking_budget,
        )
    if settings.llm_provider == "openai_compat":
        from app.services.llm.openai_compat import OpenAICompatProvider

        return OpenAICompatProvider(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
            timeout=settings.llm_timeout_seconds,
            max_concurrency=settings.llm_max_concurrency,
        )
    from app.services.llm.fake import FakeProvider

    return FakeProvider()


def get_llm() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = build_provider(get_settings())
    return _provider


def set_llm(provider: LLMProvider | None) -> None:
    """Swap the provider (tests)."""
    global _provider
    _provider = provider
