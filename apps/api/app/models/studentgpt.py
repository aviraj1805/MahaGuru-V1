from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, utcnow


class SgConversation(IdMixin, TimestampMixin, Base):
    __tablename__ = "sg_conversations"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(160), default="New reflection")
    title_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    stage: Mapped[str] = mapped_column(String(20), default="opening")
    # The "understanding" record maintained by the engine (see services/studentgpt/state.py).
    state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    risk_level: Mapped[str] = mapped_column(String(12), default="none")
    clarity: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    messages: Mapped[list["SgMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="SgMessage.created_at",
    )


class SgMessage(IdMixin, Base):
    __tablename__ = "sg_messages"

    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sg_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(12))  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conversation: Mapped[SgConversation] = relationship(back_populates="messages")


class SafetyEvent(IdMixin, Base):
    """Records that a safety protocol was triggered. Stores the category, never message text."""

    __tablename__ = "safety_events"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sg_conversations.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[str] = mapped_column(String(12))
    category: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(12))  # "rules" | "model"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
