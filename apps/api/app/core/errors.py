import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.services.llm.base import LLMError, LLMRateLimited

log = logging.getLogger("mahaguru")


class AppError(Exception):
    """An expected error with a user-facing message and a stable machine-readable code."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def not_found(what: str = "Resource") -> AppError:
    return AppError(404, "not_found", f"{what} not found.")


def error_body(code: str, message: str, **extra) -> dict:
    return {"error": {"code": code, "message": message, **extra}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status)

    @app.exception_handler(LLMRateLimited)
    async def _llm_rate(_: Request, exc: LLMRateLimited):
        log.warning("LLM rate limited: %s", exc)
        headers = {"Retry-After": str(int(exc.retry_after))} if exc.retry_after else None
        return JSONResponse(
            error_body("ai_rate_limited", exc.user_message), status_code=503, headers=headers
        )

    @app.exception_handler(LLMError)
    async def _llm_error(_: Request, exc: LLMError):
        log.error("LLM error: %s", exc)
        return JSONResponse(error_body("ai_error", exc.user_message), status_code=502)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        message = f"{field}: {first.get('msg', 'invalid value')}"
        return JSONResponse(
            error_body(
                "validation_error",
                message,
                details=[
                    {
                        "loc": list(e.get("loc", [])),
                        "msg": e.get("msg", ""),
                        "type": e.get("type", ""),
                    }
                    for e in exc.errors()[:5]
                ],
            ),
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):  # pragma: no cover - safety net
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            error_body("internal_error", "Something went wrong on our side. Please try again."),
            status_code=500,
        )
