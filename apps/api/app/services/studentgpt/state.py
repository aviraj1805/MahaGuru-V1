"""The "understanding record" StudentGPT keeps for each conversation, and the clarity summary."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Stage = Literal["opening", "exploring", "deepening", "reflecting", "clarity"]
STAGES: tuple[Stage, ...] = ("opening", "exploring", "deepening", "reflecting", "clarity")


def _cap(items: list[str], n: int = 6) -> list[str]:
    seen: list[str] = []
    for item in items:
        item = item.strip()
        if item and item not in seen:
            seen.append(item[:240])
    return seen[-n:]


class ConversationState(BaseModel):
    title: str = Field(default="New reflection", max_length=80)
    stage: Stage = "opening"
    presenting_concern: str = Field(default="", description="What the student says the problem is")
    context: list[str] = Field(
        default_factory=list, description="Facts about the student: course, year, situation"
    )
    reasons_explored: list[str] = Field(default_factory=list)
    beliefs_and_assumptions: list[str] = Field(
        default_factory=list, description="Beliefs, 'shoulds', fears or assumptions noticed"
    )
    emotions: list[str] = Field(default_factory=list)
    open_threads: list[str] = Field(
        default_factory=list, description="Things mentioned but not yet explored"
    )
    insights: list[str] = Field(
        default_factory=list, description="Realisations the student reached, in their words"
    )
    next_focus: str = Field(default="", description="The most useful thing to explore next")
    wants_advice: bool = Field(
        default=False, description="True if the student explicitly asked for advice/solutions"
    )
    risk_level: Literal["none", "elevated", "crisis"] = "none"
    risk_category: str | None = None

    @field_validator(
        "context",
        "reasons_explored",
        "beliefs_and_assumptions",
        "emotions",
        "open_threads",
        "insights",
    )
    @classmethod
    def _limit(cls, v: list[str]) -> list[str]:
        return _cap(v)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return v.strip().strip('"')[:80] or "New reflection"


class ClarityCard(BaseModel):
    came_with: str = Field(description="What the student came in with, one or two sentences")
    underneath: str = Field(description="What seems to sit underneath it (the root), 1-3 sentences")
    insights: list[str] = Field(description="2-5 realisations, in the student's own words")
    assumptions_to_question: list[str] = Field(
        default_factory=list, description="0-3 beliefs worth testing"
    )
    questions_to_sit_with: list[str] = Field(description="2-3 open questions for further thought")
    next_step: str | None = Field(
        default=None, description="One small experiment the student seemed ready for, or null"
    )
    learning_goal: str | None = Field(
        default=None,
        description="A concrete skill/learning goal that emerged (for Classroom), or null",
    )

    @field_validator("insights", "assumptions_to_question", "questions_to_sit_with")
    @classmethod
    def _limit(cls, v: list[str]) -> list[str]:
        return _cap(v, 5)


def public_state(state: dict) -> dict:
    """The part of the record the student can see in the 'what we've explored' panel."""
    s = ConversationState.model_validate(state or {})
    return {
        "stage": s.stage,
        "presenting_concern": s.presenting_concern,
        "insights": s.insights,
        "open_threads": s.open_threads,
    }
