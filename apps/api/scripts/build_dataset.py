"""Validate the StudentGPT dialogue dataset and build the runtime exemplar library.

    uv run python scripts/build_dataset.py                       # authored dialogues only
    uv run python scripts/build_dataset.py --legacy path/to/CONVERSATIONS.json

Inputs
  data/studentgpt/authored/*.json   on-philosophy dialogues (checked into the repo)
  data/studentgpt/generated/*.json  dialogues produced by scripts/generate_dialogues.py
  --legacy FILE                     the original MahaGuru dataset (kept private). Only the opening
                                    exchanges that pass the curation filter are used.
Outputs
  data/studentgpt/dataset_v2.jsonl                         every validated dialogue
  apps/api/app/services/studentgpt/data/exemplars.jsonl    runtime retrieval library
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "studentgpt"
OUT_DATASET = DATA / "dataset_v2.jsonl"
OUT_EXEMPLARS = (
    ROOT / "apps" / "api" / "app" / "services" / "studentgpt" / "data" / "exemplars.jsonl"
)

PREACHY = re.compile(
    r"\b(you must|you should|you have to|completely fake|our religion|as a son|as a daughter|"
    r"results don'?t lie|drop the defen[cs]e|lord |goddess)\b",
    re.IGNORECASE,
)


def words(text: str) -> int:
    return len(text.split())


def check_dialogue(d: dict) -> list[str]:
    problems = []
    for key in ("id", "domain", "summary", "turns"):
        if not d.get(key):
            problems.append(f"missing {key}")
    turns = d.get("turns") or []
    if len(turns) < 4:
        problems.append("fewer than 4 turns")
    for i, t in enumerate(turns):
        expected = "student" if i % 2 == 0 else "mentor"
        if t.get("role") != expected:
            problems.append(f"turn {i} should be {expected}")
        if not (t.get("text") or "").strip():
            problems.append(f"turn {i} empty")
    mentor = [t["text"] for t in turns if t.get("role") == "mentor"]
    is_crisis = d.get("domain", "").lower() == "crisis"
    for m in mentor:
        if words(m) > 140:
            problems.append(f"mentor turn too long ({words(m)} words)")
        if PREACHY.search(m):
            problems.append(f"preachy phrasing: {PREACHY.search(m).group(0)!r}")
    if mentor and not is_crisis:
        asks = sum("?" in m for m in mentor) / len(mentor)
        if asks < 0.7:
            problems.append(f"only {asks:.0%} of mentor turns ask a question")
    return problems


def load_authored() -> list[dict]:
    rows = []
    for folder in ("authored", "generated"):
        for path in sorted((DATA / folder).glob("*.json")):
            for d in json.loads(path.read_text(encoding="utf-8")):
                d.setdefault("source", folder)
                rows.append(d)
    return rows


def curate_legacy(path: Path) -> list[dict]:
    """Keep only the question-led opening of each legacy conversation (see docs/dataset.md)."""
    out = []
    for i, c in enumerate(json.loads(path.read_text(encoding="utf-8"))):
        turns = []
        for m in c.get("conversation", []):
            role = "student" if m.get("role") == "student" else "mentor"
            text = (m.get("message") or m.get("text") or "").strip()
            if text:
                turns.append({"role": role, "text": text})
        opening = turns[:4]
        mentor = [t["text"] for t in opening if t["role"] == "mentor"]
        if len(opening) < 4 or not mentor:
            continue
        if any("?" not in m or words(m) > 120 or PREACHY.search(m) for m in mentor):
            continue
        out.append(
            {
                "id": f"legacy-{i:03d}",
                "domain": c.get("domain", "General"),
                "archetype": c.get("archetype", ""),
                "summary": (c.get("student_intro") or c.get("intro") or c.get("archetype", ""))[
                    :240
                ],
                "language": "en",
                "turns": opening,
                "source": "legacy-curated",
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--legacy", type=Path, help="original CONVERSATIONS.json (optional)")
    args = parser.parse_args()

    dialogues = load_authored()
    if args.legacy:
        legacy = curate_legacy(args.legacy)
        print(f"legacy: kept {len(legacy)} curated openings")
        dialogues += legacy

    ids = Counter(d["id"] for d in dialogues)
    errors = {d["id"]: check_dialogue(d) for d in dialogues}
    errors = {k: v for k, v in errors.items() if v}
    dupes = [k for k, v in ids.items() if v > 1]
    if errors or dupes:
        for k, v in errors.items():
            print(f"✗ {k}: {'; '.join(v)}")
        for k in dupes:
            print(f"✗ duplicate id {k}")
        return 1

    OUT_DATASET.write_text(
        "".join(json.dumps(d, ensure_ascii=False) + "\n" for d in dialogues), encoding="utf-8"
    )
    OUT_EXEMPLARS.parent.mkdir(parents=True, exist_ok=True)
    OUT_EXEMPLARS.write_text(
        "".join(
            json.dumps(
                {
                    "id": d["id"],
                    "domain": d["domain"],
                    "summary": d["summary"],
                    "turns": d["turns"],
                },
                ensure_ascii=False,
            )
            + "\n"
            for d in dialogues
        ),
        encoding="utf-8",
    )
    mentor_turns = [t for d in dialogues for t in d["turns"] if t["role"] == "mentor"]
    print(
        f"✓ {len(dialogues)} dialogues, {sum(len(d['turns']) for d in dialogues)} messages, "
        f"{len(mentor_turns)} mentor turns, "
        f"avg mentor length {sum(words(t['text']) for t in mentor_turns) / len(mentor_turns):.0f} words"
    )
    print("  domains:", dict(Counter(d["domain"] for d in dialogues).most_common()))
    print("  languages:", dict(Counter(d.get("language", "en") for d in dialogues)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
