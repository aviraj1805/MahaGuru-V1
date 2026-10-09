import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
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

    @app.middleware("http")
    async def csrf_guard(request: Request, call_next):
        # Cookie-authenticated API: require a custom header on state-changing requests. Browsers
        # cannot send it cross-site without a CORS preflight, which only our origins pass.
        if (
            request.method in UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and request.headers.get(CSRF_HEADER) != "mahaguru"
        ):
            return JSONResponse(
                error_body("csrf", "Missing request header. Please reload the page."),
                status_code=403,
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        return response

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
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
