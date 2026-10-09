from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_token
from app.db.session import get_db
from app.models import AuthSession, User

DB = Annotated[AsyncSession, Depends(get_db)]


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def get_optional_user(request: Request, db: DB) -> User | None:
    token = request.cookies.get(get_settings().cookie_name)
    if not token:
        return None
    session = await db.get(AuthSession, hash_token(token))
    if session is None or _aware(session.expires_at) < datetime.now(UTC):
        return None
    return await db.get(User, session.user_id)


async def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise AppError(401, "not_authenticated", "Please start a session to continue.")
    return user


async def get_registered_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.is_guest:
        raise AppError(403, "account_required", "Create a free account to use this feature.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
RegisteredUser = Annotated[User, Depends(get_registered_user)]


async def owned(db: AsyncSession, model, obj_id: str, user: User, what: str):
    """Fetch a row owned by `user`; 404 (not 403) otherwise so ids cannot be probed."""
    obj = await db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise AppError(404, "not_found", f"{what} not found.")
    return obj


__all__ = [
    "DB",
    "CurrentUser",
    "OptionalUser",
    "RegisteredUser",
    "owned",
    "select",
]
