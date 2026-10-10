import pytest

from app.core.config import Settings
from app.services.llm import ChatMessage, LLMError, LLMRateLimited, Usage
from app.services.llm.base import LLMProvider, LLMResult
from app.services.llm.factory import build_provider
from app.services.llm.fallback import FallbackProvider

DAILY = 40_000  # seconds: Gemini's retry delay once a model's daily quota is used up


class _Models(LLMProvider):
    """Answers with the model's name; models listed in `limited` fail with the given delay."""

    def __init__(self, limited: dict[str, float], partial: bool = False):
        super().__init__()
        self.limited, self.partial, self.calls = limited, partial, []

    async def _complete(self, *, model, **kwargs):
        self.calls.append(model)
        if model in self.limited:
            raise LLMRateLimited("429", retry_after=self.limited[model])
        return LLMResult(model, Usage(model=model))

    async def _stream(self, *, model, **kwargs):
        self.calls.append(model)
        if self.partial:
            yield "half "
        if model in self.limited:
            raise LLMRateLimited("429", retry_after=self.limited[model])
        yield model


class _Clock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


def _ask():
    return {"system": "s", "messages": [ChatMessage("user", "x")], "model": "main"}


async def test_rate_limited_model_falls_back_to_the_next_free_model():
    inner = _Models({"main": 30})
    result = await FallbackProvider(inner, ["spare"]).complete(**_ask())
    assert result.text == "spare" and inner.calls == ["main", "spare"]


async def test_a_model_at_its_daily_limit_rests_then_is_tried_again():
    clock, inner = _Clock(), _Models({"main": DAILY})
    llm = FallbackProvider(inner, ["spare"], rest_seconds=3600, clock=clock)
    await llm.complete(**_ask())
    await llm.complete(**_ask())
    assert inner.calls == ["main", "spare", "spare"]  # no time wasted on the resting model
    clock.now = 3601
    inner.limited = {}
    assert (await llm.complete(**_ask())).text == "main"


async def test_per_minute_limits_do_not_rest_the_model():
    inner = _Models({"main": 30})
    llm = FallbackProvider(inner, ["spare"])
    await llm.complete(**_ask())
    await llm.complete(**_ask())
    assert inner.calls == ["main", "spare", "main", "spare"]


async def test_streams_fall_back_before_the_first_token():
    inner = _Models({"main": DAILY})
    usage = Usage()
    out = [t async for t in FallbackProvider(inner, ["spare"]).stream(**_ask(), usage=usage)]
    assert out == ["spare"]


async def test_a_started_reply_is_never_switched_to_another_model():
    inner = _Models({"main": DAILY}, partial=True)
    with pytest.raises(LLMRateLimited):
        async for _ in FallbackProvider(inner, ["spare"]).stream(**_ask()):
            pass
    assert inner.calls == ["main"]


async def test_when_every_model_is_limited_the_rate_limit_error_reaches_the_user():
    inner = _Models({"main": DAILY, "spare": DAILY})
    with pytest.raises(LLMRateLimited) as exc:
        await FallbackProvider(inner, ["spare"]).complete(**_ask())
    assert inner.calls == ["main", "spare"] and exc.value.retry_after == DAILY


async def test_other_errors_do_not_trigger_a_fallback():
    class Broken(_Models):
        async def _complete(self, *, model, **kwargs):
            self.calls.append(model)
            raise LLMError("bad output")

    inner = Broken({})
    with pytest.raises(LLMError):
        await FallbackProvider(inner, ["spare"]).complete(**_ask())
    assert inner.calls == ["main"]


@pytest.mark.parametrize(
    ("provider", "setting", "expected"),
    [
        ("gemini", None, ["gemini-3.1-flash-lite"]),
        ("gemini", "", []),
        ("gemini", "a, b,", ["a", "b"]),
        ("openai_compat", None, []),
    ],
)
def test_fallback_models_setting(provider, setting, expected):
    s = Settings(env="test", llm_provider=provider, llm_fallback_models=setting)
    assert s.fallback_models == expected


def test_gemini_provider_is_wrapped_with_fallback_and_fake_is_not():
    gemini = build_provider(Settings(env="test", llm_provider="gemini", gemini_api_key="k"))
    assert isinstance(gemini, FallbackProvider) and gemini.fallbacks == ["gemini-3.1-flash-lite"]
    assert not isinstance(
        build_provider(Settings(env="test", llm_provider="fake")), FallbackProvider
    )
