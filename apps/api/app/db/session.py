from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


def normalize_database_url(url: str) -> str:
    """Accept the plain `postgres://` URLs most hosts hand out and use the asyncpg driver."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    # asyncpg does not understand libpq's sslmode/channel_binding query params.
    if url.startswith("postgresql+asyncpg://") and "?" in url:
        base, query = url.split("?", 1)
        params = [p for p in query.split("&") if not p.startswith(("sslmode=", "channel_binding="))]
        if "sslmode=require" in query and not any(p.startswith("ssl=") for p in params):
            params.append("ssl=require")
        url = base + ("?" + "&".join(params) if params else "")
    return url


def _make_engine(url: str) -> AsyncEngine:
    url = normalize_database_url(url)
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
    engine = create_async_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine.sync_engine, "connect")
        def _fk_on(dbapi_conn, _):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            # Let readers and a writer coexist (streaming replies write in the background).
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.close()

    return engine


engine: AsyncEngine = _make_engine(get_settings().database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


def configure_engine(url: str) -> None:
    """Re-point the engine (used by tests)."""
    global engine, SessionLocal
    engine = _make_engine(url)
    SessionLocal.configure(bind=engine)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
