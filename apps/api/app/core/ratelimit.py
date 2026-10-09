"""Tiny in-process sliding-window limiter for abuse-prone endpoints (login, signup, guest creation).

Single-instance deployments only; per-user AI quotas live in the database (services/quota.py).
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise AppError(429, "rate_limited", "Too many attempts. Please wait a minute.")
        q.append(now)
        if len(self._hits) > 10_000:  # bound memory
            self._hits.pop(next(iter(self._hits)))

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


auth_limiter = SlidingWindowLimiter(limit=10, window_seconds=60)
guest_limiter = SlidingWindowLimiter(limit=20, window_seconds=3600)
