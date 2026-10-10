"""StudentGPT turn pipeline.

1. Deterministic safety screen of the student's message (+ risk carried from earlier turns).
2. Build the mentor prompt: philosophy + understanding record + 2 retrieved reference dialogues.
3. Stream the reply (main model).
4. Update the understanding record with the fast model (stage, beliefs, threads, risk).
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import SafetyEvent, SgConversation, SgMessage, User
from app.services.llm import ChatMessage, LLMError, Usage, generate_structured, get_llm
from app.services.studentgpt import prompts
from app.services.studentgpt.exemplars import get_index
from app.services.studentgpt.safety import SafetyResult, combine, safety_addendum, screen
from app.services.studentgpt.state import ClarityCard, ConversationState

log = logging.getLogger("mahaguru.studentgpt")

HISTORY_WINDOW = 16  # recent messages sent verbatim; older context lives in the record
MAX_REPLY_TOKENS = 700


@dataclass
class Turn:
    system: str
    messages: list[ChatMessage]
    risk_level: str
    safety: SafetyResult
    exemplar_ids: list[str] = field(default_factory=list)
    safety_net: bool = False  # set when stream_reply had to add the route to help itself


def plan_turn(conv: SgConversation, history: list[SgMessage], user: User, content: str) -> Turn:
    """Pure function (no I/O) so it can be unit tested."""
    safety = screen(content)
    state = conv.state or {}
    # Crisis mode for this reply: the current message trips the rules, or the model judged the
    # previous exchange as crisis. Earlier flags keep the reply in "elevated" care mode.
    if safety.level == "crisis" or state.get("risk_level") == "crisis":
        risk = "crisis"
    elif safety.level == "elevated" or conv.risk_level != "none":
        risk = "elevated"
    else:
        risk = "none"

    query = " ".join(
        [state.get("presenting_concern", ""), state.get("next_focus", "")]
        + [m.content for m in history if m.role == "user"][-2:]
        + [content]
    )
    exemplars = get_index().search(query, k=2)

    user_turns = sum(1 for m in history if m.role == "user") + 1
    system = prompts.build_mentor_system(
        state=state,
        profile=user.profile or {},
        exemplars=[e.render() for e in exemplars],
        risk_level=risk,
        turn_count=user_turns,
    )
    recent = history[-HISTORY_WINDOW:]
    messages = [ChatMessage(m.role, m.content) for m in recent]  # type: ignore[arg-type]
    messages.append(ChatMessage("user", content))
    return Turn(
        system=system,
        messages=messages,
        risk_level=risk,
        safety=safety,
        exemplar_ids=[e.id for e in exemplars],
    )


async def stream_reply(turn: Turn, usage: Usage):
    settings = get_settings()
    parts: list[str] = []
    async for chunk in get_llm().stream(
        system=turn.system,
        messages=turn.messages,
        model=settings.llm_model,
        temperature=0.7,
        max_tokens=MAX_REPLY_TOKENS,
        task="studentgpt_reply",
        usage=usage,
    ):
        parts.append(chunk)
        yield chunk
    earlier = [m.content for m in turn.messages if m.role == "assistant"]
    addendum = safety_addendum(turn.risk_level, "".join(parts), earlier)
    if addendum:
        turn.safety_net = True
        log.info("Safety net added the route to help (%s turn)", turn.risk_level)
        yield addendum


async def update_state(
    db: AsyncSession, conv: SgConversation, student_message: str, reply: str
) -> Usage | None:
    """Refresh the understanding record. Failures are logged, never shown: the chat still works."""
    settings = get_settings()
    try:
        new_state, usage = await generate_structured(
            get_llm(),
            ConversationState,
            task="studentgpt_state",
            system=prompts.STATE_SYSTEM,
            prompt=prompts.state_update_prompt(conv.state or {}, student_message, reply),
            model=settings.llm_fast_model,
            temperature=0.2,
            max_tokens=1200,
        )
    except LLMError as exc:
        log.warning("State update failed for %s: %s", conv.id, exc)
        return None
    data = new_state.model_dump()
    conv.state = data
    conv.stage = new_state.stage
    if not conv.title_custom:
        conv.title = new_state.title
    if new_state.risk_level != "none":
        conv.risk_level = combine(new_state.risk_level, conv.risk_level)  # type: ignore[arg-type]
        db.add(
            SafetyEvent(
                user_id=conv.user_id,
                conversation_id=conv.id,
                level=new_state.risk_level,
                category=(new_state.risk_category or "unspecified")[:40],
                source="model",
            )
        )
    elif conv.risk_level == "crisis":
        conv.risk_level = "elevated"  # step down gradually once the model sees no current risk
    return usage


def transcript(messages: list[SgMessage]) -> str:
    return "\n\n".join(
        f"{'Student' if m.role == 'user' else 'Mentor'}: {m.content}" for m in messages
    )


async def make_clarity(
    conv: SgConversation, messages: list[SgMessage]
) -> tuple[ClarityCard, Usage]:
    settings = get_settings()
    return await generate_structured(
        get_llm(),
        ClarityCard,
        task="studentgpt_clarity",
        system=prompts.CLARITY_SYSTEM,
        prompt=prompts.clarity_prompt(transcript(messages[-40:]), conv.state or {}),
        model=settings.llm_model,
        temperature=0.4,
        max_tokens=1500,
    )
