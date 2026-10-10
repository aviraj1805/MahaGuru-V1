import pytest
from sqlalchemy import select

from app.db import session as db_session
from app.models import SafetyEvent, SgConversation, SgMessage, User
from app.services.studentgpt.engine import plan_turn
from app.services.studentgpt.exemplars import Exemplar, ExemplarIndex, get_index
from app.services.studentgpt.safety import (
    CRISIS_SAFETY_LINE,
    CRISIS_SAFETY_LINE_HINGLISH,
    ELEVATED_SUPPORT_LINE,
    ELEVATED_SUPPORT_LINE_HINGLISH,
    looks_hinglish,
    safety_addendum,
    screen,
)
from tests.conftest import parse_sse


async def _new_conv(c) -> str:
    r = await c.post("/api/studentgpt/conversations", json={})
    assert r.status_code == 201
    return r.json()["id"]


async def _send(c, conv_id: str, text: str):
    r = await c.post(f"/api/studentgpt/conversations/{conv_id}/messages", json={"content": text})
    assert r.status_code == 200, r.text
    return parse_sse(r.text)


async def test_reply_streams_and_persists(guest):
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "I am confused about my career after second year")
    names = [n for n, _ in events]
    assert names[0] == "token" and "done" in names and names[-1] == "state"
    reply = "".join(d["t"] for n, d in events if n == "token")
    assert reply.strip().endswith("?")

    conv = (await guest.get(f"/api/studentgpt/conversations/{conv_id}")).json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    assert conv["messages"][1]["content"] == reply.strip()
    # The understanding record was updated and its public part is exposed.
    assert conv["explored"]["presenting_concern"].startswith("I am confused")
    assert conv["stage"] == "exploring"


async def test_history_is_sent_to_the_model(guest, fake_llm):
    conv_id = await _new_conv(guest)
    await _send(guest, conv_id, "First thought about engineering")
    await _send(guest, conv_id, "Second thought about my parents")
    assert fake_llm.calls.count("studentgpt_reply") == 2
    async with db_session.SessionLocal() as s:
        msgs = (
            (await s.execute(select(SgMessage).where(SgMessage.conversation_id == conv_id)))
            .scalars()
            .all()
        )
    assert len(msgs) == 4


async def test_crisis_message_triggers_safety_protocol(guest):
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "Honestly I just want to die, nothing matters")
    assert events[0][0] == "safety"
    assert events[0][1]["level"] == "crisis"
    assert any("14416" in h["contact"] for h in events[0][1]["helplines"])
    reply = "".join(d["t"] for n, d in events if n == "token")
    assert "14416" in reply
    async with db_session.SessionLocal() as s:
        rows = (await s.execute(select(SafetyEvent))).scalars().all()
    assert {r.source for r in rows} >= {"rules"}
    assert all(r.category for r in rows)


async def test_crisis_reply_falls_back_when_ai_fails(guest, fake_llm):
    fake_llm.fail_tasks.add("studentgpt_reply")
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "I want to kill myself")
    reply = "".join(d["t"] for n, d in events if n == "token")
    assert "Tele-MANAS" in reply and ("done", events[-2][1]) == events[-2]


async def test_safety_net_adds_the_helpline_when_the_model_leaves_it_out(
    guest, fake_llm, monkeypatch
):
    monkeypatch.setattr(fake_llm, "_reply", lambda system, messages, task: "What happened today?")
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "Honestly I just want to die")
    reply = "".join(d["t"] for n, d in events if n == "token")
    assert reply.startswith("What happened today?") and "14416" in reply and "112" in reply
    async with db_session.SessionLocal() as s:
        saved = (
            await s.execute(select(SgMessage).where(SgMessage.role == "assistant"))
        ).scalar_one()
    assert saved.meta["safety_net"] is True and "14416" in saved.content


@pytest.mark.parametrize(
    ("level", "reply", "earlier", "expected"),
    [
        ("crisis", "Are you safe right now?", [], CRISIS_SAFETY_LINE),
        ("crisis", "Please call Tele-MANAS on 14416. Are you safe?", [], ""),
        ("crisis", "Abhi 112 pe call karo. Kya tum safe ho?", [], ""),
        ("elevated", "What feels hardest?", [], ELEVATED_SUPPORT_LINE),
        ("elevated", "What feels hardest?", ["A counsellor can help with this."], ""),
        ("none", "What feels hardest?", [], ""),
    ],
)
def test_safety_addendum(level, reply, earlier, expected):
    assert safety_addendum(level, reply, earlier) == expected


@pytest.mark.parametrize(
    ("text", "hinglish"),
    [
        (
            "Pata nahi, call karne ki himmat nahi ho rahi. Bas mann karta hai ki sab band karke so jaun",
            True,
        ),
        ("Mere sab dost kuch na kuch kar rahe hain, main hi peeche reh gaya hoon yaar.", True),
        ("मुझे कुछ समझ नहीं आ रहा", True),
        ("I failed again and honestly I just want to end my life.", False),
        ("I live in the main hostel and I ki the door shut", False),
    ],
)
def test_looks_hinglish(text, hinglish):
    assert looks_hinglish(text) is hinglish


def test_safety_lines_follow_the_students_language():
    student = "Pata nahi yaar, mujhe lagta hai main is duniya mein rehne ke layak hi nahi hoon"
    assert safety_addendum("crisis", "Kya hua?", [], student) == CRISIS_SAFETY_LINE_HINGLISH
    assert safety_addendum("elevated", "Kya hua?", [], student) == ELEVATED_SUPPORT_LINE_HINGLISH
    assert safety_addendum("crisis", "What happened?", [], "I want to die") == CRISIS_SAFETY_LINE


async def test_ai_failure_returns_error_and_rolls_back_user_message(guest, fake_llm):
    fake_llm.fail_tasks.add("studentgpt_reply")
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "Why do I keep procrastinating?")
    assert events[-1][0] == "error"
    conv = (await guest.get(f"/api/studentgpt/conversations/{conv_id}")).json()
    assert conv["messages"] == []


async def test_state_failure_does_not_break_chat(guest, fake_llm):
    fake_llm.fail_tasks.add("studentgpt_state")
    conv_id = await _new_conv(guest)
    events = await _send(guest, conv_id, "I feel stuck in my course")
    assert "done" in [n for n, _ in events]


async def test_guest_quota(guest):
    conv_id = await _new_conv(guest)
    for i in range(6):
        await _send(guest, conv_id, f"message number {i}")
    r = await guest.post(
        f"/api/studentgpt/conversations/{conv_id}/messages", json={"content": "one more"}
    )
    assert r.status_code == 429 and r.json()["error"]["code"] == "quota_exceeded"


async def test_clarity_requires_enough_conversation(member):
    conv_id = await _new_conv(member)
    await _send(member, conv_id, "I don't know what I want to do")
    r = await member.post(f"/api/studentgpt/conversations/{conv_id}/clarity")
    assert r.status_code == 400 and r.json()["error"]["code"] == "too_early"
    await _send(member, conv_id, "Everyone around me seems sure")
    await _send(member, conv_id, "Maybe I just like building things")
    r = await member.post(f"/api/studentgpt/conversations/{conv_id}/clarity")
    assert r.status_code == 200
    body = r.json()
    assert body["stage"] == "clarity" and body["has_clarity"]
    assert body["clarity"]["insights"] and body["clarity"]["questions_to_sit_with"]


async def test_rename_list_delete_and_isolation(member, make_client):
    conv_id = await _new_conv(member)
    r = await member.patch(f"/api/studentgpt/conversations/{conv_id}", json={"title": "Career"})
    assert r.json()["title"] == "Career"
    # The automatic title must not override a custom one.
    await _send(member, conv_id, "Something about my studies")
    assert (await member.get(f"/api/studentgpt/conversations/{conv_id}")).json()[
        "title"
    ] == "Career"

    stranger = await make_client()
    await stranger.post("/api/auth/guest")
    assert (await stranger.get(f"/api/studentgpt/conversations/{conv_id}")).status_code == 404
    r = await stranger.post(
        f"/api/studentgpt/conversations/{conv_id}/messages", json={"content": "hi"}
    )
    assert r.status_code == 404

    assert (await member.delete(f"/api/studentgpt/conversations/{conv_id}")).status_code == 204
    assert (await member.get("/api/studentgpt/conversations")).json() == []


async def test_message_validation(guest):
    conv_id = await _new_conv(guest)
    r = await guest.post(
        f"/api/studentgpt/conversations/{conv_id}/messages", json={"content": "  "}
    )
    assert r.status_code == 422
    r = await guest.post(
        f"/api/studentgpt/conversations/{conv_id}/messages", json={"content": "x" * 4001}
    )
    assert r.status_code == 422


# ------------------------------------------------------------------ unit tests


@pytest.mark.parametrize(
    "text,level",
    [
        ("I want to end my life", "crisis"),
        ("sometimes I think everyone would be better off without me", "crisis"),
        ("I have been cutting myself", "crisis"),
        ("mujhe ab jeena nahi chahta", "crisis"),
        ("khudkushi ka khayal aata hai", "crisis"),
        ("I feel hopeless about placements", "elevated"),
        ("I've had panic attacks before exams", "elevated"),
        ("I'm killing it in my internship", "none"),
        ("I'm dying to know which branch is better", "none"),
        ("career confusion between CS and design", "none"),
    ],
)
def test_safety_screen(text, level):
    assert screen(text).level == level


def test_plan_turn_modes_and_prompt():
    user = User(id="u", profile={"field_of_study": "Mechanical"}, is_guest=True)
    conv = SgConversation(id="c", user_id="u", state={}, risk_level="none", title="t")
    turn = plan_turn(conv, [], user, "My parents want MBA but I like design")
    assert turn.risk_level == "none"
    assert "field of study: Mechanical" in turn.system
    assert "SAFETY MODE" not in turn.system
    assert turn.messages[-1].content.startswith("My parents")

    crisis = plan_turn(conv, [], user, "I want to die")
    assert crisis.risk_level == "crisis" and "SAFETY MODE" in crisis.system

    # Risk flagged earlier keeps later replies in care mode.
    conv.risk_level = "elevated"
    later = plan_turn(conv, [], user, "anyway, about my exams")
    assert later.risk_level == "elevated" and "CARE NOTE" in later.system


def test_exemplar_search_ranks_relevant_dialogue():
    idx = ExemplarIndex(
        [
            Exemplar("a", "Career confusion", "switching branches", (("student", "career"),)),
            Exemplar("b", "Relationships", "breakup and focus", (("student", "breakup"),)),
        ]
    )
    assert [e.id for e in idx.search("I had a breakup and cannot focus", k=1)] == ["b"]
    assert idx.search("", k=2) == []


def test_bundled_exemplar_library_loads():
    index = get_index()
    assert len(index.exemplars) >= 30
    hits = index.search("my parents want engineering but I love design", k=2)
    assert hits and all(h.render().startswith("[") for h in hits)
