from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_MESSAGE_CHARS = 4000


class ConversationCreateIn(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class ConversationUpdateIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    stage: str
    has_clarity: bool = False
    created_at: datetime
    updated_at: datetime


class ConversationOut(ConversationSummary):
    messages: list[MessageOut]
    explored: dict[str, Any]
    clarity: dict[str, Any] | None
    risk_level: str
    helplines: list[dict[str, str]]
