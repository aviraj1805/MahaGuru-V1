"""All ORM models. Importing this package registers every table on `Base.metadata`."""

from app.models.classroom import (
    Assessment,
    Assignment,
    Classroom,
    Lesson,
    Mastery,
    Module,
    RoadmapRevision,
    TeacherMessage,
)
from app.models.studentgpt import SafetyEvent, SgConversation, SgMessage
from app.models.user import AuthSession, UsageEvent, User

__all__ = [
    "Assessment",
    "Assignment",
    "AuthSession",
    "Classroom",
    "Lesson",
    "Mastery",
    "Module",
    "RoadmapRevision",
    "SafetyEvent",
    "SgConversation",
    "SgMessage",
    "TeacherMessage",
    "UsageEvent",
    "User",
]
