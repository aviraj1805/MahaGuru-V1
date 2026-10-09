"""Google Gemini via the public REST API (free tier available through Google AI Studio)."""

import json
from collections.abc import AsyncIterator

import httpx

from app.services.llm.base import (
    ChatMessage,
    LLMBadRequest,
    LLMError,
    LLMProvider,
    LLMResult,
    Usage,
)
from app.services.llm.http_util import open_stream, post_with_retry


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout: float = 60.0,
        max_concurrency: int = 4,
        thinking_budget: int | None = 0,
    ):
        super().__init__(max_concurrency)
        self._base_url = base_url.rstrip("/")
        self._thinking_budget = thinking_budget
        # Per model: the thinking setting the API accepted (see _thinking_options).
        self._thinking_choice: dict[str, dict | None] = {}
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
            headers={"x-goog-api-key": api_key, "content-type": "application/json"},
        )

    def _body(
        self,
        system: str,
        messages: list[ChatMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        thinking: dict | None = None,
    ) -> dict:
        generation: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if json_mode:
            generation["responseMimeType"] = "application/json"
        if thinking:
            generation["thinkingConfig"] = thinking
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in messages
        ]
        return {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": generation,
        }

    def _thinking_options(self, model: str) -> list[dict | None]:
        """Thinking settings to try for a model, best first.

        Flash models "think" by default, which adds latency, spends free-tier quota and can use up
        max_tokens before any answer is written. Gemini 3 models differ in which "off" setting they
        accept (some reject thinkingLevel "minimal", others thinkingBudget 0), so the alternatives
        are tried in turn on HTTP 400 and the one that works is remembered.
        """
        budget = self._thinking_budget
        if budget is None or "flash" not in model:
            return [None]
        if model in self._thinking_choice:
            return [self._thinking_choice[model]]
        if "2.5-flash" in model:
            return [{"thinkingBudget": budget}]
        if budget == 0:
            return [{"thinkingLevel": "minimal"}, {"thinkingBudget": 0}, None]
        return [{"thinkingBudget": budget}, None]

    @staticmethod
    def _extract(payload: dict) -> tuple[str, str | None]:
        candidates = payload.get("candidates") or []
        if not candidates:
            block = (payload.get("promptFeedback") or {}).get("blockReason")
            return "", block
        cand = candidates[0]
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        return text, cand.get("finishReason")

    @staticmethod
    def _usage(payload: dict, usage: Usage) -> None:
        meta = payload.get("usageMetadata") or {}
        usage.input_tokens = meta.get("promptTokenCount", usage.input_tokens) or 0
        usage.output_tokens = meta.get("candidatesTokenCount", usage.output_tokens) or 0

    async def _complete(self, *, system, messages, model, temperature, max_tokens, json_mode, task):
        url = f"{self._base_url}/models/{model}:generateContent"
        options = self._thinking_options(model)
        for i, thinking in enumerate(options):
            body = self._body(system, messages, model, temperature, max_tokens, json_mode, thinking)
            try:
                response = await post_with_retry(self._client, url, provider="Gemini", json=body)
                break
            except LLMBadRequest:
                if i == len(options) - 1:
                    raise
        self._thinking_choice[model] = thinking
        payload = response.json()
        text, reason = self._extract(payload)
        usage = Usage(model=model)
        self._usage(payload, usage)
        if not text.strip():
            raise LLMError(f"Gemini returned no text (finish/block reason: {reason})")
        return LLMResult(text=text, usage=usage)

    async def _stream(
        self, *, system, messages, model, temperature, max_tokens, task, usage
    ) -> AsyncIterator[str]:
        usage.model = model
        url = f"{self._base_url}/models/{model}:streamGenerateContent?alt=sse"
        options = self._thinking_options(model)
        produced = False
        try:
            for i, thinking in enumerate(options):
                body = self._body(system, messages, model, temperature, max_tokens, False, thinking)
                try:
                    async with open_stream(
                        self._client, url, provider="Gemini", json=body
                    ) as response:
                        self._thinking_choice[model] = thinking
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if not data:
                                continue
                            payload = json.loads(data)
                            self._usage(payload, usage)
                            text, _ = self._extract(payload)
                            if text:
                                produced = True
                                yield text
                    break
                except LLMBadRequest:
                    if produced or i == len(options) - 1:
                        raise
        except httpx.TimeoutException as exc:
            raise LLMError(
                "Gemini stream timeout",
                user_message="The AI took too long to respond. Please try again.",
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Gemini stream error: {exc}") from exc
        if not produced:
            raise LLMError("Gemini stream produced no text")

    async def aclose(self) -> None:
        await self._client.aclose()
