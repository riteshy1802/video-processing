import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.outbox_repository import outbox_repository


async def _recently_enqueued(
    db: AsyncSession,
    dedupe_key: str,
    minimum_interval_seconds: int | None,
) -> bool:
    if minimum_interval_seconds is None:
        return False
    return await outbox_repository.was_enqueued_since(
        db,
        dedupe_key=dedupe_key,
        since=datetime.now(timezone.utc)
        - timedelta(seconds=minimum_interval_seconds),
    )


async def enqueue_planner_job(db: AsyncSession, video_id: uuid.UUID | str) -> bool:
    entity_id = str(video_id)
    return await outbox_repository.enqueue(
        db,
        event_type="planner.job",
        topic=settings.KAFKA_PLANNER_TOPIC,
        payload={"video_id": entity_id, "attempt": 1},
        dedupe_key=f"planner:{entity_id}",
    )


async def enqueue_transcode_job(
    db: AsyncSession,
    chunk_id: uuid.UUID | str,
    minimum_interval_seconds: int | None = None,
) -> bool:
    entity_id = str(chunk_id)
    dedupe_key = f"transcode:{entity_id}"
    if await _recently_enqueued(db, dedupe_key, minimum_interval_seconds):
        return False
    return await outbox_repository.enqueue(
        db,
        event_type="transcode.job",
        topic=settings.KAFKA_WORKER_TOPIC,
        payload={"chunk_id": entity_id, "attempt": 1},
        dedupe_key=dedupe_key,
    )


async def enqueue_rendition_finalizer_job(
    db: AsyncSession,
    rendition_id: uuid.UUID | str,
    minimum_interval_seconds: int | None = None,
) -> bool:
    entity_id = str(rendition_id)
    dedupe_key = f"rendition-finalize:{entity_id}"
    if await _recently_enqueued(db, dedupe_key, minimum_interval_seconds):
        return False
    return await outbox_repository.enqueue(
        db,
        event_type="rendition.finalize.job",
        topic=settings.KAFKA_FINALIZE_TOPIC,
        payload={"rendition_id": entity_id, "attempt": 1},
        dedupe_key=dedupe_key,
    )


async def enqueue_video_finalizer_job(
    db: AsyncSession,
    video_id: uuid.UUID | str,
    minimum_interval_seconds: int | None = None,
) -> bool:
    entity_id = str(video_id)
    dedupe_key = f"video-finalize:{entity_id}"
    if await _recently_enqueued(db, dedupe_key, minimum_interval_seconds):
        return False
    return await outbox_repository.enqueue(
        db,
        event_type="video.finalize.job",
        topic=settings.KAFKA_FINALIZE_VIDEO_TOPIC,
        payload={"video_id": entity_id, "attempt": 1},
        dedupe_key=dedupe_key,
    )
