import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update, or_
from sqlalchemy.orm import selectinload
from app.config import settings
from app.models.video import Video
from app.models.video_event import VideoEvent


def _sanitize_metadata(data: Any) -> Any:
    """Recursively converts datetimes, UUIDs, and bytes to JSON-serializable primitives."""
    if isinstance(data, dict):
        return {k: _sanitize_metadata(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_sanitize_metadata(v) for v in data]
    elif isinstance(data, (datetime, uuid.UUID)):
        return str(data)
    elif isinstance(data, bytes):
        return data.decode("utf-8", errors="ignore")
    return data


class VideoRepository:
    async def create_video(self, db: AsyncSession, video: Video) -> Video:
        """Inserts new Video record into database."""
        db.add(video)
        await db.commit()
        await db.refresh(video)
        return video

    async def get_by_id(self, db: AsyncSession, video_id: uuid.UUID) -> Optional[Video]:
        """Fetches video by UUID with renditions loaded."""
        stmt = (
            select(Video)
            .where(Video.id == video_id)
            .options(selectinload(Video.renditions))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_s3_key(self, db: AsyncSession, s3_key: str) -> Optional[Video]:
        """Fetches video by unique S3 key."""
        stmt = select(Video).where(Video.s3_key == s3_key)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_videos(
        self, db: AsyncSession, limit: int = 100, offset: int = 0
    ) -> List[Video]:
        """Returns list of uploaded videos sorted by created_at descending."""
        stmt = (
            select(Video)
            .options(selectinload(Video.renditions))
            .order_by(
                func.coalesce(Video.uploaded_at, Video.created_at).desc(),
                Video.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self,
        db: AsyncSession,
        video: Video,
        status: str,
        uploaded_at: Optional[datetime] = None,
        processing_started_at: Optional[datetime] = None,
        error_message: Optional[str] = None,
    ) -> Video:
        """Updates video status and timestamps."""
        video.status = status
        if uploaded_at:
            video.uploaded_at = uploaded_at
        if processing_started_at:
            video.processing_started_at = processing_started_at
        if error_message:
            video.error_message = error_message
            video.failed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(video)
        return video

    async def update_filename(
        self, db: AsyncSession, video: Video, filename: str
    ) -> Video:
        """Updates only the database display filename; the S3 object key is unchanged."""
        video.original_filename = filename
        await db.commit()
        await db.refresh(video)
        return video

    async def delete_video(self, db: AsyncSession, video: Video) -> None:
        """Deletes video and cascades linked renditions, chunks, and events."""
        await db.delete(video)
        await db.commit()

    async def claim_for_finalization(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """
        Multiple workers can complete rendition jobs simultaneously.
        Atomically claims status="FINALIZING" or reclaims stale FINALIZING jobs
        older than VIDEO_FINALIZATION_TIMEOUT_SECONDS.
        """
        now = datetime.now(timezone.utc)

        stale_before = now - timedelta(
            seconds=settings.VIDEO_FINALIZATION_TIMEOUT_SECONDS
        )

        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                or_(
                    Video.status == "PROCESSING",
                    (
                        (Video.status == "FINALIZING")
                        & (Video.finalizing_started_at < stale_before)
                    ),
                ),
            )
            .values(
                status="FINALIZING",
                finalizing_started_at=now,
            )
        )

        result = await db.execute(stmt)

        if result.rowcount == 1:
            await db.commit()
            return True

        await db.rollback()
        return False

    async def log_event(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        event_type: str,
        message: Optional[str] = None,
        event_metadata: Optional[Dict[str, Any]] = None,
        rendition_id: Optional[uuid.UUID] = None,
        chunk_id: Optional[uuid.UUID] = None,
    ) -> VideoEvent:
        """Inserts VideoEvent audit log."""
        sanitized_meta = (
            _sanitize_metadata(event_metadata) if event_metadata is not None else None
        )
        event = VideoEvent(
            video_id=video_id,
            rendition_id=rendition_id,
            chunk_id=chunk_id,
            event_type=event_type,
            message=message,
            event_metadata=sanitized_meta,
            created_at=datetime.now(timezone.utc),
        )
        db.add(event)
        await db.commit()
        return event


video_repository = VideoRepository()
