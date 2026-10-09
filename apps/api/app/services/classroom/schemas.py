"""Shapes the Classroom LLM functions must return. Validated with Pydantic before anything is saved."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def _clean(items: list[str], n: int) -> list[str]:
    out: list[str] = []
    for i in items:
        i = (i or "").strip()
        if i and i not in out:
            out.append(i[:200])
    return out[:n]


class IntakeQuestion(BaseModel):
    id: str = Field(description="short slug, e.g. 'experience'")
    question: str = Field(max_length=200)
    options: list[str] = Field(
        default_factory=list, description="2-5 short answer options; empty for free text"
    )
    allow_free_text: bool = True

    @field_validator("options")
    @classmethod
    def _opts(cls, v: list[str]) -> list[str]:
        return _clean(v, 5)


class IntakePlan(BaseModel):
    title: str = Field(description="Concise classroom title, max 8 words")
    goal_restated: str = Field(description="The goal restated clearly in one sentence")
    questions: list[IntakeQuestion] = Field(description="2-4 clarifying questions")

    @field_validator("questions")
    @classmethod
    def _n(cls, v: list[IntakeQuestion]) -> list[IntakeQuestion]:
        if not v:
            raise ValueError("at least one question is required")
        ids: set[str] = set()
        for i, q in enumerate(v):
            if not q.id or q.id in ids:
                q.id = f"q{i + 1}"
            ids.add(q.id)
        return v[:4]


class AssessmentItem(BaseModel):
    id: str
    type: Literal["mcq", "short"]
    question: str
    options: list[str] = Field(default_factory=list, description="mcq only: 3-5 options")
    answer_index: int | None = Field(default=None, description="mcq only: index of correct option")
    rubric: str = Field(default="", description="short only: what a good answer must contain")
    explanation: str = Field(default="", description="why the answer is right, 1-2 sentences")
    concept: str = Field(description="the concept this item tests (short name)")
    difficulty: Literal["easy", "medium", "hard"] = "medium"

    @model_validator(mode="after")
    def _check(self) -> "AssessmentItem":
        if self.type == "mcq":
            self.options = _clean(self.options, 5)
            if len(self.options) < 2:
                raise ValueError("mcq needs at least 2 options")
            if self.answer_index is None or not 0 <= self.answer_index < len(self.options):
                raise ValueError("mcq answer_index must point at an option")
        elif not self.rubric:
            raise ValueError("short items need a rubric")
        self.concept = self.concept.strip().lower()[:120] or "general"
        return self


class AssessmentSet(BaseModel):
    items: list[AssessmentItem]

    @field_validator("items")
    @classmethod
    def _ids(cls, v: list[AssessmentItem]) -> list[AssessmentItem]:
        if len(v) < 2:
            raise ValueError("need at least 2 items")
        for i, item in enumerate(v):
            item.id = f"i{i + 1}"
        return v[:10]


class GradedAnswer(BaseModel):
    id: str
    score: float = Field(ge=0, le=1, description="0 = wrong, 1 = fully correct, partial allowed")
    feedback: str = Field(description="1-2 sentences, encouraging and specific")


class GradeSet(BaseModel):
    grades: list[GradedAnswer]


class PlannedLesson(BaseModel):
    title: str
    objectives: list[str] = Field(description="2-4 measurable objectives")
    concepts: list[str] = Field(description="1-4 short concept names")
    est_minutes: int = Field(default=30, ge=5, le=240)

    @field_validator("objectives")
    @classmethod
    def _o(cls, v: list[str]) -> list[str]:
        return _clean(v, 4)

    @field_validator("concepts")
    @classmethod
    def _c(cls, v: list[str]) -> list[str]:
        return [c.lower() for c in _clean(v, 4)] or ["general"]


class PlannedModule(BaseModel):
    title: str
    summary: str
    milestone: str = Field(description="What the student can do/build after this module")
    lessons: list[PlannedLesson]

    @field_validator("lessons")
    @classmethod
    def _l(cls, v: list[PlannedLesson]) -> list[PlannedLesson]:
        if not v:
            raise ValueError("module needs lessons")
        return v[:6]


class LearnerProfile(BaseModel):
    level: Literal["beginner", "intermediate", "advanced"]
    summary: str = Field(description="2-3 sentences about where the student is starting from")
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)


class RoadmapPlan(BaseModel):
    summary: str = Field(description="2-3 sentences: the path from current level to the goal")
    profile: LearnerProfile
    modules: list[PlannedModule] = Field(description="3-6 modules in order")

    @field_validator("modules")
    @classmethod
    def _m(cls, v: list[PlannedModule]) -> list[PlannedModule]:
        if not v:
            raise ValueError("roadmap needs modules")
        return v[:7]


class RoadmapRevisionPlan(BaseModel):
    change_summary: str = Field(description="2-4 sentences explaining what changed and why")
    modules: list[PlannedModule] = Field(description="The NEW plan for all not-yet-completed work")


class ResourceSuggestion(BaseModel):
    title: str
    url: str
    kind: Literal["docs", "article", "course", "video", "book", "tool", "practice"] = "article"
    why: str = Field(default="", description="one line: why this helps")


class LessonContent(BaseModel):
    content_md: str = Field(description="The lesson in Markdown (explanation, example, recap)")
    key_takeaways: list[str] = Field(description="3-5 one-line takeaways")
    resources: list[ResourceSuggestion] = Field(default_factory=list)

    @field_validator("key_takeaways")
    @classmethod
    def _k(cls, v: list[str]) -> list[str]:
        return _clean(v, 5)


class RemedialContent(BaseModel):
    content_md: str = Field(description="Targeted re-explanation of the missed ideas, in Markdown")


class RubricCriterion(BaseModel):
    criterion: str
    description: str
    points: int = Field(ge=1, le=10)


class AssignmentPlan(BaseModel):
    brief_md: str = Field(description="Project brief in Markdown: context, task, constraints")
    deliverables: list[str]
    rubric: list[RubricCriterion] = Field(description="3-5 criteria")


class CriterionScore(BaseModel):
    criterion: str
    points_awarded: float = Field(ge=0)
    comment: str


class AssignmentGrade(BaseModel):
    scores: list[CriterionScore]
    overall_feedback_md: str
    next_improvements: list[str] = Field(default_factory=list)
