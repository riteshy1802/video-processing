import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.video_repository import video_repository
from app.services.cancellation_service import settle_video_cancellation
from app.services.failure_service import settle_video_failure


async def settle_stopped_video(
    db: AsyncSession,
    video_id: uuid.UUID,
    stopped_chunk_id: uuid.UUID | None = None,
    worker_id: str | None = None,
):
    """Route worker shutdown settlement to cancellation or failure semantics."""
    # Hold the same parent-row lock used by both transition families so the
    # route cannot become stale between inspection and settlement.
    status = await video_repository.get_status_for_update(db, video_id)
    if status in {"FAILING", "FAILED"}:
        return await settle_video_failure(db, video_id, stopped_chunk_id, worker_id)
    return await settle_video_cancellation(db, video_id, stopped_chunk_id, worker_id)
