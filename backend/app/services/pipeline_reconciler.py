import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Chunk, Rendition, Video
from app.services.outbox_service import (
    enqueue_rendition_finalizer_job,
    enqueue_transcode_job,
    enqueue_video_finalizer_job,
)
from app.services.pipeline_settlement import settle_stopped_video
from app.services.redis_publisher import publish_event_async

logger = logging.getLogger("pipeline_reconciler")


@dataclass(frozen=True)
class ReconciliationResult:
    expired_chunks_recovered: int = 0
    expired_chunks_cancelled: int = 0
    rendition_jobs_queued: int = 0
    video_jobs_queued: int = 0
    transitional_videos_settled: int = 0


async def reconcile_pipeline(db: AsyncSession) -> ReconciliationResult:
    """Repair a small set of active pipeline states without touching terminals."""
    now = datetime.now(timezone.utc)
    limit = settings.RECONCILER_BATCH_SIZE
    cooldown = settings.RECONCILER_REQUEUE_AFTER_SECONDS

    expired_chunks = list(
        (
            await db.execute(
                select(Chunk, Video.status, Video.id, Rendition.resolution)
                .join(Rendition, Chunk.rendition_id == Rendition.id)
                .join(Video, Rendition.video_id == Video.id)
                .where(
                    Video.status.in_(["PROCESSING", "CANCELLING", "FAILING"]),
                    Rendition.status.in_(["PROCESSING", "CANCELLING"]),
                    Chunk.status == "PROCESSING",
                    or_(
                        Chunk.lease_expires_at.is_(None),
                        Chunk.lease_expires_at <= now,
                    ),
                )
                .order_by(Chunk.updated_at, Chunk.id)
                .limit(limit)
                .with_for_update(of=Chunk, skip_locked=True)
            )
        ).all()
    )
    recovered_chunk_count = 0
    recovered_chunk_events: list[dict] = []
    cancelled_chunk_events: list[dict] = []
    for chunk, video_status, video_id, resolution in expired_chunks:
        chunk.progress_percent = 0.0
        chunk.worker_id = None
        chunk.lease_expires_at = None
        chunk.ffmpeg_progress = None
        chunk.updated_at = now
        if video_status == "PROCESSING":
            chunk.status = "PENDING"
            chunk.processing_started_at = None
            chunk.completed_at = None
            chunk.processing_time_seconds = None
            await enqueue_transcode_job(db, chunk.id)
            recovered_chunk_count += 1
            recovered_chunk_events.append(
                {
                    "type": "chunk.retrying",
                    "video_id": str(video_id),
                    "rendition_id": str(chunk.rendition_id),
                    "chunk_id": str(chunk.id),
                    "chunk_index": chunk.chunk_index,
                    "resolution": resolution,
                    "status": "RETRYING",
                    "progress": 0.0,
                    "worker_id": None,
                    "attempt": chunk.attempt_count + 1,
                    "message": "Recovering · queued after worker stopped",
                }
            )
        else:
            chunk.status = "CANCELLED"
            chunk.completed_at = now
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
            cancelled_chunk_events.append(
                {
                    "type": "chunk.cancelled",
                    "video_id": str(video_id),
                    "rendition_id": str(chunk.rendition_id),
                    "chunk_id": str(chunk.id),
                    "chunk_index": chunk.chunk_index,
                    "resolution": resolution,
                    "status": "CANCELLED",
                    "progress": 0.0,
                    "message": "Expired worker lease was settled during shutdown",
                }
            )

    await db.flush()

    incomplete_chunk_exists = exists(
        select(Chunk.id).where(
            Chunk.rendition_id == Rendition.id,
            Chunk.status != "DONE",
        )
    )
    any_chunk_exists = exists(
        select(Chunk.id).where(Chunk.rendition_id == Rendition.id)
    )
    ready_for_finalization = list(
        (
            await db.execute(
                select(Rendition)
                .join(Video, Rendition.video_id == Video.id)
                .where(
                    Video.status == "PROCESSING",
                    Rendition.status.in_(["PENDING", "PROCESSING"]),
                    any_chunk_exists,
                    ~incomplete_chunk_exists,
                )
                .order_by(Rendition.updated_at, Rendition.id)
                .limit(limit)
                .with_for_update(of=Rendition, skip_locked=True)
            )
        ).scalars()
    )
    rendition_jobs_queued = 0
    for rendition in ready_for_finalization:
        if rendition.status == "PENDING":
            rendition.status = "PROCESSING"
            rendition.processing_started_at = rendition.processing_started_at or now
            rendition.updated_at = now
        if await enqueue_rendition_finalizer_job(
            db,
            rendition.id,
            minimum_interval_seconds=cooldown,
        ):
            rendition_jobs_queued += 1

    await db.flush()

    incomplete_rendition_exists = exists(
        select(Rendition.id).where(
            Rendition.video_id == Video.id,
            Rendition.status != "READY",
        )
    )
    any_rendition_exists = exists(
        select(Rendition.id).where(Rendition.video_id == Video.id)
    )
    stale_finalizing_before = now - timedelta(
        seconds=settings.VIDEO_FINALIZATION_TIMEOUT_SECONDS
    )
    videos_ready_for_finalization = list(
        (
            await db.execute(
                select(Video)
                .where(
                    or_(
                        Video.status.in_(["UPLOADED", "PROCESSING"]),
                        (
                            (Video.status == "FINALIZING")
                            & (
                                (Video.finalizing_started_at.is_(None))
                                | (Video.finalizing_started_at <= stale_finalizing_before)
                            )
                        ),
                    ),
                    any_rendition_exists,
                    ~incomplete_rendition_exists,
                )
                .order_by(Video.processing_started_at, Video.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    video_jobs_queued = 0
    for video in videos_ready_for_finalization:
        if video.status != "PROCESSING":
            video.status = "PROCESSING"
            video.finalizing_started_at = None
        if await enqueue_video_finalizer_job(
            db,
            video.id,
            minimum_interval_seconds=cooldown,
        ):
            video_jobs_queued += 1

    processing_chunk_exists = exists(
        select(Chunk.id)
        .join(Rendition, Chunk.rendition_id == Rendition.id)
        .where(
            Rendition.video_id == Video.id,
            Chunk.status == "PROCESSING",
        )
    )
    transitional_videos = list(
        (
            await db.execute(
                select(Video.id)
                .where(
                    Video.status.in_(["CANCELLING", "FAILING"]),
                    ~processing_chunk_exists,
                )
                .order_by(Video.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )

    await db.commit()

    for event in recovered_chunk_events + cancelled_chunk_events:
        await publish_event_async(event["video_id"], event)

    settled_count = 0
    for video_id in transitional_videos:
        settlement = await settle_stopped_video(db, video_id)
        if settlement.status in {"CANCELLED", "FAILED"}:
            settled_count += 1

    return ReconciliationResult(
        expired_chunks_recovered=recovered_chunk_count,
        expired_chunks_cancelled=len(cancelled_chunk_events),
        rendition_jobs_queued=rendition_jobs_queued,
        video_jobs_queued=video_jobs_queued,
        transitional_videos_settled=settled_count,
    )
