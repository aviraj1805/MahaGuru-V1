import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from app.api.routes import auth, classroom, dashboard, studentgpt
from app.core.config import get_settings
from app.core.errors import error_body, install_error_handlers
from app.db import session as db_session
from app.services.llm import get_llm

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("mahaguru")

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"


class SecurityMiddleware:
    """Pure ASGI (streaming-safe) middleware: CSRF header check + security headers.

    The API authenticates with a cookie, so state-changing requests must carry a custom header.
    Browsers cannot add it cross-site without a CORS preflight, which only our origins pass.
    """

    HEADERS = [
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (b"x-frame-options", b"DENY"),
    ]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        if (
            scope["method"] in UNSAFE_METHODS
            and scope["path"].startswith("/api/")
            and headers.get(CSRF_HEADER.encode()) != b"mahaguru"
        ):
            response = JSONResponse(
                error_body("csrf", "Missing request header. Please reload the page."),
                status_code=403,
            )
            return await response(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + self.HEADERS
            await send(message)

        await self.app(scope, receive, send_with_headers)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    log.info(
        "Starting %s (env=%s, llm=%s/%s)",
        settings.app_name,
        settings.env,
        settings.llm_provider,
        settings.llm_model,
    )
    yield
    await get_llm().aclose()
    await db_session.engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MahaGuru AI API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if not settings.is_production else None,
        openapi_url="/api/openapi.json" if not settings.is_production else None,
    )
    install_error_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["content-type", CSRF_HEADER],
    )

    app.add_middleware(SecurityMiddleware)

    for router in (auth.router, studentgpt.router, classroom.router, dashboard.router):
        app.include_router(router, prefix="/api")

    @app.get("/api/health", tags=["health"])
    async def health():
        db_ok = True
        try:
            async with db_session.SessionLocal() as db:
                await db.execute(text("SELECT 1"))
        except Exception:  # pragma: no cover - reported, not raised
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "database": db_ok,
            "llm_provider": settings.llm_provider,
            "demo_mode": settings.llm_provider == "fake",
        }

    _mount_web(app, Path(settings.web_dist_dir))
    return app


# Paths the React router renders (apps/web/src/App.tsx; a test keeps the two in sync). Any other
# path still gets the app, which shows its "page not found" screen, but with a real 404 status so
# search engines and link checkers don't index it as a page.
_SPA_ROUTES = re.compile(
    r"(|reflect(/[^/]+)?|learn(/new|/[^/]+(/lesson/[^/]+)?)?|dashboard|login|signup|account"
    r"|safety|privacy|research|about)/?"
)


def _mount_web(app: FastAPI, dist: Path) -> None:
    """Serve the built SPA from the same origin (single-service deployment)."""
    if not dist.is_absolute():
        dist = (Path(__file__).resolve().parent.parent / dist).resolve()
    index = dist / "index.html"
    if not index.exists():
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(error_body("not_found", "Not found."), status_code=404)
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist in candidate.parents:
            cache = "public, max-age=31536000, immutable" if "/assets/" in str(candidate) else None
            return FileResponse(candidate, headers={"Cache-Control": cache} if cache else None)
        status = 200 if _SPA_ROUTES.fullmatch(full_path) else 404
        return FileResponse(index, status_code=status, headers={"Cache-Control": "no-cache"})


app = create_app()
