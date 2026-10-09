import json
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.db.base import Base
from app.db.session import normalize_database_url
from app.services.llm import ChatMessage, LLMError, LLMRateLimited, Usage, generate_structured
from app.services.llm.base import LLMProvider, LLMResult
from app.services.llm.gemini import GeminiProvider
from app.services.llm.openai_compat import OpenAICompatProvider
from app.services.llm.structured import extract_json


class Point(BaseModel):
    x: int
    y: int


class ScriptedProvider(LLMProvider):
    def __init__(self, replies):
        super().__init__()
        self.replies = list(replies)
        self.seen: list[list[ChatMessage]] = []

    async def _complete(self, *, system, messages, model, temperature, max_tokens, json_mode, task):
        self.seen.append(messages)
        return LLMResult(self.replies.pop(0), Usage(model=model, input_tokens=1, output_tokens=1))

    async def _stream(self, **kwargs):  # pragma: no cover
        yield ""


async def test_structured_output_repairs_once():
    llm = ScriptedProvider(['{"x": 1}', '```json\n{"x": 1, "y": 2}\n```'])
    point, usage = await generate_structured(
        llm, Point, task="t", system="s", prompt="p", model="m"
    )
    assert point == Point(x=1, y=2) and usage.input_tokens == 2
    assert "invalid" in llm.seen[1][-1].content


async def test_structured_output_gives_up():
    llm = ScriptedProvider(["nope", "still nope"])
    with pytest.raises(LLMError):
        await generate_structured(llm, Point, task="t", system="s", prompt="p", model="m")


def test_extract_json():
    assert extract_json('Sure! {"a": {"b": 1}} hope it helps') == '{"a": {"b": 1}}'


def _gemini(handler) -> GeminiProvider:
    p = GeminiProvider(api_key="k", base_url="https://gemini.test/v1beta")
    p._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return p


async def test_gemini_request_and_response_mapping():
    captured = {}

    def handler(request: httpx.Request):
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "hello"}]}, "finishReason": "STOP"}],
                "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 3},
            },
        )

    p = _gemini(handler)
    result = await p.complete(
        system="sys",
        messages=[
            ChatMessage("user", "hi"),
            ChatMessage("assistant", "yo"),
            ChatMessage("user", "q"),
        ],
        model="gemini-2.5-flash",
        json_mode=True,
    )
    assert result.text == "hello" and result.usage.input_tokens == 7
    body = captured["body"]
    assert captured["url"].endswith("/models/gemini-2.5-flash:generateContent")
    assert [c["role"] for c in body["contents"]] == ["user", "model", "user"]
    assert body["systemInstruction"]["parts"][0]["text"] == "sys"
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingBudget": 0}


async def test_gemini_stream_parses_sse():
    chunks = [
        {"candidates": [{"content": {"parts": [{"text": "Hel"}]}}]},
        {
            "candidates": [{"content": {"parts": [{"text": "lo"}]}}],
            "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 2},
        },
    ]
    body = "".join(f"data: {json.dumps(c)}\r\n\r\n" for c in chunks)

    def handler(request):
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    usage = Usage()
    out = [
        t
        async for t in _gemini(handler).stream(
            system="s", messages=[ChatMessage("user", "x")], model="m", usage=usage
        )
    ]
    assert "".join(out) == "Hello" and usage.output_tokens == 2


@pytest.mark.parametrize(
    ("model", "budget", "expected"),
    [
        ("gemini-2.5-flash", 0, {"thinkingBudget": 0}),
        ("gemini-3.6-flash", 0, {"thinkingLevel": "minimal"}),
        ("gemini-3.5-flash-lite", 0, {"thinkingLevel": "minimal"}),
        ("gemini-flash-latest", 0, {"thinkingLevel": "minimal"}),
        ("gemini-3.6-flash", 512, {"thinkingBudget": 512}),
        ("gemini-3.6-flash", None, None),
        ("gemini-2.5-pro", 0, None),
    ],
)
def test_gemini_thinking_is_off_for_flash_models(model, budget, expected):
    p = GeminiProvider(api_key="k", base_url="https://gemini.test/v1beta", thinking_budget=budget)
    assert p._thinking_options(model)[0] == expected


def _thinking_picky_handler(seen: list, stream: bool = False):
    """Like gemini-3.8-flash: rejects thinkingLevel "minimal" but accepts thinkingBudget 0."""

    def handler(request):
        thinking = json.loads(request.content)["generationConfig"].get("thinkingConfig")
        seen.append(thinking)
        if thinking == {"thinkingLevel": "minimal"}:
            return httpx.Response(400, json={"error": {"message": "MINIMAL is not supported"}})
        reply = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        if stream:
            return httpx.Response(200, text=f"data: {json.dumps(reply)}\r\n\r\n")
        return httpx.Response(200, json=reply)

    return handler


async def test_gemini_falls_back_to_a_thinking_setting_the_model_accepts():
    seen: list = []
    p = _gemini(_thinking_picky_handler(seen))
    for _ in range(2):
        result = await p.complete(
            system="s", messages=[ChatMessage("user", "x")], model="gemini-3.8-flash"
        )
        assert result.text == "ok"
    # The rejected setting is tried once; afterwards the accepted one is used directly.
    assert seen == [{"thinkingLevel": "minimal"}, {"thinkingBudget": 0}, {"thinkingBudget": 0}]


async def test_gemini_stream_falls_back_to_a_thinking_setting_the_model_accepts():
    seen: list = []
    p = _gemini(_thinking_picky_handler(seen, stream=True))
    out = [
        t
        async for t in p.stream(
            system="s", messages=[ChatMessage("user", "x")], model="gemini-3.8-flash"
        )
    ]
    assert out == ["ok"] and seen == [{"thinkingLevel": "minimal"}, {"thinkingBudget": 0}]


async def test_gemini_bad_request_still_fails_when_no_setting_helps():
    def handler(request):
        return httpx.Response(400, json={"error": {"message": "bad"}})

    with pytest.raises(LLMError):
        await _gemini(handler).complete(
            system="s", messages=[ChatMessage("user", "x")], model="gemini-3.8-flash"
        )


async def test_gemini_stream_retries_transient_errors_before_first_token(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)
    calls = {"n": 0}
    sse = f"data: {json.dumps({'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]})}\r\n\r\n"

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(503, text="high demand")
        return httpx.Response(200, text=sse, headers={"content-type": "text/event-stream"})

    out = [
        t
        async for t in _gemini(handler).stream(
            system="s", messages=[ChatMessage("user", "x")], model="m"
        )
    ]
    assert out == ["ok"] and calls["n"] == 2


async def test_gemini_stream_gives_up_after_bounded_retries(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(429, json={"error": "quota"})

    with pytest.raises(LLMRateLimited):
        async for _ in _gemini(handler).stream(
            system="s", messages=[ChatMessage("user", "x")], model="m"
        ):
            pass
    assert calls["n"] == 3


async def test_rate_limit_maps_to_friendly_error(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)

    def handler(request):
        return httpx.Response(429, json={"error": "quota"}, headers={"retry-after": "30"})

    with pytest.raises(LLMRateLimited) as exc:
        await _gemini(handler).complete(system="s", messages=[ChatMessage("user", "x")], model="m")
    assert exc.value.retry_after == 30


async def test_transient_errors_are_retried(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})

    result = await _gemini(handler).complete(
        system="s", messages=[ChatMessage("user", "x")], model="m"
    )
    assert result.text == "ok" and calls["n"] == 2


async def test_openai_compat_mapping():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '{"x":1,"y":2}'}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 6},
            },
        )

    p = OpenAICompatProvider(base_url="https://llm.test/v1", api_key="secret")
    p._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), headers={"authorization": "Bearer secret"}
    )
    point, usage = await generate_structured(
        p, Point, task="t", system="s", prompt="p", model="llama"
    )
    assert point.y == 2 and usage.output_tokens == 6
    assert captured["body"]["messages"][0] == {"role": "system", "content": "s"}
    assert captured["body"]["response_format"] == {"type": "json_object"}
    assert captured["auth"] == "Bearer secret"


async def _no_sleep(_):
    return None


def test_production_settings_are_strict():
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(env="production", llm_provider="openai_compat", secret_key="too-short-key")
    with pytest.raises(ValueError, match="fake"):
        Settings(env="production", llm_provider="fake", secret_key="x" * 40)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        Settings(env="development", llm_provider="gemini", gemini_api_key=None)
    ok = Settings(env="production", llm_provider="gemini", gemini_api_key="k", secret_key="x" * 40)
    assert ok.is_production


def test_database_url_normalisation():
    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert (
        normalize_database_url("postgresql://u:p@h/db?sslmode=require&channel_binding=require")
        == "postgresql+asyncpg://u:p@h/db?ssl=require"
    )
    assert normalize_database_url("sqlite+aiosqlite:///x.db") == "sqlite+aiosqlite:///x.db"


async def test_migrations_match_models(tmp_path: Path):
    """`alembic upgrade head` must produce exactly the tables the models declare."""
    from alembic.config import Config

    from alembic import command

    url = f"sqlite+aiosqlite:///{tmp_path}/mig.db"
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    cfg.attributes["url"] = url
    import asyncio

    await asyncio.to_thread(command.upgrade, cfg, "head")
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
    await engine.dispose()
    assert set(Base.metadata.tables) <= tables


async def test_detached_stream_survives_client_disconnect():
    """A reply keeps generating (and would be saved) after the browser goes away."""
    import asyncio

    from app.api.sse import detached

    finished = asyncio.Event()

    async def producer(emit):
        for i in range(3):
            emit(f"chunk{i}")
            await asyncio.sleep(0.01)
        finished.set()

    stream = detached(producer)
    assert await stream.__anext__() == "chunk0"
    await stream.aclose()  # client disconnects
    await asyncio.wait_for(finished.wait(), timeout=1)


async def test_invalid_gemini_key_gets_clear_message():
    def handler(request):
        return httpx.Response(
            400,
            json={
                "error": {"status": "INVALID_ARGUMENT", "details": [{"reason": "API_KEY_INVALID"}]}
            },
        )

    with pytest.raises(LLMError) as exc:
        await _gemini(handler).complete(system="s", messages=[ChatMessage("user", "x")], model="m")
    assert "API key" in exc.value.user_message


def _quota_429(retry_delay: str) -> httpx.Response:
    return httpx.Response(
        429,
        json={
            "error": {
                "code": 429,
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": []},
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": retry_delay,
                    },
                ],
            }
        },
    )


async def test_gemini_daily_quota_fails_fast_with_a_daily_message(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _quota_429("47286s")

    with pytest.raises(LLMRateLimited) as exc:
        await _gemini(handler).complete(system="s", messages=[ChatMessage("user", "x")], model="m")
    assert calls["n"] == 1  # retrying a daily cap is pointless
    assert exc.value.retry_after == 47286
    assert "daily limit" in exc.value.user_message


async def test_gemini_per_minute_limit_keeps_the_short_message(monkeypatch):
    monkeypatch.setattr("app.services.llm.http_util.asyncio.sleep", _no_sleep)

    def handler(request):
        return _quota_429("30s")

    with pytest.raises(LLMRateLimited) as exc:
        await _gemini(handler).complete(system="s", messages=[ChatMessage("user", "x")], model="m")
    assert exc.value.retry_after == 30
    assert "wait a minute" in exc.value.user_message
