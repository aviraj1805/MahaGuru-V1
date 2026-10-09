"""Provider-agnostic LLM interface.

Every AI feature talks to `LLMProvider`; the vendor is a configuration value. This keeps the
product working when a model is retired or a free tier changes.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal

Role = Literal["user", "assistant"]


@dataclass
class ChatMessage:
    role: Role
    content: str


@dataclass
class Usage:
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class LLMResult:
    text: str
    usage: Usage = field(default_factory=Usage)


class LLMError(Exception):
    """The model call failed in a way the user should hear about (shown as a friendly error)."""

    user_message = "The AI service had a problem answering. Please try again in a moment."

    def __init__(self, detail: str = "", *, user_message: str | None = None):
        super().__init__(detail or self.user_message)
        if user_message:
            self.user_message = user_message


class LLMRateLimited(LLMError):
    user_message = (
        "The AI is getting a lot of requests right now (free-tier limit). "
        "Please wait a minute and try again."
    )

    def __init__(self, detail: str = "", retry_after: float | None = None):
        super().__init__(detail)
        self.retry_after = retry_after


class LLMBadRequest(LLMError):
    """The provider rejected the request itself (HTTP 400), e.g. a setting the model doesn't take."""


class LLMProvider(ABC):
    """Implementations: GeminiProvider, OpenAICompatProvider, FakeProvider (tests/offline only)."""

    name: str = "base"

    def __init__(self, max_concurrency: int = 4):
        self._semaphore = asyncio.Semaphore(max_concurrency)

    @abstractmethod
    async def _complete(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        task: str,
    ) -> LLMResult: ...

    @abstractmethod
    def _stream(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        task: str,
        usage: Usage,
    ) -> AsyncIterator[str]: ...

    async def complete(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
        task: str = "generic",
    ) -> LLMResult:
        async with self._semaphore:
            return await self._complete(
                system=system,
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=json_mode,
                task=task,
            )

    async def stream(
        self,
        *,
        system: str,
        messages: list[ChatMessage],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        task: str = "generic",
        usage: Usage | None = None,
    ) -> AsyncIterator[str]:
        usage = usage if usage is not None else Usage()
        async with self._semaphore:
            async for chunk in self._stream(
                system=system,
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                task=task,
                usage=usage,
            ):
                yield chunk

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None
