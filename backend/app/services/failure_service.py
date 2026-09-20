import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository
from app.services.redis_publisher import (
    publish_video_cancel,
    publish_video_failed,
    publish_video_failing,
)


@dataclass(frozen=True)
class FailureInitiation:
    status: str
    chunk_transitioned: bool = False
    video_transitioned: bool = False


@dataclass(frozen=True)
class FailureSettlement:
    status: str
    chunk_transitioned: bool = False
    video_transitioned: bool = False
    error_message: str | None = None


async def begin_video_failure(
    db: AsyncSession,
    *,
    video_id: uuid.UUID,
    error_message: str,
    failed_chunk_id: uuid.UUID | None = None,
    worker_id: str | None = None,
) -> FailureInitiation:
    """Atomically preserve the root failure and stop unclaimed pipeline work.

    A planner or finalizer can fail before/without an owned chunk, so the chunk
    transition is optional. Transcode failures still supply the owned chunk so
    that the root failed chunk remains FAILED while its peers are cancelled.
    """
    video_status = await video_repository.get_status_for_update(db, video_id)
    # If user cancellation and terminal failure race while this chunk is still
    # PROCESSING, the concrete terminal failure wins and cannot become CANCELLED.
    if video_status == "FAILED":
        await db.rollback()
        return FailureInitiation(status=video_status)
    if video_status == "FAILING":
        chunk_transitioned = False
        if failed_chunk_id is not None:
            chunk_transitioned = await chunk_repository.mark_failed(
                db,
                failed_chunk_id,
                error_message,
                worker_id,
            )
        if chunk_transitioned:
            await db.commit()
        else:
            await db.rollback()
        return FailureInitiation(
            status="FAILING",
            chunk_transitioned=chunk_transitioned,
        )
    if video_status not in {"UPLOADED", "PROCESSING", "FINALIZING", "CANCELLING"}:
        await db.rollback()
        return FailureInitiation(status=video_status or "NOT_FOUND")

    chunk_transitioned = False
    if failed_chunk_id is not None:
        chunk_transitioned = await chunk_repository.mark_failed(
            db,
            failed_chunk_id,
            error_message,
            worker_id,
        )
        # Losing chunk ownership must not suppress a video-scoped permanent
        # failure. The current owner will observe FAILING and settle that chunk
        # as CANCELLED; only the still-owning failing worker may write FAILED.

    video_transitioned = await video_repository.mark_failing(
        db,
        video_id,
        error_message,
    )
    if not video_transitioned:
        await db.rollback()
        return FailureInitiation(status=video_status)

    await chunk_repository.cancel_pending_chunks(db, video_id)
    await rendition_repository.mark_unfinished_as_cancelling(db, video_id)
    await db.commit()
    return FailureInitiation(
        status="FAILING",
        chunk_transitioned=chunk_transitioned,
        video_transitioned=True,
    )


async def propagate_video_failure(
    *,
    video_id: str | uuid.UUID,
    error_message: str,
    failed_chunk_id: str | uuid.UUID | None = None,
    worker_id: str | None = None,
) -> tuple[FailureInitiation, FailureSettlement | None]:
    """Run the existing durable failure, cancellation-signal, and settlement flow."""
    try:
        video_uuid = video_id if isinstance(video_id, uuid.UUID) else uuid.UUID(video_id)
        chunk_uuid = (
            failed_chunk_id
            if isinstance(failed_chunk_id, uuid.UUID)
            else uuid.UUID(failed_chunk_id)
            if failed_chunk_id is not None
            else None
        )
    except (TypeError, ValueError):
        return FailureInitiation(status="NOT_FOUND"), None

    async with AsyncSessionLocal() as db:
        initiation = await begin_video_failure(
            db,
            video_id=video_uuid,
            failed_chunk_id=chunk_uuid,
            error_message=error_message,
            worker_id=worker_id,
        )

    if initiation.status not in {"FAILING", "FAILED"}:
        return initiation, None

    if initiation.video_transitioned:
        await publish_video_failing(video_uuid, error_message)

    # Re-publishing the fast signal is harmless and helps duplicate terminal
    # messages stop any worker that missed the first Redis notification.
    if initiation.status == "FAILING":
        await publish_video_cancel(video_uuid)

    async with AsyncSessionLocal() as db:
        settlement = await settle_video_failure(db, video_uuid)
    return initiation, settlement


async def settle_video_failure(
    db: AsyncSession,
    video_id: uuid.UUID,
    cancelled_chunk_id: uuid.UUID | None = None,
    worker_id: str | None = None,
) -> FailureSettlement:
    """Idempotently settle FAILING to FAILED after active workers stop."""
    video = await video_repository.get_by_id_for_update(db, video_id)
    if video is None:
        await db.rollback()
        return FailureSettlement(status="NOT_FOUND")
    if video.status not in {"FAILING", "FAILED"}:
        await db.rollback()
        return FailureSettlement(status=video.status)

    chunk_transitioned = False
    if cancelled_chunk_id is not None:
        chunk_transitioned = await chunk_repository.mark_cancelled(
            db,
            cancelled_chunk_id,
            worker_id,
        )

    processing_count = await chunk_repository.count_processing_chunks_for_video(
        db,
        video_id,
    )
    if processing_count > 0:
        await db.commit()
        return FailureSettlement(
            status="FAILING",
            chunk_transitioned=chunk_transitioned,
            error_message=video.error_message,
        )

    if video.status == "FAILED":
        await db.commit()
        return FailureSettlement(
            status="FAILED",
            chunk_transitioned=chunk_transitioned,
            error_message=video.error_message,
        )

    await rendition_repository.mark_cancelling_as_cancelled(db, video_id)
    video_transitioned = await video_repository.mark_failed(db, video_id)
    error_message = video.error_message or "Video processing failed"
    await db.commit()

    if video_transitioned:
        await publish_video_failed(video_id, error_message)

    return FailureSettlement(
        status="FAILED",
        chunk_transitioned=chunk_transitioned,
        video_transitioned=video_transitioned,
        error_message=error_message,
    )
