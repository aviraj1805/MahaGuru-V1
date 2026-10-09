import json

from scripts.eval_studentgpt import SCENARIOS, THRESHOLDS, run_scenario, summarise


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
