import pytest

from app.services.classroom.resources import is_trusted
from app.services.classroom.schemas import PlannedLesson, PlannedModule
from tests.conftest import parse_sse

GOAL = "I want to learn machine learning to build an AI project for internships"


async def _create(c, goal: str = GOAL) -> dict:
    r = await c.post("/api/classroom/classrooms", json={"goal": goal})
    assert r.status_code == 201, r.text
    return r.json()


async def _active_classroom(c, skip: bool = False) -> dict:
    room = await _create(c)
    answers = {q["id"]: (q["options"] or ["anything"])[0] for q in room["intake"]["questions"]}
    r = await c.post(
        f"/api/classroom/classrooms/{room['id']}/intake",
        json={"answers": answers, "skip_diagnostic": skip},
    )
    assert r.status_code == 200, r.text
    room = r.json()
    if skip:
        return room
    diag = room["pending_assessment"]
    responses = {
        i["id"]: (0 if i["type"] == "mcq" else "It is the base idea used to make predictions")
        for i in diag["items"]
    }
    r = await c.post(
        f"/api/classroom/classrooms/{room['id']}/assessments/{diag['id']}/submit",
        json={"responses": responses},
    )
    assert r.status_code == 200, r.text
    return r.json()["classroom"]


async def test_goal_to_roadmap_flow(member):
    room = await _create(member)
    assert room["status"] == "intake"
    assert 2 <= len(room["intake"]["questions"]) <= 4

    answers = {q["id"]: (q["options"] or ["x"])[0] for q in room["intake"]["questions"]}
    answers["unknown-question"] = "ignored"
    room = (
        await member.post(
            f"/api/classroom/classrooms/{room['id']}/intake", json={"answers": answers}
        )
    ).json()
    assert room["status"] == "diagnostic"
    assert "unknown-question" not in room["intake"]["answers"]
    diag = room["pending_assessment"]
    # Answer keys never reach the browser before grading.
    assert all("answer_index" not in i and "rubric" not in i for i in diag["items"])

    responses = {}
    for i in diag["items"]:
        responses[i["id"]] = (
            0 if i["type"] == "mcq" else "Explains the core idea and when to use it"
        )
    r = await member.post(
        f"/api/classroom/classrooms/{room['id']}/assessments/{diag['id']}/submit",
        json={"responses": responses},
    )
    body = r.json()
    graded = body["assessment"]
    assert graded["status"] == "graded" and 0 <= graded["score"] <= 1
    assert graded["results"][0]["score"] == 1.0  # fixture: first MCQ answer index is 0
    room = body["classroom"]
    assert room["status"] == "active"
    assert room["learner_profile"]["level"] == "beginner"
    assert len(room["modules"]) == 3 and all(m["lessons"] for m in room["modules"])
    assert room["progress"]["summary"]["percent"] == 0
    assert room["progress"]["mastery"], "diagnostic should seed mastery"

    # Re-submitting is rejected.
    again = await member.post(
        f"/api/classroom/classrooms/{room['id']}/assessments/{diag['id']}/submit",
        json={"responses": responses},
    )
    assert again.status_code == 409


async def test_skip_diagnostic(member):
    room = await _active_classroom(member, skip=True)
    assert room["status"] == "active" and room["pending_assessment"] is None


async def test_lesson_quiz_adaptation_and_progress(member, fake_llm):
    room = await _active_classroom(member)
    cid = room["id"]
    lesson_id = room["progress"]["next_lesson_id"]

    lesson = (await member.get(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}")).json()
    assert lesson["content_md"] is None and lesson["status"] == "not_started"
    lesson = (
        await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}/generate")
    ).json()
    assert lesson["content_md"] and lesson["status"] == "in_progress"
    # Untrusted links are filtered out.
    assert [r["url"] for r in lesson["resources"]] == ["https://docs.python.org/3/tutorial/"]
    assert lesson["next_lesson_id"] and lesson["prev_lesson_id"] is None

    # Content is cached: a second generate does not call the model again.
    before = fake_llm.calls.count("classroom_lesson")
    await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}/generate")
    assert fake_llm.calls.count("classroom_lesson") == before

    # Fail the quiz -> needs review + remedial explanation.
    quiz = (await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}/quiz")).json()
    assert all("answer_index" not in i for i in quiz["items"])
    wrong = {i["id"]: (3 if i["type"] == "mcq" else "") for i in quiz["items"]}
    wrong["i4"] = 0  # fixture answer for i4 is index 3 -> still wrong
    r = await member.post(
        f"/api/classroom/classrooms/{cid}/assessments/{quiz['id']}/submit",
        json={"responses": wrong},
    )
    body = r.json()
    assert body["assessment"]["score"] < 0.7
    assert body["lesson"]["status"] == "needs_review" and body["lesson"]["remedial_md"]
    assert body["classroom"]["progress"]["next_lesson_id"] == lesson_id

    # Pass a fresh quiz -> completed, progress moves on.
    quiz = (await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}/quiz")).json()
    right = {
        i["id"]: (int(i["id"][1:]) - 1) % 4
        if i["type"] == "mcq"
        else "A complete explanation of the idea"
        for i in quiz["items"]
    }
    body = (
        await member.post(
            f"/api/classroom/classrooms/{cid}/assessments/{quiz['id']}/submit",
            json={"responses": right},
        )
    ).json()
    assert body["assessment"]["score"] >= 0.7
    assert body["lesson"]["status"] == "completed" and body["lesson"]["remedial_md"] is None
    prog = body["classroom"]["progress"]
    assert prog["summary"]["lessons_completed"] == 1
    assert prog["next_lesson_id"] != lesson_id


async def test_teacher_chat_streams_and_persists(member):
    room = await _active_classroom(member)
    cid = room["id"]
    lesson_id = room["progress"]["next_lesson_id"]
    await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}/generate")
    r = await member.post(
        f"/api/classroom/classrooms/{cid}/teacher",
        json={"content": "Why do we split data into train and test?", "lesson_id": lesson_id},
    )
    events = parse_sse(r.text)
    assert events[-1][0] == "done"
    lesson = (await member.get(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}")).json()
    assert [m["role"] for m in lesson["chat"]] == ["user", "assistant"]


async def test_teacher_failure_rolls_back_question(member, fake_llm):
    room = await _active_classroom(member)
    cid, lesson_id = room["id"], room["progress"]["next_lesson_id"]
    fake_llm.fail_tasks.add("classroom_teacher")
    r = await member.post(
        f"/api/classroom/classrooms/{cid}/teacher",
        json={"content": "hello?", "lesson_id": lesson_id},
    )
    assert parse_sse(r.text)[-1][0] == "error"
    lesson = (await member.get(f"/api/classroom/classrooms/{cid}/lessons/{lesson_id}")).json()
    assert lesson["chat"] == []


async def test_assignment_and_grading(member):
    room = await _active_classroom(member)
    cid, mid = room["id"], room["modules"][0]["id"]
    a = (await member.post(f"/api/classroom/classrooms/{cid}/modules/{mid}/assignment")).json()
    assert a["status"] == "open" and a["rubric"]
    same = (await member.post(f"/api/classroom/classrooms/{cid}/modules/{mid}/assignment")).json()
    assert same["id"] == a["id"]
    r = await member.post(
        f"/api/classroom/classrooms/{cid}/assignments/{a['id']}/submit",
        json={
            "submission": "I built a small classifier; repo at https://github.com/me/proj with notes."
        },
    )
    graded = r.json()
    assert graded["status"] == "graded" and graded["score"] == 0.7
    assert graded["feedback"]["scores"][0]["max"] == 5
    room = (await member.get(f"/api/classroom/classrooms/{cid}")).json()
    assert room["modules"][0]["assignment"]["status"] == "graded"


async def test_roadmap_revision_keeps_completed_lessons(member):
    room = await _active_classroom(member)
    cid = room["id"]
    first = room["modules"][0]["lessons"][0]
    await member.post(f"/api/classroom/classrooms/{cid}/lessons/{first['id']}/complete")

    room = (
        await member.post(
            f"/api/classroom/classrooms/{cid}/revisions",
            json={"reason": "I now want to focus on deep learning projects"},
        )
    ).json()
    proposal = room["pending_revision"]
    assert proposal and proposal["version"] == 2
    room = (
        await member.post(f"/api/classroom/classrooms/{cid}/revisions/{proposal['id']}/apply")
    ).json()
    assert room["roadmap_version"] == 2 and room["pending_revision"] is None
    lessons = [lsn for m in room["modules"] for lsn in m["lessons"]]
    assert lessons[0]["id"] == first["id"] and lessons[0]["status"] == "completed"
    assert room["progress"]["summary"]["lessons_completed"] == 1
    # Applying twice is rejected.
    again = await member.post(f"/api/classroom/classrooms/{cid}/revisions/{proposal['id']}/apply")
    assert again.status_code == 409


async def test_completing_every_lesson_completes_classroom(member):
    room = await _active_classroom(member, skip=True)
    cid = room["id"]
    for m in room["modules"]:
        for lsn in m["lessons"]:
            await member.post(f"/api/classroom/classrooms/{cid}/lessons/{lsn['id']}/complete")
    room = (await member.get(f"/api/classroom/classrooms/{cid}")).json()
    assert room["status"] == "completed" and room["progress"]["summary"]["percent"] == 100
    assert room["progress"]["next_lesson_id"] is None


async def test_guest_limits_and_isolation(guest, make_client):
    await _create(guest)
    r = await guest.post("/api/classroom/classrooms", json={"goal": "Learn React properly"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "classroom_limit"
    room_id = (await guest.get("/api/classroom/classrooms")).json()[0]["id"]
    other = await make_client()
    await other.post("/api/auth/guest")
    assert (await other.get(f"/api/classroom/classrooms/{room_id}")).status_code == 404
    assert (await other.delete(f"/api/classroom/classrooms/{room_id}")).status_code == 404


async def test_intake_failure_creates_nothing(member, fake_llm):
    fake_llm.fail_tasks.add("classroom_intake")
    r = await member.post("/api/classroom/classrooms", json={"goal": GOAL})
    assert r.status_code == 502 and r.json()["error"]["code"] == "ai_error"
    assert (await member.get("/api/classroom/classrooms")).json() == []


async def test_dashboard(member):
    await _active_classroom(member, skip=True)
    await member.post("/api/studentgpt/conversations", json={})
    d = (await member.get("/api/dashboard")).json()
    assert len(d["classrooms"]) == 1 and d["classrooms"][0]["next_lesson_id"]
    assert len(d["reflections"]) == 1
    assert d["usage"]["classroom"]["used"] >= 2


def test_trusted_resource_domains():
    assert is_trusted("https://docs.python.org/3/")
    assert is_trusted("https://www.khanacademy.org/math")
    assert not is_trusted("http://docs.python.org/3/")  # https only
    assert not is_trusted("https://docs.python.org.evil.com/")
    assert not is_trusted("https://randomblog.example.com/ml")


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("Module 1: Joins", "Joins"),
        ("Lesson 2 - SELECT basics", "SELECT basics"),
        ("Week 3. Projects", "Projects"),
        ("Step 4) Install Python", "Install Python"),
        ("Unit testing basics", "Unit testing basics"),
        ("Joins", "Joins"),
        ("Module 1:", "Module 1:"),
    ],
)
def test_roadmap_titles_drop_their_own_numbering(raw, clean):
    # The UI numbers modules and lessons, so "Module 1: Joins" would read "1 Module 1: Joins".
    lesson = PlannedLesson(title=raw, objectives=["a"], concepts=["c"])
    module = PlannedModule(title=raw, summary="s", milestone="m", lessons=[lesson])
    assert module.title == clean and module.lessons[0].title == clean
