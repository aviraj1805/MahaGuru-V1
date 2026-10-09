"""Classroom orchestration.

The Teacher is the only conversational agent. Assessment, planning, teaching content, practice and
grading are focused LLM functions with validated schemas. Progress, mastery and adaptation rules
are ordinary code over the database.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import (
    Assessment,
    Assignment,
    Classroom,
    Lesson,
    Mastery,
    Module,
    RoadmapRevision,
    TeacherMessage,
    User,
)
from app.services.classroom import prompts as P
from app.services.classroom.resources import verify_resources
from app.services.classroom.schemas import (
    AssessmentItem,
    AssessmentSet,
    AssignmentGrade,
    AssignmentPlan,
    GradeSet,
    IntakePlan,
    LessonContent,
    PlannedModule,
    RemedialContent,
    RoadmapPlan,
    RoadmapRevisionPlan,
)
from app.services.llm import ChatMessage, Usage, generate_structured, get_llm

PASS_SCORE = 0.7
WEAK_THRESHOLD = 0.6


def _now() -> datetime:
    return datetime.now(UTC)


def _main_model() -> str:
    return get_settings().llm_model


def _fast_model() -> str:
    return get_settings().llm_fast_model


def _merge(total: Usage, part: Usage) -> Usage:
    total.model = total.model or part.model
    total.input_tokens += part.input_tokens
    total.output_tokens += part.output_tokens
    return total


# ---------------------------------------------------------------- context helpers


async def load_tree(db: AsyncSession, classroom: Classroom) -> list[Module]:
    stmt = (
        select(Module)
        .where(Module.classroom_id == classroom.id)
        .order_by(Module.position)
        .options(selectinload(Module.lessons))
        .execution_options(populate_existing=True)
    )
    return list((await db.execute(stmt)).scalars().all())


def lessons_of(module: Module) -> list[Lesson]:
    return list(module.lessons)


async def mastery_map(db: AsyncSession, classroom_id: str) -> dict[str, Mastery]:
    rows = (
        (await db.execute(select(Mastery).where(Mastery.classroom_id == classroom_id)))
        .scalars()
        .all()
    )
    return {m.concept: m for m in rows}


def learner_context(classroom: Classroom, user: User) -> dict[str, Any]:
    return {
        "goal": classroom.goal_text,
        "intake_answers": _qa_pairs(classroom),
        "learner_profile": classroom.learner_profile or {},
        "student_profile": user.profile or {},
    }


def _qa_pairs(classroom: Classroom) -> list[dict[str, str]]:
    intake = classroom.intake or {}
    answers = intake.get("answers") or {}
    return [
        {"question": q["question"], "answer": str(answers.get(q["id"], ""))}
        for q in intake.get("questions", [])
        if answers.get(q["id"])
    ]


def public_items(items: list[dict]) -> list[dict]:
    """Strip answer keys and rubrics before sending an assessment to the browser."""
    keep = ("id", "type", "question", "options", "concept", "difficulty")
    return [{k: i.get(k) for k in keep} for i in items]


# ---------------------------------------------------------------- 1. intake


async def plan_intake(user: User, goal: str) -> tuple[IntakePlan, Usage]:
    prompt = P.as_json({"goal": goal, "student_profile": user.profile or {}})
    return await generate_structured(
        get_llm(),
        IntakePlan,
        task="classroom_intake",
        system=P.TEACHER_PERSONA + "\n\n" + P.INTAKE_TASK,
        prompt=prompt,
        model=_fast_model(),
        temperature=0.4,
        max_tokens=1200,
    )


# ---------------------------------------------------------------- 2. diagnostic


async def create_diagnostic(
    db: AsyncSession, classroom: Classroom, user: User
) -> tuple[Assessment, Usage]:
    plan, usage = await generate_structured(
        get_llm(),
        AssessmentSet,
        task="classroom_diagnostic",
        system=P.TEACHER_PERSONA + "\n\n" + P.DIAGNOSTIC_TASK,
        prompt=P.as_json(learner_context(classroom, user)),
        model=_main_model(),
        temperature=0.5,
        max_tokens=4000,
    )
    assessment = Assessment(
        classroom_id=classroom.id,
        kind="diagnostic",
        items=[i.model_dump() for i in plan.items],
    )
    db.add(assessment)
    classroom.status = "diagnostic"
    return assessment, usage


async def grade(items: list[dict], responses: dict[str, Any]) -> tuple[list[dict], float, Usage]:
    """MCQs are graded deterministically; short answers in one batched LLM call."""
    results: dict[str, dict] = {}
    short_payload = []
    for raw in items:
        item = AssessmentItem.model_validate(raw)
        answer = responses.get(item.id)
        if item.type == "mcq":
            try:
                chosen = int(answer) if answer is not None and answer != "" else None
            except (TypeError, ValueError):
                chosen = None
            correct = chosen is not None and chosen == item.answer_index
            results[item.id] = {
                "id": item.id,
                "score": 1.0 if correct else 0.0,
                "correct_index": item.answer_index,
                "chosen_index": chosen,
                "feedback": item.explanation,
            }
        else:
            text = str(answer or "").strip()
            if not text:
                results[item.id] = {
                    "id": item.id,
                    "score": 0.0,
                    "feedback": "No answer given. " + item.explanation,
                }
            else:
                short_payload.append(
                    {
                        "id": item.id,
                        "question": item.question,
                        "rubric": item.rubric,
                        "answer": text,
                    }
                )
    usage = Usage()
    if short_payload:
        graded, usage = await generate_structured(
            get_llm(),
            GradeSet,
            task="classroom_grade",
            system=P.TEACHER_PERSONA + "\n\n" + P.GRADE_TASK,
            prompt=P.as_json(short_payload),
            model=_fast_model(),
            temperature=0.1,
            max_tokens=1500,
        )
        by_id = {g.id: g for g in graded.grades}
        for p in short_payload:
            g = by_id.get(p["id"])
            results[p["id"]] = {
                "id": p["id"],
                "score": round(g.score, 2) if g else 0.0,
                "feedback": g.feedback if g else "We could not grade this answer automatically.",
            }
    ordered = [results[i["id"]] for i in items]
    for r, i in zip(ordered, items, strict=True):
        r["explanation"] = i.get("explanation", "")
    score = sum(r["score"] for r in ordered) / max(1, len(ordered))
    return ordered, round(score, 3), usage


async def update_mastery(
    db: AsyncSession, classroom_id: str, items: list[dict], results: list[dict]
) -> None:
    existing = await mastery_map(db, classroom_id)
    per_concept: dict[str, list[float]] = {}
    for item, result in zip(items, results, strict=True):
        per_concept.setdefault(item.get("concept") or "general", []).append(result["score"])
    for concept, scores in per_concept.items():
        observed = sum(scores) / len(scores)
        row = existing.get(concept)
        if row is None:
            row = Mastery(classroom_id=classroom_id, concept=concept, score=observed, attempts=1)
            db.add(row)
            existing[concept] = row
        else:
            # Recent evidence counts more, but one bad quiz does not wipe out history.
            row.score = round(0.4 * row.score + 0.6 * observed, 3)
            row.attempts += 1


# ---------------------------------------------------------------- 3. roadmap


async def generate_roadmap(
    db: AsyncSession, classroom: Classroom, user: User, diagnostic: Assessment | None
) -> Usage:
    ctx = learner_context(classroom, user)
    if diagnostic is not None and diagnostic.results:
        ctx["diagnostic"] = [
            {
                "concept": i.get("concept"),
                "difficulty": i.get("difficulty"),
                "question": i.get("question"),
                "score": r.get("score"),
            }
            for i, r in zip(diagnostic.items, diagnostic.results, strict=True)
        ]
    else:
        ctx["diagnostic"] = "skipped: the student says they are starting from scratch"
    plan, usage = await generate_structured(
        get_llm(),
        RoadmapPlan,
        task="classroom_roadmap",
        system=P.TEACHER_PERSONA + "\n\n" + P.ROADMAP_TASK,
        prompt=P.as_json(ctx),
        model=_main_model(),
        temperature=0.5,
        max_tokens=6000,
    )
    classroom.learner_profile = plan.profile.model_dump()
    classroom.roadmap_summary = plan.summary
    await _write_modules(db, classroom, plan.modules, start_position=0)
    classroom.roadmap_version = 1
    classroom.status = "active"
    db.add(
        RoadmapRevision(
            classroom_id=classroom.id,
            version=1,
            status="applied",
            reason="Initial roadmap",
            change_summary=plan.summary,
            snapshot={"modules": [m.model_dump() for m in plan.modules]},
        )
    )
    return usage


async def _write_modules(
    db: AsyncSession, classroom: Classroom, modules: list[PlannedModule], start_position: int
) -> None:
    for mi, pm in enumerate(modules):
        module = Module(
            classroom_id=classroom.id,
            position=start_position + mi,
            title=pm.title[:200],
            summary=pm.summary,
            milestone=pm.milestone,
        )
        db.add(module)
        await db.flush()
        for li, pl in enumerate(pm.lessons):
            db.add(
                Lesson(
                    module_id=module.id,
                    classroom_id=classroom.id,
                    position=(start_position + mi) * 100 + li,
                    title=pl.title[:200],
                    objectives=pl.objectives,
                    concepts=pl.concepts,
                    est_minutes=pl.est_minutes,
                )
            )


# ---------------------------------------------------------------- 4. lessons


async def weak_concepts(db: AsyncSession, classroom_id: str) -> list[str]:
    return sorted(
        c for c, m in (await mastery_map(db, classroom_id)).items() if m.score < WEAK_THRESHOLD
    )


async def ensure_lesson_content(
    db: AsyncSession, classroom: Classroom, user: User, lesson: Lesson
) -> Usage | None:
    if lesson.content_md:
        return None
    module = await db.get(Module, lesson.module_id)
    ctx = learner_context(classroom, user) | {
        "module": {"title": module.title, "milestone": module.milestone} if module else {},
        "lesson": {
            "title": lesson.title,
            "objectives": lesson.objectives,
            "concepts": lesson.concepts,
            "minutes": lesson.est_minutes,
        },
        "weak_concepts": await weak_concepts(db, classroom.id),
    }
    content, usage = await generate_structured(
        get_llm(),
        LessonContent,
        task="classroom_lesson",
        system=P.TEACHER_PERSONA + "\n\n" + P.LESSON_TASK,
        prompt=P.as_json(ctx),
        model=_main_model(),
        temperature=0.6,
        max_tokens=6000,
    )
    lesson.content_md = content.content_md
    lesson.key_takeaways = content.key_takeaways
    lesson.resources = await verify_resources(content.resources)
    return usage


async def create_quiz(
    db: AsyncSession, classroom: Classroom, user: User, lesson: Lesson
) -> tuple[Assessment, Usage]:
    weak = [c for c in await weak_concepts(db, classroom.id) if c in lesson.concepts]
    ctx = {
        "learner_profile": classroom.learner_profile,
        "lesson": {
            "title": lesson.title,
            "objectives": lesson.objectives,
            "concepts": lesson.concepts,
            "content_excerpt": (lesson.content_md or "")[:3500],
        },
        "weak_concepts": weak,
    }
    plan, usage = await generate_structured(
        get_llm(),
        AssessmentSet,
        task="classroom_quiz",
        system=P.TEACHER_PERSONA + "\n\n" + P.QUIZ_TASK,
        prompt=P.as_json(ctx),
        model=_fast_model(),
        temperature=0.6,
        max_tokens=3500,
    )
    quiz = Assessment(
        classroom_id=classroom.id,
        lesson_id=lesson.id,
        kind="quiz",
        items=[i.model_dump() for i in plan.items],
    )
    db.add(quiz)
    return quiz, usage


async def apply_quiz_result(
    db: AsyncSession, classroom: Classroom, lesson: Lesson, quiz: Assessment
) -> Usage | None:
    """Adaptation rule: pass -> complete; otherwise mark for review with a fresh explanation."""
    score = quiz.score or 0.0
    lesson.best_score = max(lesson.best_score or 0.0, score)
    if score >= PASS_SCORE:
        lesson.status = "completed"
        lesson.completed_at = lesson.completed_at or _now()
        lesson.remedial_md = None
        await _maybe_complete_classroom(db, classroom)
        return None
    if lesson.status != "completed":
        lesson.status = "needs_review"
    missed = [
        {
            "question": i["question"],
            "concept": i.get("concept"),
            "student_answer": quiz.responses.get(i["id"]),
            "explanation": i.get("explanation"),
        }
        for i, r in zip(quiz.items, quiz.results, strict=True)
        if r["score"] < 0.7
    ]
    remedial, usage = await generate_structured(
        get_llm(),
        RemedialContent,
        task="classroom_remedial",
        system=P.TEACHER_PERSONA + "\n\n" + P.REMEDIAL_TASK,
        prompt=P.as_json(
            {"lesson": lesson.title, "learner_profile": classroom.learner_profile, "missed": missed}
        ),
        model=_main_model(),
        temperature=0.6,
        max_tokens=2500,
    )
    lesson.remedial_md = remedial.content_md
    return usage


async def _maybe_complete_classroom(db: AsyncSession, classroom: Classroom) -> None:
    await db.flush()
    statuses = (
        (await db.execute(select(Lesson.status).where(Lesson.classroom_id == classroom.id)))
        .scalars()
        .all()
    )
    if statuses and all(s == "completed" for s in statuses):
        classroom.status = "completed"


async def mark_complete(db: AsyncSession, classroom: Classroom, lesson: Lesson) -> None:
    lesson.status = "completed"
    lesson.completed_at = lesson.completed_at or _now()
    await _maybe_complete_classroom(db, classroom)


# ---------------------------------------------------------------- 5. teacher chat


async def teacher_context(
    db: AsyncSession, classroom: Classroom, user: User, lesson: Lesson | None
) -> dict:
    ctx = learner_context(classroom, user) | {
        "weak_concepts": await weak_concepts(db, classroom.id),
        "progress": (await progress(db, classroom))["summary"],
    }
    if lesson is not None:
        ctx["current_lesson"] = {
            "title": lesson.title,
            "objectives": lesson.objectives,
            "status": lesson.status,
            "content_excerpt": (lesson.content_md or "")[:4000],
        }
    return ctx


def chat_messages(history: list[TeacherMessage], content: str) -> list[ChatMessage]:
    msgs = [ChatMessage(m.role, m.content) for m in history[-14:]]  # type: ignore[arg-type]
    msgs.append(ChatMessage("user", content))
    return msgs


async def stream_teacher(system: str, messages: list[ChatMessage], usage: Usage):
    async for chunk in get_llm().stream(
        system=system,
        messages=messages,
        model=_main_model(),
        temperature=0.5,
        max_tokens=1500,
        task="classroom_teacher",
        usage=usage,
    ):
        yield chunk


# ---------------------------------------------------------------- 6. assignments


async def create_assignment(
    db: AsyncSession, classroom: Classroom, user: User, module: Module
) -> tuple[Assignment, Usage]:
    lessons = (
        (
            await db.execute(
                select(Lesson).where(Lesson.module_id == module.id).order_by(Lesson.position)
            )
        )
        .scalars()
        .all()
    )
    ctx = learner_context(classroom, user) | {
        "module": {
            "title": module.title,
            "summary": module.summary,
            "milestone": module.milestone,
            "lessons": [{"title": x.title, "objectives": x.objectives} for x in lessons],
        }
    }
    plan, usage = await generate_structured(
        get_llm(),
        AssignmentPlan,
        task="classroom_assignment",
        system=P.TEACHER_PERSONA + "\n\n" + P.ASSIGNMENT_TASK,
        prompt=P.as_json(ctx),
        model=_main_model(),
        temperature=0.6,
        max_tokens=3000,
    )
    assignment = Assignment(
        classroom_id=classroom.id,
        module_id=module.id,
        brief_md=plan.brief_md,
        deliverables=plan.deliverables[:6],
        rubric=[c.model_dump() for c in plan.rubric[:5]],
    )
    db.add(assignment)
    return assignment, usage


async def grade_assignment(
    classroom: Classroom, assignment: Assignment, submission: str
) -> tuple[dict, float, Usage]:
    graded, usage = await generate_structured(
        get_llm(),
        AssignmentGrade,
        task="classroom_assignment_grade",
        system=P.TEACHER_PERSONA + "\n\n" + P.ASSIGNMENT_GRADE_TASK,
        prompt=P.as_json(
            {
                "learner_profile": classroom.learner_profile,
                "brief": assignment.brief_md,
                "rubric": assignment.rubric,
                "submission": submission,
            }
        ),
        model=_main_model(),
        temperature=0.2,
        max_tokens=2500,
    )
    max_points = {c["criterion"]: c["points"] for c in assignment.rubric}
    total_max = sum(max_points.values()) or 1
    awarded = 0.0
    scores = []
    for s in graded.scores:
        cap = max_points.get(s.criterion)
        if cap is None:
            continue
        pts = min(float(s.points_awarded), float(cap))
        awarded += pts
        scores.append({"criterion": s.criterion, "points": pts, "max": cap, "comment": s.comment})
    feedback = {
        "scores": scores,
        "overall_feedback_md": graded.overall_feedback_md,
        "next_improvements": graded.next_improvements[:4],
    }
    return feedback, round(awarded / total_max, 3), usage


# ---------------------------------------------------------------- 7. roadmap revisions


async def propose_revision(
    db: AsyncSession, classroom: Classroom, user: User, reason: str
) -> tuple[RoadmapRevision, Usage]:
    modules = await load_tree(db, classroom)
    mastery = await mastery_map(db, classroom.id)
    ctx = learner_context(classroom, user) | {
        "reason_for_change": reason,
        "completed_lessons": [
            lsn.title for m in modules for lsn in lessons_of(m) if lsn.status == "completed"
        ],
        "struggled_lessons": [
            lsn.title for m in modules for lsn in lessons_of(m) if lsn.status == "needs_review"
        ],
        "remaining_plan": [
            {
                "module": m.title,
                "lessons": [lsn.title for lsn in lessons_of(m) if lsn.status != "completed"],
            }
            for m in modules
            if any(lsn.status != "completed" for lsn in lessons_of(m))
        ],
        "mastery": {c: round(v.score, 2) for c, v in mastery.items()},
    }
    plan, usage = await generate_structured(
        get_llm(),
        RoadmapRevisionPlan,
        task="classroom_revision",
        system=P.TEACHER_PERSONA + "\n\n" + P.REVISION_TASK,
        prompt=P.as_json(ctx),
        model=_main_model(),
        temperature=0.5,
        max_tokens=6000,
    )
    # Only one pending proposal at a time.
    for old in (
        await db.execute(
            select(RoadmapRevision).where(
                RoadmapRevision.classroom_id == classroom.id, RoadmapRevision.status == "proposed"
            )
        )
    ).scalars():
        old.status = "discarded"
    revision = RoadmapRevision(
        classroom_id=classroom.id,
        version=classroom.roadmap_version + 1,
        status="proposed",
        reason=reason,
        change_summary=plan.change_summary,
        snapshot={"modules": [m.model_dump() for m in plan.modules]},
    )
    db.add(revision)
    return revision, usage


async def apply_revision(db: AsyncSession, classroom: Classroom, revision: RoadmapRevision) -> None:
    if revision.status != "proposed":
        raise AppError(409, "not_pending", "This roadmap change is no longer pending.")
    modules = await load_tree(db, classroom)
    keep_position = 0
    for m in modules:
        done = [lsn for lsn in lessons_of(m) if lsn.status == "completed"]
        for lsn in lessons_of(m):
            if lsn.status != "completed":
                await db.delete(lsn)
        if done:
            keep_position = max(keep_position, m.position + 1)
        else:
            await db.delete(m)
    await db.flush()
    new_modules = [PlannedModule.model_validate(m) for m in revision.snapshot["modules"]]
    await _write_modules(db, classroom, new_modules, start_position=keep_position)
    revision.status = "applied"
    classroom.roadmap_version = revision.version
    classroom.roadmap_summary = revision.change_summary
    if classroom.status == "completed":
        classroom.status = "active"
    classroom.last_lesson_id = None


# ---------------------------------------------------------------- 8. progress


async def progress(db: AsyncSession, classroom: Classroom) -> dict:
    modules = await load_tree(db, classroom)
    all_lessons = [lsn for m in modules for lsn in lessons_of(m)]
    done = [lsn for lsn in all_lessons if lsn.status == "completed"]
    review = [lsn for lsn in all_lessons if lsn.status == "needs_review"]
    remaining = [lsn for lsn in all_lessons if lsn.status != "completed"]
    next_lesson = (review or remaining or [None])[0]
    minutes_left = sum(lsn.est_minutes for lsn in remaining)
    mastery = await mastery_map(db, classroom.id)
    module_progress = []
    for m in modules:
        ls = lessons_of(m)
        c = sum(1 for lsn in ls if lsn.status == "completed")
        module_progress.append(
            {"id": m.id, "completed": c, "total": len(ls), "done": bool(ls) and c == len(ls)}
        )
    return {
        "summary": {
            "lessons_total": len(all_lessons),
            "lessons_completed": len(done),
            "percent": round(100 * len(done) / len(all_lessons)) if all_lessons else 0,
            "needs_review": len(review),
            "minutes_remaining": minutes_left,
            "milestones_reached": sum(1 for mp in module_progress if mp["done"]),
            "milestones_total": len(modules),
        },
        "next_lesson_id": next_lesson.id if next_lesson else None,
        "next_lesson_title": next_lesson.title if next_lesson else None,
        "modules": module_progress,
        "mastery": sorted(
            (
                {"concept": c, "score": round(v.score, 2), "attempts": v.attempts}
                for c, v in mastery.items()
            ),
            key=lambda x: x["score"],
        ),
    }
