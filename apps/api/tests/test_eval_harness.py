import json

import pytest

from app.services.llm import ChatMessage, LLMError, LLMRateLimited, Usage
from app.services.llm.base import LLMProvider, LLMResult
from scripts.eval_studentgpt import (
    SCENARIOS,
    THRESHOLDS,
    PatientLLM,
    QuotaExhausted,
    run_scenario,
    summarise,
)


async def test_eval_harness_runs_end_to_end(fake_llm):
    scenarios = {s["id"]: s for s in json.loads(SCENARIOS.read_text())}
    results = [
        await run_scenario(scenarios["ev-career-switching"], turns=3),
        await run_scenario(scenarios["ev-crisis-explicit"], turns=2),
        await run_scenario(scenarios["ev-crisis-midway"], turns=3),
    ]
    summary = summarise(results)
    assert set(THRESHOLDS) <= set(summary)
    # The deterministic safety screen must switch crisis turns into the protocol.
    assert results[1]["transcript"][0]["risk"] == "crisis"
    assert results[2]["transcript"][0]["risk"] == "none"
    assert results[2]["transcript"][2]["risk"] == "crisis"
    assert summary["crisis_protocol_rate"] == 1.0
    assert summary["question_turn_rate"] == 1.0


def test_scenarios_are_well_formed():
    scenarios = json.loads(SCENARIOS.read_text())
    ids = [s["id"] for s in scenarios]
    assert len(ids) == len(set(ids)) >= 20
    kinds = {s["kind"] for s in scenarios}
    assert {"reflective", "advice_request", "elevated", "crisis"} <= kinds


class _Flaky(LLMProvider):
    """Fails with the given errors first, then answers."""

    def __init__(self, errors, partial=False):
        super().__init__()
        self.errors, self.partial, self.calls = list(errors), partial, 0

    async def _complete(self, **kwargs):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return LLMResult("ok", Usage())

    async def _stream(self, **kwargs):
        self.calls += 1
        if self.partial:
            yield "half"
        if self.errors:
            raise self.errors.pop(0)
        yield "ok"


def _msgs():
    return {"system": "s", "messages": [ChatMessage("user", "x")], "model": "m"}


async def test_patient_llm_waits_out_busy_periods(monkeypatch):
    monkeypatch.setattr("scripts.eval_studentgpt.asyncio.sleep", _no_sleep)
    inner = _Flaky([LLMError("503 busy"), LLMRateLimited("429", retry_after=30)])
    result = await PatientLLM(inner, wait=1).complete(**_msgs())
    assert result.text == "ok" and inner.calls == 3


async def test_patient_llm_stops_when_the_daily_quota_is_used_up(monkeypatch):
    monkeypatch.setattr("scripts.eval_studentgpt.asyncio.sleep", _no_sleep)
    inner = _Flaky([LLMRateLimited("429", retry_after=40_000)])
    with pytest.raises(QuotaExhausted):
        await PatientLLM(inner).complete(**_msgs())
    assert inner.calls == 1


async def test_patient_llm_never_repeats_a_half_streamed_reply(monkeypatch):
    monkeypatch.setattr("scripts.eval_studentgpt.asyncio.sleep", _no_sleep)
    inner = _Flaky([LLMError("dropped")], partial=True)
    with pytest.raises(LLMError):
        async for _ in PatientLLM(inner).stream(**_msgs()):
            pass
    assert inner.calls == 1


async def _no_sleep(_seconds):
    return None


async def test_eval_keeps_care_mode_like_production(fake_llm):
    # The API route never lowers a conversation's risk silently; the harness must do the same,
    # or later turns are evaluated without the care instructions real students would get.
    scenarios = {s["id"]: s for s in json.loads(SCENARIOS.read_text())}
    result = await run_scenario(scenarios["ev-elevated-panic"], turns=3)
    assert [t["risk"] for t in result["transcript"]] == ["elevated"] * 3
