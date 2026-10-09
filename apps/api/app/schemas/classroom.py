from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ClassroomCreateIn(BaseModel):
    goal: str = Field(min_length=5, max_length=600)

    @field_validator("goal")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 5:
            raise ValueError("Describe your goal in a few more words")
        return v


class IntakeAnswersIn(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)
    skip_diagnostic: bool = False

    @field_validator("answers")
    @classmethod
    def _limit(cls, v: dict[str, str]) -> dict[str, str]:
        return {k[:40]: str(a).strip()[:500] for k, a in list(v.items())[:10]}


class ResponsesIn(BaseModel):
    responses: dict[str, str | int | None] = Field(default_factory=dict)

    @field_validator("responses")
    @classmethod
    def _limit(cls, v: dict) -> dict:
        return {
            k[:10]: (a.strip()[:2000] if isinstance(a, str) else a) for k, a in list(v.items())[:12]
        }


class TeacherMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=3000)
    lesson_id: str | None = None


class SubmissionIn(BaseModel):
    submission: str = Field(min_length=20, max_length=8000)


class RevisionIn(BaseModel):
    reason: str = Field(min_length=5, max_length=800)


class ClassroomSummary(BaseModel):
    id: str
    title: str
    goal_text: str
    status: str
    percent: int
    next_lesson_id: str | None
    next_lesson_title: str | None
    updated_at: datetime


class LessonOut(BaseModel):
    id: str
    module_id: str
    title: str
    objectives: list[str]
    concepts: list[str]
    est_minutes: int
    status: str
    best_score: float | None
    has_content: bool


class ModuleOut(BaseModel):
    id: str
    position: int
    title: str
    summary: str
    milestone: str
    lessons: list[LessonOut]
    assignment: dict[str, Any] | None = None


class ClassroomOut(BaseModel):
    id: str
    title: str
    goal_text: str
    status: str
    intake: dict[str, Any]
    learner_profile: dict[str, Any]
    roadmap_summary: str | None
    roadmap_version: int
    modules: list[ModuleOut]
    progress: dict[str, Any] | None
    pending_assessment: dict[str, Any] | None
    pending_revision: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class AssessmentOut(BaseModel):
    id: str
    kind: str
    lesson_id: str | None
    status: str
    items: list[dict[str, Any]]
    results: list[dict[str, Any]] | None = None
    responses: dict[str, Any] | None = None
    score: float | None = None


class LessonDetailOut(LessonOut):
    module_title: str
    content_md: str | None
    key_takeaways: list[str]
    resources: list[dict[str, Any]]
    remedial_md: str | None
    latest_quiz: AssessmentOut | None
    chat: list[dict[str, Any]]
    prev_lesson_id: str | None
    next_lesson_id: str | None
