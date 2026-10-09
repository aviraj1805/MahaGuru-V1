from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.api.routes.classroom import list_classrooms
from app.models import SgConversation
from app.services import quota

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(db: DB, user: CurrentUser):
    """Everything the dashboard needs in one request."""
    conversations = (
        await db.execute(
            select(SgConversation)
            .where(SgConversation.user_id == user.id)
            .order_by(SgConversation.updated_at.desc())
            .limit(5)
        )
    ).scalars()
    return {
        "classrooms": [c.model_dump() for c in await list_classrooms(db, user)],
        "reflections": [
            {
                "id": c.id,
                "title": c.title,
                "stage": c.stage,
                "has_clarity": c.clarity is not None,
                "updated_at": c.updated_at,
            }
            for c in conversations
        ],
        "usage": await quota.summary(db, user),
    }
