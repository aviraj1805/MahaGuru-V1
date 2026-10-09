"""Per-user rolling-24h quotas for AI actions. Guests get a smaller allowance."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Classroom, UsageEvent, User
from app.services.llm.base import Usage

Bucket = Literal["message", "classroom"]
_PREFIX = {"message": "sg_", "classroom": "cr_"}


def limit_for(user: User, bucket: Bucket) -> int:
    s = get_settings()
    if bucket == "message":
        return s.guest_daily_messages if user.is_guest else s.user_daily_messages
    return s.guest_daily_classroom_actions if user.is_guest else s.user_daily_classroom_actions


async def used(db: AsyncSession, user: User, bucket: Bucket) -> int:
    since = datetime.now(UTC) - timedelta(hours=24)
    stmt = select(func.count(UsageEvent.id)).where(
        UsageEvent.user_id == user.id,
        UsageEvent.created_at >= since,
        UsageEvent.kind.like(_PREFIX[bucket] + "%"),
    )
    return int((await db.execute(stmt)).scalar_one())


async def ensure_quota(db: AsyncSession, user: User, bucket: Bucket) -> None:
    limit = limit_for(user, bucket)
    if await used(db, user, bucket) >= limit:
        hint = " Create a free account for a bigger daily allowance." if user.is_guest else ""
        raise AppError(
            429, "quota_exceeded", f"You've reached today's limit of {limit} AI actions here.{hint}"
        )


async def record(db: AsyncSession, user: User, kind: str, usage: Usage | None = None) -> None:
    usage = usage or Usage()
    db.add(
        UsageEvent(
            user_id=user.id,
            kind=kind,
            model=usage.model or None,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
        )
    )


async def ensure_can_create_classroom(db: AsyncSession, user: User) -> None:
    s = get_settings()
    cap = s.guest_max_classrooms if user.is_guest else s.user_max_classrooms
    count = (
        await db.execute(select(func.count(Classroom.id)).where(Classroom.user_id == user.id))
    ).scalar_one()
    if count >= cap:
        hint = " Create a free account to start more." if user.is_guest else ""
        raise AppError(
            403, "classroom_limit", f"You can have up to {cap} classroom(s) at a time.{hint}"
        )


async def summary(db: AsyncSession, user: User) -> dict:
    return {
        bucket: {"used": await used(db, user, bucket), "limit": limit_for(user, bucket)}
        for bucket in ("message", "classroom")
    }
