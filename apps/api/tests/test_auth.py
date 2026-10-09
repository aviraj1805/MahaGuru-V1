from sqlalchemy import func, select

from app.db import session as db_session
from app.models import SgConversation, User


async def test_session_is_empty_without_cookie(client):
    r = await client.get("/api/auth/session")
    assert r.status_code == 200
    assert r.json()["user"] is None


async def test_guest_session_is_idempotent(client):
    first = (await client.post("/api/auth/guest")).json()["user"]
    second = (await client.post("/api/auth/guest")).json()["user"]
    assert first["is_guest"] is True
    assert first["id"] == second["id"]
    session = (await client.get("/api/auth/session")).json()
    assert session["user"]["id"] == first["id"]
    assert session["usage"]["message"]["limit"] == 6


async def test_signup_upgrades_guest_and_keeps_data(guest):
    conv = (await guest.post("/api/studentgpt/conversations", json={})).json()
    r = await guest.post(
        "/api/auth/signup", json={"email": "Ravi@Example.com", "password": "long-enough-pw"}
    )
    assert r.status_code == 201
    user = r.json()["user"]
    assert user["is_guest"] is False and user["email"] == "ravi@example.com"
    convs = (await guest.get("/api/studentgpt/conversations")).json()
    assert [c["id"] for c in convs] == [conv["id"]]


async def test_signup_rejects_duplicates_and_short_passwords(member, make_client):
    other = await make_client()
    r = await other.post(
        "/api/auth/signup", json={"email": "asha@example.com", "password": "another-pw-1"}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"
    r = await other.post("/api/auth/signup", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422


async def test_login_logout_and_bad_password(member, make_client):
    await member.post("/api/auth/logout")
    assert (await member.get("/api/auth/session")).json()["user"] is None
    bad = await member.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "wrong-password"}
    )
    assert bad.status_code == 401
    ok = await member.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "correct-horse-1"}
    )
    assert ok.status_code == 200 and ok.json()["user"]["display_name"] == "Asha"


async def test_login_merges_guest_work_into_account(member, make_client):
    await member.post("/api/auth/logout")
    other = await make_client()
    await other.post("/api/auth/guest")
    await other.post("/api/studentgpt/conversations", json={"title": "guest thoughts"})
    r = await other.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "correct-horse-1"}
    )
    assert r.status_code == 200
    titles = [c["title"] for c in (await other.get("/api/studentgpt/conversations")).json()]
    assert titles == ["guest thoughts"]
    async with db_session.SessionLocal() as s:
        guests = (await s.execute(select(func.count(User.id)).where(User.is_guest))).scalar_one()
    assert guests == 0


async def test_csrf_header_required(client):
    r = await client.post("/api/auth/guest", headers={"X-Requested-With": ""})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf"


async def test_protected_routes_need_session(client):
    r = await client.get("/api/studentgpt/conversations")
    assert r.status_code == 401


async def test_profile_update(member):
    r = await member.patch(
        "/api/auth/me",
        json={"display_name": "Asha K", "profile": {"field_of_study": "ECE", "year_of_study": "3"}},
    )
    assert r.status_code == 200
    assert r.json()["user"]["profile"] == {"field_of_study": "ECE", "year_of_study": "3"}


async def test_password_change(member):
    r = await member.post(
        "/api/auth/password",
        json={"current_password": "nope", "new_password": "brand-new-pw-2"},
    )
    assert r.status_code == 401
    r = await member.post(
        "/api/auth/password",
        json={"current_password": "correct-horse-1", "new_password": "brand-new-pw-2"},
    )
    assert r.status_code == 204
    await member.post("/api/auth/logout")
    r = await member.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "brand-new-pw-2"}
    )
    assert r.status_code == 200


async def test_delete_account_removes_everything(member):
    await member.post("/api/studentgpt/conversations", json={})
    r = await member.request("DELETE", "/api/auth/me", json={"password": "wrong"})
    assert r.status_code == 401
    r = await member.request("DELETE", "/api/auth/me", json={"password": "correct-horse-1"})
    assert r.status_code == 204
    assert (await member.get("/api/auth/session")).json()["user"] is None
    async with db_session.SessionLocal() as s:
        assert (await s.execute(select(func.count(User.id)))).scalar_one() == 0
        assert (await s.execute(select(func.count(SgConversation.id)))).scalar_one() == 0


async def test_login_rate_limited(member):
    await member.post("/api/auth/logout")
    codes = [
        (
            await member.post(
                "/api/auth/login", json={"email": "asha@example.com", "password": "bad-pw"}
            )
        ).status_code
        for _ in range(12)
    ]
    assert 429 in codes
