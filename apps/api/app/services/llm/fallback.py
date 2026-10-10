"""Keep answering when a free model runs out of quota by switching to another free model."""

import logging
import time
from collections.abc import Callable

from app.services.llm.base import LLMProvider, LLMRateLimited
from app.services.llm.http_util import DAILY_LIMIT_SECONDS

log = logging.getLogger("mahaguru.llm")


class FallbackProvider(LLMProvider):
    """Free tiers cap each model separately (gemini-3.5-flash-lite: 500 requests a day per
    project). When a model is rate limited, the fallback models are tried in order. A model that
    hit its daily cap rests for `rest_seconds` before it is tried again, so students don't wait
    on it. A reply is never switched to another model once it has started streaming."""

    def __init__(
        self,
        inner: LLMProvider,
        fallbacks: list[str],
        rest_seconds: float = 3600,
        clock: Callable[[], float] = time.monotonic,
    ):
        super().__init__(max_concurrency=1000)  # the inner provider limits concurrency
        self.inner, self.fallbacks = inner, fallbacks
        self.name = inner.name
        self._rest_seconds, self._clock = rest_seconds, clock
        self._resting_until: dict[str, float] = {}

    def _models(self, model: str) -> list[str]:
        chain = [model] + [m for m in self.fallbacks if m != model]
        now = self._clock()
        ready = [m for m in chain if self._resting_until.get(m, 0) <= now]
        return ready or [model]  # all resting: ask the first one; the user gets the friendly error

    def _rate_limited(self, model: str, exc: LLMRateLimited) -> None:
        if (exc.retry_after or 0) > DAILY_LIMIT_SECONDS:
            self._resting_until[model] = self._clock() + self._rest_seconds
            log.warning("%s reached its daily limit; using fallback models for now", model)
        else:
            log.warning("%s is rate limited; trying a fallback model", model)

    async def _complete(self, *, model, **kwargs):
        error: LLMRateLimited | None = None
        for candidate in self._models(model):
            try:
                return await self.inner.complete(model=candidate, **kwargs)
            except LLMRateLimited as exc:
                self._rate_limited(candidate, exc)
                error = exc
        assert error is not None
        raise error

    async def _stream(self, *, model, **kwargs):
        error: LLMRateLimited | None = None
        for candidate in self._models(model):
            produced = False
            try:
                async for chunk in self.inner.stream(model=candidate, **kwargs):
                    produced = True
                    yield chunk
                return
            except LLMRateLimited as exc:
                if produced:
                    raise
                self._rate_limited(candidate, exc)
                error = exc
        assert error is not None
        raise error

    async def aclose(self) -> None:
        await self.inner.aclose()
