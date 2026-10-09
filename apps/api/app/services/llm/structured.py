"""Reliable structured output: JSON mode + schema in the prompt + Pydantic validation + one repair."""

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.services.llm.base import ChatMessage, LLMError, LLMProvider, Usage

T = TypeVar("T", bound=BaseModel)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def extract_json(text: str) -> str:
    text = _FENCE.sub("", text.strip()).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


def schema_instructions(schema: type[BaseModel]) -> str:
    return (
        "\n\nRespond with ONLY one JSON object (no markdown fences, no commentary) that validates "
        "against this JSON Schema:\n"
        + json.dumps(schema.model_json_schema(), separators=(",", ":"))
    )


async def generate_structured(
    llm: LLMProvider,
    schema: type[T],
    *,
    task: str,
    system: str,
    prompt: str,
    model: str,
    temperature: float = 0.4,
    max_tokens: int = 4096,
    repairs: int = 1,
) -> tuple[T, Usage]:
    messages = [ChatMessage("user", prompt + schema_instructions(schema))]
    total = Usage(model=model)
    last_error = ""
    for _attempt in range(repairs + 1):
        result = await llm.complete(
            system=system,
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=True,
            task=task,
        )
        total.input_tokens += result.usage.input_tokens
        total.output_tokens += result.usage.output_tokens
        try:
            return schema.model_validate_json(extract_json(result.text)), total
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)[:800]
            messages = messages + [
                ChatMessage("assistant", result.text[:4000]),
                ChatMessage(
                    "user",
                    "That JSON was invalid: "
                    + last_error
                    + "\nReturn the corrected JSON object only.",
                ),
            ]
    raise LLMError(
        f"Structured output for {task} failed validation: {last_error}",
        user_message="The AI returned an incomplete answer. Please try again.",
    )
