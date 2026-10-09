"""Any OpenAI-compatible Chat Completions endpoint: Groq, OpenRouter, Together, Ollama, vLLM..."""

import json
from collections.abc import AsyncIterator

import httpx

from app.services.llm.base import ChatMessage, LLMError, LLMProvider, LLMResult, Usage
from app.services.llm.http_util import open_stream, post_with_retry


class OpenAICompatProvider(LLMProvider):
    name = "openai_compat"

    def __init__(
        self, base_url: str, api_key: str | None, timeout: float = 60.0, max_concurrency: int = 4
    ):
        super().__init__(max_concurrency)
        headers = {"content-type": "application/json"}
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0), headers=headers
        )

    @staticmethod
    def _messages(system: str, messages: list[ChatMessage]) -> list[dict]:
        return [{"role": "system", "content": system}] + [
            {"role": m.role, "content": m.content} for m in messages
        ]

    async def _complete(self, *, system, messages, model, temperature, max_tokens, json_mode, task):
        body: dict = {
            "model": model,
            "messages": self._messages(system, messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        response = await post_with_retry(self._client, self._url, provider="LLM", json=body)
        payload = response.json()
        try:
            text = payload["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"Unexpected completion payload: {str(payload)[:200]}") from exc
        meta = payload.get("usage") or {}
        usage = Usage(
            model=model,
            input_tokens=meta.get("prompt_tokens", 0) or 0,
            output_tokens=meta.get("completion_tokens", 0) or 0,
        )
        if not text.strip():
            raise LLMError("Model returned no text")
        return LLMResult(text=text, usage=usage)

    async def _stream(
        self, *, system, messages, model, temperature, max_tokens, task, usage
    ) -> AsyncIterator[str]:
        usage.model = model
        body = {
            "model": model,
            "messages": self._messages(system, messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        produced = False
        try:
            async with open_stream(self._client, self._url, provider="LLM", json=body) as response:
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    payload = json.loads(data)
                    if payload.get("usage"):
                        usage.input_tokens = payload["usage"].get("prompt_tokens", 0) or 0
                        usage.output_tokens = payload["usage"].get("completion_tokens", 0) or 0
                    for choice in payload.get("choices") or []:
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            produced = True
                            yield delta
        except httpx.TimeoutException as exc:
            raise LLMError(
                "stream timeout", user_message="The AI took too long to respond. Please try again."
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"stream error: {exc}") from exc
        if not produced:
            raise LLMError("Stream produced no text")

    async def aclose(self) -> None:
        await self._client.aclose()
