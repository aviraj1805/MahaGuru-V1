import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, owned
from app.api.sse import detached, sse, sse_response
from app.core.errors import AppError
from app.db import session as db_session
from app.models import (
    Assessment,
    Assignment,
    Classroom,
    Lesson,
    Module,
    RoadmapRevision,
    TeacherMessage,
    User,
)
from app.schemas.classroom import (
    AssessmentOut,
    ClassroomCreateIn,
    ClassroomOut,
    ClassroomSummary,
    IntakeAnswersIn,
    LessonDetailOut,
    LessonOut,
    ModuleOut,
    ResponsesIn,
    RevisionIn,
    SubmissionIn,
    TeacherMessageIn,
)
from app.services import quota
from app.services.classroom import engine
from app.services.classroom.prompts import teacher_chat_system
from app.services.llm import LLMError, Usage

log = logging.getLogger("mahaguru.classroom")
router = APIRouter(prefix="/classroom", tags=["classroom"])
_teacher_busy: set[str] = set()


# ---------------------------------------------------------------- helpers


async def _classroom(db, cid: str, user: User) -> Classroom:
    return await owned(db, Classroom, cid, user, "Classroom")


async def _lesson(db, classroom: Classroom, lesson_id: str) -> Lesson:
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None or lesson.classroom_id != classroom.id:
        raise AppError(404, "not_found", "Lesson not found.")
    return lesson


def _lesson_out(lesson: Lesson) -> LessonOut:
    return LessonOut(
        id=lesson.id,
        module_id=lesson.module_id,
        title=lesson.title,
        objectives=lesson.objectives,
        concepts=lesson.concepts,
        est_minutes=lesson.est_minutes,
        status=lesson.status,
        best_score=lesson.best_score,
        has_content=bool(lesson.content_md),
    )


def _assessment_out(a: Assessment) -> AssessmentOut:
    graded = a.status == "graded"
    return AssessmentOut(
        id=a.id,
        kind=a.kind,
        lesson_id=a.lesson_id,
        status=a.status,
        items=engine.public_items(a.items),
        results=a.results if graded else None,
        responses=a.responses if graded else None,
        score=a.score if graded else None,
    )


def _assignment_out(a: Assignment | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a.id,
        "brief_md": a.brief_md,
        "deliverables": a.deliverables,
        "rubric": a.rubric,
        "submission": a.submission,
        "feedback": a.feedback,
        "score": a.score,
        "status": a.status,
    }


async def _classroom_out(db, classroom: Classroom) -> ClassroomOut:
    modules = await engine.load_tree(db, classroom)
    assignments = {
        a.module_id: a
        for a in (
            await db.execute(
                select(Assignment)
                .where(Assignment.classroom_id == classroom.id)
                .order_by(Assignment.created_at)
            )
        ).scalars()
    }
    pending = (
        await db.execute(
            select(Assessment).where(
                Assessment.classroom_id == classroom.id,
                Assessment.kind == "diagnostic",
                Assessment.status == "pending",
            )
        )
    ).scalar_one_or_none()
    revision = (
        await db.execute(
            select(RoadmapRevision).where(
                RoadmapRevision.classroom_id == classroom.id, RoadmapRevision.status == "proposed"
            )
        )
    ).scalar_one_or_none()
    return ClassroomOut(
        id=classroom.id,
        title=classroom.title,
        goal_text=classroom.goal_text,
        status=classroom.status,
        intake=classroom.intake or {},
        learner_profile=classroom.learner_profile or {},
        roadmap_summary=classroom.roadmap_summary,
        roadmap_version=classroom.roadmap_version,
        modules=[
            ModuleOut(
                id=m.id,
                position=m.position,
                title=m.title,
                summary=m.summary,
                milestone=m.milestone,
                lessons=[_lesson_out(lsn) for lsn in engine.lessons_of(m)],
                assignment=_assignment_out(assignments.get(m.id)),
            )
            for m in modules
        ],
        progress=await engine.progress(db, classroom) if modules else None,
        pending_assessment=_assessment_out(pending).model_dump() if pending else None,
        pending_revision=(
            {
                "id": revision.id,
                "version": revision.version,
                "reason": revision.reason,
                "change_summary": revision.change_summary,
                "modules": revision.snapshot.get("modules", []),
            }
            if revision
            else None
        ),
        created_at=classroom.created_at,
        updated_at=classroom.updated_at,
    )


def _touch(classroom: Classroom) -> None:
    classroom.updated_at = datetime.now(UTC)


# ---------------------------------------------------------------- classrooms


@router.get("/classrooms", response_model=list[ClassroomSummary])
async def list_classrooms(db: DB, user: CurrentUser):
    rows = (
        await db.execute(
            select(Classroom)
            .where(Classroom.user_id == user.id)
            .order_by(Classroom.updated_at.desc())
        )
    ).scalars()
    out = []
    for c in rows:
        prog = await engine.progress(db, c)
        out.append(
            ClassroomSummary(
                id=c.id,
                title=c.title,
                goal_text=c.goal_text,
                status=c.status,
                percent=prog["summary"]["percent"],
                next_lesson_id=prog["next_lesson_id"],
                next_lesson_title=prog["next_lesson_title"],
                updated_at=c.updated_at,
            )
        )
    return out


@router.post("/classrooms", response_model=ClassroomOut, status_code=201)
async def create_classroom(body: ClassroomCreateIn, db: DB, user: CurrentUser):
    await quota.ensure_can_create_classroom(db, user)
    await quota.ensure_quota(db, user, "classroom")
    plan, usage = await engine.plan_intake(user, body.goal)
    classroom = Classroom(
        user_id=user.id,
        goal_text=body.goal,
        title=plan.title[:160],
        status="intake",
        intake={
            "goal_restated": plan.goal_restated,
            "questions": [q.model_dump() for q in plan.questions],
            "answers": {},
        },
    )
    db.add(classroom)
    await quota.record(db, user, "cr_intake", usage)
    await db.commit()
    return await _classroom_out(db, classroom)


@router.get("/classrooms/{cid}", response_model=ClassroomOut)
async def get_classroom(cid: str, db: DB, user: CurrentUser):
    return await _classroom_out(db, await _classroom(db, cid, user))


@router.delete("/classrooms/{cid}", status_code=204)
async def delete_classroom(cid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    await db.delete(classroom)
    await db.commit()
    return Response(status_code=204)


@router.post("/classrooms/{cid}/intake", response_model=ClassroomOut)
async def submit_intake(cid: str, body: IntakeAnswersIn, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    if classroom.status != "intake":
        raise AppError(409, "wrong_stage", "This classroom has already moved past the intake step.")
    await quota.ensure_quota(db, user, "classroom")
    known = {q["id"] for q in classroom.intake.get("questions", [])}
    classroom.intake = classroom.intake | {
        "answers": {k: v for k, v in body.answers.items() if k in known and v}
    }
    if body.skip_diagnostic:
        usage = await engine.generate_roadmap(db, classroom, user, diagnostic=None)
        await quota.record(db, user, "cr_roadmap", usage)
    else:
        _, usage = await engine.create_diagnostic(db, classroom, user)
        await quota.record(db, user, "cr_diagnostic", usage)
    _touch(classroom)
    await db.commit()
    return await _classroom_out(db, classroom)


@router.post("/classrooms/{cid}/assessments/{aid}/submit")
async def submit_assessment(cid: str, aid: str, body: ResponsesIn, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    assessment = await db.get(Assessment, aid)
    if assessment is None or assessment.classroom_id != classroom.id:
        raise AppError(404, "not_found", "Assessment not found.")
    if assessment.status == "graded":
        raise AppError(409, "already_graded", "This was already submitted.")
    await quota.ensure_quota(db, user, "classroom")

    responses = {k: v for k, v in body.responses.items() if v is not None}
    results, score, usage = await engine.grade(assessment.items, responses)
    assessment.responses, assessment.results, assessment.score = responses, results, score
    assessment.status, assessment.graded_at = "graded", datetime.now(UTC)
    await engine.update_mastery(db, classroom.id, assessment.items, results)
    await quota.record(db, user, "cr_grade", usage)

    lesson_out = None
    if assessment.kind == "diagnostic":
        await db.flush()
        roadmap_usage = await engine.generate_roadmap(db, classroom, user, assessment)
        await quota.record(db, user, "cr_roadmap", roadmap_usage)
    else:
        lesson = await _lesson(db, classroom, assessment.lesson_id or "")
        remedial_usage = await engine.apply_quiz_result(db, classroom, lesson, assessment)
        if remedial_usage:
            await quota.record(db, user, "cr_remedial", remedial_usage)
        lesson_out = _lesson_out(lesson).model_dump()
        lesson_out["remedial_md"] = lesson.remedial_md
    _touch(classroom)
    await db.commit()
    return {
        "assessment": _assessment_out(assessment).model_dump(),
        "lesson": lesson_out,
        "classroom": (await _classroom_out(db, classroom)).model_dump(),
    }


# ---------------------------------------------------------------- lessons


async def _lesson_detail(db, classroom: Classroom, lesson: Lesson) -> LessonDetailOut:
    module = await db.get(Module, lesson.module_id)
    order = [lsn.id for m in await engine.load_tree(db, classroom) for lsn in engine.lessons_of(m)]
    idx = order.index(lesson.id) if lesson.id in order else -1
    quiz = (
        await db.execute(
            select(Assessment)
            .where(Assessment.lesson_id == lesson.id, Assessment.kind == "quiz")
            .order_by(Assessment.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    chat = (
        await db.execute(
            select(TeacherMessage)
            .where(TeacherMessage.lesson_id == lesson.id)
            .order_by(TeacherMessage.created_at)
        )
    ).scalars()
    return LessonDetailOut(
        **_lesson_out(lesson).model_dump(),
        module_title=module.title if module else "",
        content_md=lesson.content_md,
        key_takeaways=lesson.key_takeaways or [],
        resources=lesson.resources or [],
        remedial_md=lesson.remedial_md,
        latest_quiz=_assessment_out(quiz) if quiz else None,
        chat=[
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
            for m in chat
        ],
        prev_lesson_id=order[idx - 1] if idx > 0 else None,
        next_lesson_id=order[idx + 1] if 0 <= idx < len(order) - 1 else None,
    )


@router.get("/classrooms/{cid}/lessons/{lid}", response_model=LessonDetailOut)
async def get_lesson(cid: str, lid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    lesson = await _lesson(db, classroom, lid)
    if classroom.last_lesson_id != lesson.id:
        classroom.last_lesson_id = lesson.id
        await db.commit()
    return await _lesson_detail(db, classroom, lesson)


@router.post("/classrooms/{cid}/lessons/{lid}/generate", response_model=LessonDetailOut)
async def generate_lesson(cid: str, lid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    lesson = await _lesson(db, classroom, lid)
    if not lesson.content_md:
        await quota.ensure_quota(db, user, "classroom")
        usage = await engine.ensure_lesson_content(db, classroom, user, lesson)
        if usage:
            await quota.record(db, user, "cr_lesson", usage)
    if lesson.status == "not_started":
        lesson.status = "in_progress"
    classroom.last_lesson_id = lesson.id
    _touch(classroom)
    await db.commit()
    return await _lesson_detail(db, classroom, lesson)


@router.post("/classrooms/{cid}/lessons/{lid}/quiz", response_model=AssessmentOut)
async def new_quiz(cid: str, lid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    lesson = await _lesson(db, classroom, lid)
    if not lesson.content_md:
        raise AppError(409, "no_content", "Open the lesson first.")
    await quota.ensure_quota(db, user, "classroom")
    quiz, usage = await engine.create_quiz(db, classroom, user, lesson)
    await quota.record(db, user, "cr_quiz", usage)
    await db.commit()
    return _assessment_out(quiz)


@router.post("/classrooms/{cid}/lessons/{lid}/complete", response_model=LessonOut)
async def complete_lesson(cid: str, lid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    lesson = await _lesson(db, classroom, lid)
    await engine.mark_complete(db, classroom, lesson)
    _touch(classroom)
    await db.commit()
    return _lesson_out(lesson)


# ---------------------------------------------------------------- teacher chat


@router.post("/classrooms/{cid}/teacher")
async def teacher_chat(cid: str, body: TeacherMessageIn, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    if classroom.status not in ("active", "completed"):
        raise AppError(409, "wrong_stage", "Your roadmap is not ready yet.")
    lesson = await _lesson(db, classroom, body.lesson_id) if body.lesson_id else None
    if cid in _teacher_busy:
        raise AppError(409, "busy", "Please wait for the current answer to finish.")
    await quota.ensure_quota(db, user, "classroom")
    history = (
        (
            await db.execute(
                select(TeacherMessage)
                .where(
                    TeacherMessage.classroom_id == classroom.id,
                    TeacherMessage.lesson_id == (lesson.id if lesson else None),
                )
                .order_by(TeacherMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    system = teacher_chat_system(await engine.teacher_context(db, classroom, user, lesson))
    messages = engine.chat_messages(list(history), body.content)
    question = TeacherMessage(
        classroom_id=classroom.id,
        lesson_id=lesson.id if lesson else None,
        role="user",
        content=body.content,
    )
    db.add(question)
    await db.commit()
    question_id, lesson_id, user_id = question.id, (lesson.id if lesson else None), user.id
    _teacher_busy.add(cid)

    async def produce(emit):
        usage = Usage()
        parts: list[str] = []
        try:
            async for chunk in engine.stream_teacher(system, messages, usage):
                parts.append(chunk)
                emit(sse("token", {"t": chunk}))
            async with db_session.SessionLocal() as s:
                answer = TeacherMessage(
                    classroom_id=cid, lesson_id=lesson_id, role="assistant", content="".join(parts)
                )
                s.add(answer)
                await quota.record(s, await s.get(User, user_id), "cr_teacher", usage)
                await s.commit()
                emit(sse("done", {"message_id": answer.id}))
        except LLMError as exc:
            log.warning("Teacher reply failed: %s", exc)
            async with db_session.SessionLocal() as s:
                q = await s.get(TeacherMessage, question_id)
                if q:
                    await s.delete(q)
                    await s.commit()
            emit(sse("error", {"code": "ai_error", "message": exc.user_message}))
        finally:
            _teacher_busy.discard(cid)

    return sse_response(detached(produce))


# ---------------------------------------------------------------- assignments


@router.post("/classrooms/{cid}/modules/{mid}/assignment")
async def new_assignment(cid: str, mid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    module = await db.get(Module, mid)
    if module is None or module.classroom_id != classroom.id:
        raise AppError(404, "not_found", "Module not found.")
    existing = (
        await db.execute(
            select(Assignment).where(Assignment.module_id == mid, Assignment.status == "open")
        )
    ).scalar_one_or_none()
    if existing:
        return _assignment_out(existing)
    await quota.ensure_quota(db, user, "classroom")
    assignment, usage = await engine.create_assignment(db, classroom, user, module)
    await quota.record(db, user, "cr_assignment", usage)
    await db.commit()
    return _assignment_out(assignment)


@router.post("/classrooms/{cid}/assignments/{aid}/submit")
async def submit_assignment(cid: str, aid: str, body: SubmissionIn, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    assignment = await db.get(Assignment, aid)
    if assignment is None or assignment.classroom_id != classroom.id:
        raise AppError(404, "not_found", "Assignment not found.")
    await quota.ensure_quota(db, user, "classroom")
    feedback, score, usage = await engine.grade_assignment(classroom, assignment, body.submission)
    assignment.submission, assignment.feedback, assignment.score = body.submission, feedback, score
    assignment.status = "graded"
    await quota.record(db, user, "cr_assignment_grade", usage)
    _touch(classroom)
    await db.commit()
    return _assignment_out(assignment)


# ---------------------------------------------------------------- roadmap revisions


@router.post("/classrooms/{cid}/revisions", response_model=ClassroomOut)
async def propose_revision(cid: str, body: RevisionIn, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    if classroom.status not in ("active", "completed"):
        raise AppError(409, "wrong_stage", "Your roadmap is not ready yet.")
    await quota.ensure_quota(db, user, "classroom")
    _, usage = await engine.propose_revision(db, classroom, user, body.reason)
    await quota.record(db, user, "cr_revision", usage)
    await db.commit()
    return await _classroom_out(db, classroom)


async def _revision(db, classroom: Classroom, rid: str) -> RoadmapRevision:
    revision = await db.get(RoadmapRevision, rid)
    if revision is None or revision.classroom_id != classroom.id:
        raise AppError(404, "not_found", "Roadmap change not found.")
    return revision


@router.post("/classrooms/{cid}/revisions/{rid}/apply", response_model=ClassroomOut)
async def apply_revision(cid: str, rid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    await engine.apply_revision(db, classroom, await _revision(db, classroom, rid))
    _touch(classroom)
    await db.commit()
    return await _classroom_out(db, classroom)


@router.post("/classrooms/{cid}/revisions/{rid}/discard", response_model=ClassroomOut)
async def discard_revision(cid: str, rid: str, db: DB, user: CurrentUser):
    classroom = await _classroom(db, cid, user)
    revision = await _revision(db, classroom, rid)
    if revision.status == "proposed":
        revision.status = "discarded"
        await db.commit()
    return await _classroom_out(db, classroom)
