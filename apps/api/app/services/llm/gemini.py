"""Google Gemini via the public REST API (free tier available through Google AI Studio)."""

import json
from collections.abc import AsyncIterator

import httpx

from app.services.llm.base import ChatMessage, LLMError, LLMProvider, LLMResult, Usage
from app.services.llm.http_util import post_with_retry, raise_for_status


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
    ) -> dict:
        generation: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if json_mode:
            generation["responseMimeType"] = "application/json"
        # Gemini 2.5 Flash models "think" by default, which spends free-tier output tokens.
        if self._thinking_budget is not None and "2.5-flash" in model:
            generation["thinkingConfig"] = {"thinkingBudget": self._thinking_budget}
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in messages
        ]
        return {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": generation,
        }

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
        body = self._body(system, messages, model, temperature, max_tokens, json_mode)
        response = await post_with_retry(self._client, url, provider="Gemini", json=body)
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
        body = self._body(system, messages, model, temperature, max_tokens, False)
        produced = False
        try:
            async with self._client.stream("POST", url, json=body) as response:
                if response.status_code >= 400:
                    await response.aread()
                    raise_for_status(response, "Gemini")
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
