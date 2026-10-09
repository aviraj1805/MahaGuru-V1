"""Accounts and sessions.

Visitors get a *guest* user on first use (limited quotas). Signing up upgrades that same row, so
nothing the guest created is lost. Logging into an existing account merges the guest's data in.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, select, update

from app.api.deps import DB, CurrentUser, OptionalUser
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ratelimit import auth_limiter, client_ip, guest_limiter
from app.core.security import hash_password, hash_token, new_session_token, verify_password
from app.models import AuthSession, Classroom, SgConversation, User
from app.schemas.auth import (
    DeleteAccountIn,
    LoginIn,
    PasswordChangeIn,
    ProfileUpdateIn,
    SessionOut,
    SignupIn,
    UserOut,
)
from app.services import quota

router = APIRouter(prefix="/auth", tags=["auth"])


async def _start_session(db, response: Response, user: User) -> None:
    s = get_settings()
    token = new_session_token()
    days = s.guest_session_days if user.is_guest else s.session_days
    db.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=days),
        )
    )
    response.set_cookie(
        s.cookie_name,
        token,
        max_age=days * 86400,
        httponly=True,
        secure=s.is_production,
        samesite="lax",
        path="/",
    )


async def _end_session(db, request: Request, response: Response) -> None:
    s = get_settings()
    token = request.cookies.get(s.cookie_name)
    if token:
        await db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    response.delete_cookie(s.cookie_name, path="/")


async def _session_out(db, user: User | None) -> SessionOut:
    if user is None:
        return SessionOut(user=None)
    return SessionOut(user=UserOut.model_validate(user), usage=await quota.summary(db, user))


@router.get("/session", response_model=SessionOut)
async def get_session(db: DB, user: OptionalUser) -> SessionOut:
    if user is not None:
        user.last_seen_at = datetime.now(UTC)
        await db.commit()
    return await _session_out(db, user)


@router.post("/guest", response_model=SessionOut)
async def start_guest(request: Request, response: Response, db: DB, user: OptionalUser):
    """Idempotent: returns the current session if there already is one."""
    if user is None:
        guest_limiter.hit(client_ip(request))
        user = User(is_guest=True, profile={})
        db.add(user)
        await db.flush()
        await _start_session(db, response, user)
        await db.commit()
    return await _session_out(db, user)


@router.post("/signup", response_model=SessionOut, status_code=201)
async def signup(body: SignupIn, request: Request, response: Response, db: DB, user: OptionalUser):
    auth_limiter.hit(client_ip(request))
    email = body.email.lower()
    if (await db.execute(select(User.id).where(User.email == email))).first():
        raise AppError(
            409, "email_taken", "An account with this email already exists. Log in instead."
        )
    if user is not None and user.is_guest:
        target = user  # upgrade in place: keeps conversations and classrooms
    else:
        target = User(profile={})
        db.add(target)
    target.email = email
    target.password_hash = hash_password(body.password)
    target.display_name = (body.display_name or "").strip() or None
    target.is_guest = False
    await db.flush()
    await _end_session(db, request, response)
    await _start_session(db, response, target)
    await db.commit()
    await db.refresh(target)
    return await _session_out(db, target)


@router.post("/login", response_model=SessionOut)
async def login(body: LoginIn, request: Request, response: Response, db: DB, user: OptionalUser):
    auth_limiter.hit(client_ip(request))
    account = (
        await db.execute(select(User).where(User.email == body.email.lower()))
    ).scalar_one_or_none()
    if (
        account is None
        or not account.password_hash
        or not verify_password(body.password, account.password_hash)
    ):
        raise AppError(401, "invalid_credentials", "Email or password is incorrect.")
    if user is not None and user.is_guest and user.id != account.id:
        # Bring the guest's work along, then remove the empty guest row.
        for model in (SgConversation, Classroom):
            await db.execute(
                update(model).where(model.user_id == user.id).values(user_id=account.id)
            )
        await db.execute(delete(User).where(User.id == user.id))
    await _end_session(db, request, response)
    await _start_session(db, response, account)
    await db.commit()
    return await _session_out(db, account)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB) -> Response:
    await _end_session(db, request, response)
    await db.commit()
    response.status_code = 204
    return response


@router.patch("/me", response_model=SessionOut)
async def update_me(body: ProfileUpdateIn, db: DB, user: CurrentUser):
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.profile is not None:
        user.profile = body.profile.model_dump(exclude_none=True)
    await db.commit()
    await db.refresh(user)
    return await _session_out(db, user)


@router.post("/password", status_code=204)
async def change_password(body: PasswordChangeIn, request: Request, db: DB, user: CurrentUser):
    auth_limiter.hit(client_ip(request))
    if user.is_guest or not user.password_hash:
        raise AppError(400, "no_password", "Guest sessions have no password.")
    if not verify_password(body.current_password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    # Revoke all other sessions.
    token = request.cookies.get(get_settings().cookie_name, "")
    await db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id, AuthSession.token_hash != hash_token(token)
        )
    )
    await db.commit()
    return Response(status_code=204)


@router.delete("/me", status_code=204)
async def delete_me(
    body: DeleteAccountIn, request: Request, response: Response, db: DB, user: CurrentUser
) -> Response:
    """Permanently deletes the account and everything it owns (cascade)."""
    if not user.is_guest:
        if not body.password or not verify_password(body.password, user.password_hash or ""):
            raise AppError(401, "invalid_credentials", "Password is incorrect.")
    await _end_session(db, request, response)
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    response.status_code = 204
    return response
