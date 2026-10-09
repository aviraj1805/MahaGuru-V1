import os
import tempfile

# Configure before the app is imported.
_DB_DIR = tempfile.mkdtemp(prefix="mahaguru-test-")
os.environ.update(
    {
        "ENV": "test",
        "LLM_PROVIDER": "fake",
        "DATABASE_URL": os.environ.get("TEST_DATABASE_URL")
        or f"sqlite+aiosqlite:///{_DB_DIR}/test.db",
        "VALIDATE_RESOURCE_LINKS": "false",
        "WEB_DIST_DIR": "/nonexistent",
        "GUEST_DAILY_MESSAGES": "6",
    }
)

import json  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.core.ratelimit import auth_limiter, guest_limiter  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.llm import set_llm  # noqa: E402
from app.services.llm.fake import FakeProvider  # noqa: E402

HEADERS = {"X-Requested-With": "mahaguru"}


@pytest.fixture
async def fake_llm():
    provider = FakeProvider()
    set_llm(provider)
    yield provider
    set_llm(None)


@pytest.fixture
async def app(fake_llm):
    async with db_session.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    auth_limiter.reset()
    guest_limiter.reset()
    yield create_app()
    # Pooled connections are bound to this test's event loop.
    await db_session.engine.dispose()


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver", headers=HEADERS
    ) as c:
        yield c


@pytest.fixture
async def make_client(app):
    """Factory for additional independent browsers (separate cookie jars)."""
    clients = []

    async def _make():
        c = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver", headers=HEADERS
        )
        clients.append(c)
        return c

    yield _make
    for c in clients:
        await c.aclose()


@pytest.fixture
async def guest(client):
    r = await client.post("/api/auth/guest")
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
async def member(client):
    r = await client.post(
        "/api/auth/signup",
        json={"email": "asha@example.com", "password": "correct-horse-1", "display_name": "Asha"},
    )
    assert r.status_code == 201, r.text
    return client


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        name, data = None, None
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data = json.loads(line[5:].strip())
        if name:
            events.append((name, data))
    return events
