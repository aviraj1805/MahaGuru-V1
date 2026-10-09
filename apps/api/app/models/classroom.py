from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, utcnow


class Classroom(IdMixin, TimestampMixin, Base):
    """One learning goal and everything generated for it."""

    __tablename__ = "classrooms"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    goal_text: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(160))
    # intake -> diagnostic -> active -> completed
    status: Mapped[str] = mapped_column(String(20), default="intake")
    # {"questions": [...], "answers": {qid: answer}}
    intake: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # {"level": ..., "summary": ..., "strengths": [...], "gaps": [...], "preferences": {...}}
    learner_profile: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    roadmap_summary: Mapped[str | None] = mapped_column(Text)
    roadmap_version: Mapped[int] = mapped_column(Integer, default=0)
    last_lesson_id: Mapped[str | None] = mapped_column(String(36))

    modules: Mapped[list["Module"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan", order_by="Module.position"
    )


class Module(IdMixin, Base):
    __tablename__ = "cr_modules"

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    milestone: Mapped[str] = mapped_column(Text, default="")

    classroom: Mapped[Classroom] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )


class Lesson(IdMixin, Base):
    __tablename__ = "cr_lessons"

    module_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cr_modules.id", ondelete="CASCADE"), index=True
    )
    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    objectives: Mapped[list[str]] = mapped_column(JSON, default=list)
    concepts: Mapped[list[str]] = mapped_column(JSON, default=list)
    est_minutes: Mapped[int] = mapped_column(Integer, default=30)
    # not_started | in_progress | needs_review | completed
    status: Mapped[str] = mapped_column(String(20), default="not_started")
    content_md: Mapped[str | None] = mapped_column(Text)
    key_takeaways: Mapped[list[str]] = mapped_column(JSON, default=list)
    resources: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    remedial_md: Mapped[str | None] = mapped_column(Text)
    best_score: Mapped[float | None] = mapped_column(Float)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    module: Mapped[Module] = relationship(back_populates="lessons")


class Assessment(IdMixin, Base):
    """A diagnostic or lesson quiz. `items` contain answer keys and are never sent raw."""

    __tablename__ = "cr_assessments"

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    lesson_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cr_lessons.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))  # diagnostic | quiz
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | graded
    responses: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Assignment(IdMixin, Base):
    """A practical project for a module, graded against a rubric."""

    __tablename__ = "cr_assignments"

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    module_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cr_modules.id", ondelete="CASCADE"), index=True
    )
    brief_md: Mapped[str] = mapped_column(Text)
    deliverables: Mapped[list[str]] = mapped_column(JSON, default=list)
    rubric: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    submission: Mapped[str | None] = mapped_column(Text)
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | graded
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Mastery(IdMixin, Base):
    """Per-concept mastery estimate in [0, 1], updated from every graded item."""

    __tablename__ = "cr_mastery"
    __table_args__ = (UniqueConstraint("classroom_id", "concept"),)

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    concept: Mapped[str] = mapped_column(String(120))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class TeacherMessage(IdMixin, Base):
    __tablename__ = "cr_teacher_messages"

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    lesson_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cr_lessons.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(12))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RoadmapRevision(IdMixin, Base):
    """Every roadmap version, plus pending proposals the student has not accepted yet."""

    __tablename__ = "cr_roadmap_revisions"

    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # applied | proposed | discarded
    reason: Mapped[str] = mapped_column(Text, default="")
    change_summary: Mapped[str] = mapped_column(Text, default="")
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
