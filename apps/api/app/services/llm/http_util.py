import asyncio
import random
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

from app.services.llm.base import LLMBadRequest, LLMError, LLMRateLimited

# A rate limit that lasts longer than this is a daily cap, not a per-minute one.
DAILY_LIMIT_SECONDS = 3600


def retry_after_seconds(response: httpx.Response) -> float | None:
    """From the Retry-After header, or Gemini's RetryInfo detail (e.g. "retryDelay": "47286s")."""
    value = response.headers.get("retry-after")
    if not value:
        try:
            details = response.json().get("error", {}).get("details", [])
            value = next(
                str(d["retryDelay"]).rstrip("s")
                for d in details
                if isinstance(d, dict) and "retryDelay" in d
            )
        except (ValueError, AttributeError, StopIteration):
            return None
    try:
        return float(value)
    except ValueError:
        return None


def raise_for_status(response: httpx.Response, provider: str) -> None:
    if response.status_code < 400:
        return
    detail = f"{provider} HTTP {response.status_code}: {response.text[:300]}"
    if response.status_code == 429:
        wait = retry_after_seconds(response)
        exc = LLMRateLimited(detail, retry_after=wait)
        if wait is not None and wait > DAILY_LIMIT_SECONDS:
            exc.user_message = (
                "The AI has reached its free daily limit. Please try again tomorrow. "
                "Everything up to now is saved."
            )
        raise exc
    invalid_key = response.status_code == 400 and "API_KEY_INVALID" in response.text
    if response.status_code in (401, 403) or invalid_key:
        raise LLMError(
            detail,
            user_message="The AI service rejected our credentials. The site owner needs to "
            "check the API key configuration.",
        )
    if response.status_code == 400:
        raise LLMBadRequest(detail)
    if response.status_code == 404:
        raise LLMError(
            detail,
            user_message="The configured AI model was not found. The site owner needs to update "
            "the model name.",
        )
    raise LLMError(detail)


def _should_retry(response: httpx.Response, attempt: int, retries: int) -> bool:
    """Retry rate limits and server errors a bounded number of times, unless asked to wait long."""
    if attempt >= retries or not (response.status_code == 429 or response.status_code >= 500):
        return False
    wait = retry_after_seconds(response)
    return wait is None or wait <= 8


async def _backoff(attempt: int) -> None:
    await asyncio.sleep(min(8.0, (2**attempt) * 0.5 + random.random() * 0.5))


async def post_with_retry(
    client: httpx.AsyncClient, url: str, *, provider: str, retries: int = 2, **kwargs
) -> httpx.Response:
    """POST with a small, bounded retry on rate limits and transient server errors."""
    attempt = 0
    while True:
        try:
            response = await client.post(url, **kwargs)
        except httpx.TimeoutException as exc:
            if attempt >= retries:
                raise LLMError(
                    f"{provider} timeout",
                    user_message="The AI took too long to respond. Please try again.",
                ) from exc
        except httpx.HTTPError as exc:
            if attempt >= retries:
                raise LLMError(f"{provider} network error: {exc}") from exc
        else:
            if not _should_retry(response, attempt, retries):
                raise_for_status(response, provider)
                return response
        attempt += 1
        await _backoff(attempt)


@asynccontextmanager
async def open_stream(
    client: httpx.AsyncClient, url: str, *, provider: str, retries: int = 2, **kwargs
) -> AsyncIterator[httpx.Response]:
    """Open a streaming POST, retrying rate limits and server errors before any data is read.

    Once the response is handed to the caller nothing is retried, so a reply is never duplicated.
    """
    attempt = 0
    while True:
        async with client.stream("POST", url, **kwargs) as response:
            if response.status_code < 400:
                yield response
                return
            await response.aread()
            if not _should_retry(response, attempt, retries):
                raise_for_status(response, provider)
        attempt += 1
        await _backoff(attempt)
