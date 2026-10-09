"""Retrieve a couple of reference dialogues that match the student's situation (BM25, no API calls).

The library lives in data/exemplars.jsonl and is built by scripts/build_dataset.py from the
curated MahaGuru reflective-dialogue dataset.
"""

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

LIBRARY = Path(__file__).parent / "data" / "exemplars.jsonl"

_STOP = set(
    """a an the and or but if then so to of in on at for with from by is am are was were be been
    being i me my we you your he she they it this that these those do does did have has had not no
    yes can could would should will just very really also about what why how when where who which
    there here than too as into out up down over more most some any all much many get got like feel
    feeling think know want im i'm dont don't its it's""".split()
)
_TOKEN = re.compile(r"[a-z]+")


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP and len(t) > 2]


@dataclass(frozen=True)
class Exemplar:
    id: str
    domain: str
    summary: str
    turns: tuple[tuple[str, str], ...]

    def render(self, max_turns: int = 6) -> str:
        lines = [f"[{self.domain}] {self.summary}"]
        for role, text in self.turns[:max_turns]:
            who = "Student" if role == "student" else "Mentor"
            lines.append(f"{who}: {text}")
        return "\n".join(lines)


class ExemplarIndex:
    def __init__(self, exemplars: list[Exemplar], k1: float = 1.4, b: float = 0.75):
        self.exemplars = exemplars
        self.k1, self.b = k1, b
        self.docs = [self._doc_tokens(e) for e in exemplars]
        self.avgdl = sum(len(d) for d in self.docs) / max(1, len(self.docs))
        df: Counter[str] = Counter()
        for d in self.docs:
            df.update(set(d))
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = [Counter(d) for d in self.docs]

    @staticmethod
    def _doc_tokens(e: Exemplar) -> list[str]:
        student_text = " ".join(t for r, t in e.turns if r == "student")
        # Domain and summary weigh more than the dialogue body.
        return tokenize(f"{e.domain} {e.domain} {e.summary} {e.summary} {student_text}")

    def search(self, query: str, k: int = 2) -> list[Exemplar]:
        terms = tokenize(query)
        if not terms or not self.exemplars:
            return []
        scores = []
        for i, tf in enumerate(self.tf):
            dl = len(self.docs[i])
            s = 0.0
            for t in terms:
                if t in tf:
                    f = tf[t]
                    s += (
                        self.idf[t]
                        * f
                        * (self.k1 + 1)
                        / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
                    )
            scores.append((s, i))
        scores.sort(reverse=True)
        return [self.exemplars[i] for s, i in scores[:k] if s > 0]


def load_exemplars(path: Path = LIBRARY) -> list[Exemplar]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        out.append(
            Exemplar(
                id=row["id"],
                domain=row["domain"],
                summary=row["summary"],
                turns=tuple((t["role"], t["text"]) for t in row["turns"]),
            )
        )
    return out


@lru_cache
def get_index() -> ExemplarIndex:
    return ExemplarIndex(load_exemplars())
