"""Grow the StudentGPT dataset with model-written dialogues, filtered for quality.

    uv run python scripts/generate_dialogues.py --count 20
    uv run python scripts/build_dataset.py        # validate and rebuild the exemplar library

Each dialogue is generated from a (topic x persona) grid, then must pass:
  1. the same structural/style checks as hand-written data (scripts/build_dataset.py), and
  2. an LLM judge scoring >= 4/5 on questioning quality and no premature advice.
Accepted dialogues are written to data/studentgpt/generated/batch-<timestamp>.json.
Review them before committing: generated data is a starting point, not ground truth.
"""

import argparse
import asyncio
import itertools
import json
import random
import sys
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.services.llm import LLMError, generate_structured, get_llm  # noqa: E402
from app.services.studentgpt.prompts import MENTOR_SYSTEM  # noqa: E402
from scripts.build_dataset import DATA, check_dialogue  # noqa: E402

TOPICS = [
    "career confusion between two fields",
    "parents' expectations versus own interest",
    "procrastination and perfectionism",
    "comparison with peers on social media",
    "placement and internship anxiety",
    "lack of motivation after entrance exams",
    "loneliness in hostel",
    "breakup affecting studies",
    "imposter syndrome at an internship",
    "fear of failure before trying something new",
    "money pressure and get-rich-quick temptation",
    "choosing between higher studies and a job",
    "phone or gaming overuse",
    "low confidence speaking in class",
    "burnout from doing too many things",
    "first-generation college student feeling behind",
    "fear of AI replacing jobs",
    "family business expectations",
    "not knowing what one enjoys",
    "friendship conflict",
]
PERSONAS = [
    "2nd-year B.Tech student from a tier-2 city",
    "final-year commerce student",
    "1st-year engineering student living away from home",
    "3rd-year BSc student",
    "MBA first-year student",
    "final-year arts student",
    "diploma student planning a degree",
    "postgraduate student in their first semester",
]
LANGS = ["en", "en", "en", "hinglish"]


class Turn(BaseModel):
    role: str = Field(description="'student' or 'mentor', alternating, starting with student")
    text: str


class Dialogue(BaseModel):
    domain: str
    archetype: str
    summary: str = Field(description="one line: the surface problem and the root underneath")
    turns: list[Turn] = Field(description="10-12 turns")


class Verdict(BaseModel):
    questioning: int = Field(ge=1, le=5)
    no_premature_advice: int = Field(ge=1, le=5)
    reaches_root: int = Field(ge=1, le=5)
    natural: int = Field(ge=1, le=5)
    reason: str


WRITER = (
    "You write training dialogues between a college student and an ideal reflective mentor. The "
    "mentor follows this specification exactly:\n\n"
    + MENTOR_SYSTEM
    + "\n\nThe student reveals the "
    "root cause gradually; the dialogue ends with the student articulating a realisation in their "
    "own words. Mentor turns are 25-90 words, almost always ending with one question. No therapy "
    "jargon, no diagnosis, no lectures."
)
JUDGE = (
    "You review a mentoring dialogue against the specification below. Be strict: any lecture, list "
    "of tips, verdict or advice before the student reaches their own insight scores <= 2 on "
    "no_premature_advice.\n\n" + MENTOR_SYSTEM
)


async def make_one(i: int, topic: str, persona: str, lang: str) -> dict | None:
    s = get_settings()
    llm = get_llm()
    try:
        d, _ = await generate_structured(
            llm,
            Dialogue,
            task="gen_dialogue",
            system=WRITER,
            model=s.llm_model,
            temperature=0.9,
            max_tokens=5000,
            prompt=f"Topic: {topic}. Student: {persona}. Language: "
            + ("English" if lang == "en" else "Hinglish (Hindi-English mix in Latin script)"),
        )
        row = {
            "id": f"gen-{datetime.now():%Y%m%d}-{i:03d}",
            "domain": d.domain,
            "archetype": d.archetype,
            "summary": d.summary,
            "language": lang,
            "turns": [t.model_dump() for t in d.turns],
            "source": "generated",
        }
        problems = check_dialogue(row)
        if problems:
            print(f"✗ {row['id']} rejected by checks: {problems[:2]}")
            return None
        transcript = "\n".join(f"{t['role']}: {t['text']}" for t in row["turns"])
        v, _ = await generate_structured(
            llm,
            Verdict,
            task="gen_judge",
            system=JUDGE,
            model=s.llm_model,
            temperature=0.0,
            prompt=transcript,
        )
        if min(v.questioning, v.no_premature_advice, v.reaches_root, v.natural) < 4:
            print(f"✗ {row['id']} rejected by judge: {v.reason[:120]}")
            return None
        print(f"✓ {row['id']} {d.domain}")
        return row
    except LLMError as exc:
        print(f"✗ generation {i} failed: {exc}")
        return None


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    if get_settings().llm_provider == "fake":
        print("Generation needs a real model: set LLM_PROVIDER and an API key.")
        return 2
    random.seed(args.seed)
    grid = list(itertools.product(TOPICS, PERSONAS))
    random.shuffle(grid)
    sem = asyncio.Semaphore(args.concurrency)

    async def guarded(i, topic, persona):
        async with sem:
            return await make_one(i, topic, persona, random.choice(LANGS))

    rows = await asyncio.gather(*(guarded(i, t, p) for i, (t, p) in enumerate(grid[: args.count])))
    kept = [r for r in rows if r]
    if kept:
        out = DATA / "generated" / f"batch-{datetime.now():%Y%m%d-%H%M%S}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(kept, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Kept {len(kept)}/{len(rows)} → {out}. Review, then run scripts/build_dataset.py")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
