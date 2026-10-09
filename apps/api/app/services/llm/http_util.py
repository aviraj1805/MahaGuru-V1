import asyncio
import random

import httpx

from app.services.llm.base import LLMError, LLMRateLimited


def retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after")
    if not value:
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
        raise LLMRateLimited(detail, retry_after=retry_after_seconds(response))
    if response.status_code in (401, 403):
        raise LLMError(
            detail,
            user_message="The AI service rejected our credentials. The site owner needs to "
            "check the API key configuration.",
        )
    if response.status_code == 404:
        raise LLMError(
            detail,
            user_message="The configured AI model was not found. The site owner needs to update "
            "the model name.",
        )
    raise LLMError(detail)


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
            transient = response.status_code == 429 or response.status_code >= 500
            if not transient or attempt >= retries:
                raise_for_status(response, provider)
                return response
            wait = retry_after_seconds(response)
            if wait is not None and wait > 8:
                raise_for_status(response, provider)
        attempt += 1
        await asyncio.sleep(min(8.0, (2**attempt) * 0.5 + random.random() * 0.5))
