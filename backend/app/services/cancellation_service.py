import logging
import uuid
import asyncio
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository
from app.services.redis_publisher import publish_video_cancelled
from video_finalizer.producer import (
    get_video_finalizer_producer,
    publish_video_finalizer_job,
)

logger = logging.getLogger("cancellation_service")


@dataclass(frozen=True)
class CancellationSettlement:
    status: str
    chunk_transitioned: bool = False
    video_transitioned: bool = False
    finalization_published: bool = False


async def settle_video_cancellation(
    db: AsyncSession,
    video_id: uuid.UUID,
    cancelled_chunk_id: uuid.UUID | None = None,
) -> CancellationSettlement:
    """Idempotently settle cancellation while serializing competing workers."""
    video_status = await video_repository.get_status_for_update(db, video_id)
    if video_status is None:
        await db.rollback()
        return CancellationSettlement(status="NOT_FOUND")
    if video_status not in {"CANCELLING", "CANCELLED"}:
        await db.rollback()
        return CancellationSettlement(status=video_status)

    chunk_transitioned = False
    if cancelled_chunk_id is not None:
        chunk_transitioned = await chunk_repository.mark_cancelled(
            db, cancelled_chunk_id
        )

    processing_count = await chunk_repository.count_processing_chunks_for_video(
        db, video_id
    )
    if processing_count > 0:
        await db.commit()
        return CancellationSettlement(
            status="CANCELLING",
            chunk_transitioned=chunk_transitioned,
        )

    if video_status == "CANCELLED":
        await db.commit()
        return CancellationSettlement(
            status="CANCELLED",
            chunk_transitioned=chunk_transitioned,
        )

    has_renditions = await rendition_repository.has_renditions(db, video_id)
    all_chunks_done = await chunk_repository.are_all_chunks_done_for_video(db, video_id)
    all_renditions_ready = has_renditions and (
        await rendition_repository.are_all_renditions_completed(db, video_id)
    )

    if all_chunks_done and all_renditions_ready:
        continued = await video_repository.continue_cancelled_completion(db, video_id)
        await db.commit()
        finalization_published = False
        if continued:
            try:
                producer = get_video_finalizer_producer()
                if producer is None:
                    raise RuntimeError("video finalizer producer is unavailable")
                await asyncio.to_thread(
                    publish_video_finalizer_job,
                    producer,
                    str(video_id),
                )
                await asyncio.to_thread(producer.flush)
                finalization_published = True
            except Exception:
                logger.error(
                    "Could not publish finalization for cancellation race video=%s",
                    video_id,
                    exc_info=True,
                )
        return CancellationSettlement(
            status="PROCESSING",
            chunk_transitioned=chunk_transitioned,
            finalization_published=finalization_published,
        )

    await rendition_repository.mark_cancelling_as_cancelled(db, video_id)
    video_transitioned = await video_repository.mark_cancelled(db, video_id)
    await db.commit()

    if video_transitioned:
        await publish_video_cancelled(video_id)

    return CancellationSettlement(
        status="CANCELLED",
        chunk_transitioned=chunk_transitioned,
        video_transitioned=video_transitioned,
    )
