import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import delete, select

from app.api.deps import DB, CurrentUser, owned
from app.api.sse import detached, sse, sse_response
from app.core.errors import AppError
from app.db import session as db_session
from app.models import SafetyEvent, SgConversation, SgMessage, User
from app.schemas.studentgpt import (
    ConversationCreateIn,
    ConversationOut,
    ConversationSummary,
    ConversationUpdateIn,
    MessageIn,
    MessageOut,
)
from app.services import quota
from app.services.llm import LLMError, Usage
from app.services.studentgpt import engine
from app.services.studentgpt.safety import CRISIS_FALLBACK_REPLY, HELPLINES, combine
from app.services.studentgpt.state import public_state

log = logging.getLogger("mahaguru.studentgpt")
router = APIRouter(prefix="/studentgpt", tags=["studentgpt"])

_in_flight: set[str] = set()
MIN_TURNS_FOR_CLARITY = 3


def _summary(c: SgConversation) -> ConversationSummary:
    return ConversationSummary(
        id=c.id,
        title=c.title,
        stage=c.stage,
        has_clarity=c.clarity is not None,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def _load(db, conv_id: str, user: User) -> SgConversation:
    conv = await owned(db, SgConversation, conv_id, user, "Conversation")
    await db.refresh(conv, ["messages"])
    return conv


def _out(conv: SgConversation) -> ConversationOut:
    return ConversationOut(
        **_summary(conv).model_dump(),
        messages=[MessageOut.model_validate(m) for m in conv.messages],
        explored=public_state(conv.state, conv.stage),
        clarity=conv.clarity,
        risk_level=conv.risk_level,
        helplines=HELPLINES,
    )


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(db: DB, user: CurrentUser):
    rows = (
        await db.execute(
            select(SgConversation)
            .where(SgConversation.user_id == user.id)
            .order_by(SgConversation.updated_at.desc())
            .limit(100)
        )
    ).scalars()
    return [_summary(c) for c in rows]


@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(body: ConversationCreateIn, db: DB, user: CurrentUser):
    conv = SgConversation(user_id=user.id, state={})
    if body.title:
        conv.title, conv.title_custom = body.title.strip(), True
    db.add(conv)
    await db.commit()
    return _out(await _load(db, conv.id, user))


@router.get("/conversations/{conv_id}", response_model=ConversationOut)
async def get_conversation(conv_id: str, db: DB, user: CurrentUser):
    return _out(await _load(db, conv_id, user))


@router.patch("/conversations/{conv_id}", response_model=ConversationSummary)
async def rename_conversation(conv_id: str, body: ConversationUpdateIn, db: DB, user: CurrentUser):
    conv = await owned(db, SgConversation, conv_id, user, "Conversation")
    conv.title, conv.title_custom = body.title.strip(), True
    await db.commit()
    return _summary(conv)


@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str, db: DB, user: CurrentUser):
    conv = await owned(db, SgConversation, conv_id, user, "Conversation")
    await db.delete(conv)
    await db.commit()
    return Response(status_code=204)


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageIn, db: DB, user: CurrentUser):
    """Streams the mentor's reply as Server-Sent Events: safety?, token*, done | error."""
    conv = await _load(db, conv_id, user)
    if conv_id in _in_flight:
        raise AppError(409, "busy", "Please wait for the current reply to finish.")
    await quota.ensure_quota(db, user, "message")

    history = list(conv.messages)
    turn = engine.plan_turn(conv, history, user, body.content)

    user_msg = SgMessage(
        conversation_id=conv.id,
        role="user",
        content=body.content,
        meta={"safety": turn.safety.categories} if turn.safety.flagged else {},
    )
    db.add(user_msg)
    if not history and not conv.title_custom:
        conv.title = body.content[:60] + ("…" if len(body.content) > 60 else "")
    if turn.safety.flagged:
        db.add(
            SafetyEvent(
                user_id=user.id,
                conversation_id=conv.id,
                level=turn.safety.level,
                category=turn.safety.categories[0],
                source="rules",
            )
        )
        conv.risk_level = combine(turn.safety.level, conv.risk_level)  # type: ignore[arg-type]
    await db.commit()
    user_msg_id, user_id = user_msg.id, user.id
    _in_flight.add(conv_id)

    async def produce(emit):
        usage = Usage()
        reply_parts: list[str] = []
        try:
            if turn.risk_level != "none":
                emit(sse("safety", {"level": turn.risk_level, "helplines": HELPLINES}))
            try:
                async for chunk in engine.stream_reply(turn, usage):
                    reply_parts.append(chunk)
                    emit(sse("token", {"t": chunk}))
            except LLMError as exc:
                if turn.risk_level != "crisis" or reply_parts:
                    raise
                # Never leave a student in crisis without a response.
                log.error("Crisis reply failed, using fallback: %s", exc)
                reply_parts = [CRISIS_FALLBACK_REPLY]
                emit(sse("token", {"t": CRISIS_FALLBACK_REPLY}))

            reply = "".join(reply_parts).strip()
            async with db_session.SessionLocal() as s:
                c = await s.get(SgConversation, conv_id)
                u = await s.get(User, user_id)
                assistant = SgMessage(
                    conversation_id=conv_id,
                    role="assistant",
                    content=reply,
                    meta={"exemplars": turn.exemplar_ids, "risk": turn.risk_level}
                    | ({"safety_net": True} if turn.safety_net else {}),
                )
                s.add(assistant)
                await quota.record(s, u, "sg_message", usage)
                c.updated_at = datetime.now(UTC)
                await s.commit()
                emit(sse("done", {"message_id": assistant.id, "title": c.title}))

                # Update the understanding record before releasing the conversation.
                await s.refresh(c)
                state_usage = await engine.update_state(s, c, body.content, reply)
                if state_usage:
                    await quota.record(s, u, "bg_sg_state", state_usage)
                await s.commit()
                emit(sse("state", {"title": c.title, "explored": public_state(c.state, c.stage)}))
        except LLMError as exc:
            log.warning("StudentGPT reply failed: %s", exc)
            async with db_session.SessionLocal() as s:
                await s.execute(delete(SgMessage).where(SgMessage.id == user_msg_id))
                await s.commit()
            emit(sse("error", {"code": "ai_error", "message": exc.user_message}))
        except Exception:  # pragma: no cover - unexpected
            log.exception("StudentGPT stream crashed")
            emit(sse("error", {"code": "internal_error", "message": "Something went wrong."}))
        finally:
            _in_flight.discard(conv_id)

    return sse_response(detached(produce))


@router.post("/conversations/{conv_id}/clarity", response_model=ConversationOut)
async def create_clarity(conv_id: str, db: DB, user: CurrentUser):
    conv = await _load(db, conv_id, user)
    turns = sum(1 for m in conv.messages if m.role == "user")
    if turns < MIN_TURNS_FOR_CLARITY:
        raise AppError(
            400,
            "too_early",
            f"Share a little more first: a clarity summary needs at least "
            f"{MIN_TURNS_FOR_CLARITY} messages from you.",
        )
    await quota.ensure_quota(db, user, "message")
    card, usage = await engine.make_clarity(conv, list(conv.messages))
    conv.clarity = card.model_dump()
    conv.stage = "clarity"
    await quota.record(db, user, "sg_clarity", usage)
    await db.commit()
    return _out(await _load(db, conv_id, user))
