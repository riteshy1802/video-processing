import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update, or_
from sqlalchemy.orm import selectinload
from app.config import settings
from app.models.video import Video
from app.models.rendition import Rendition
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
        self, db: AsyncSession, limit: int = 100, offset: int = 0, search: Optional[str] = None
    ) -> List[Video]:
        """Returns list of uploaded videos sorted by created_at descending."""
        stmt = (
            select(Video)
            .options(selectinload(Video.renditions))
        )
        if search and search.strip():
            stmt = stmt.where(Video.original_filename.ilike(f"%{search.strip()}%"))
        stmt = (
            stmt.order_by(
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
        commit: bool = True,
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

        if commit:
            await db.commit()
            await db.refresh(video)
        else:
            await db.flush()
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
        commit: bool = True,
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
        if commit:
            await db.commit()
        else:
            await db.flush()
        return event

    async def get_status(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> str | None:
        stmt = select(Video.status).where(Video.id == video_id)

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_status_for_update(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> str | None:
        """Lock a video row while a worker/cancellation transition is settled."""
        stmt = select(Video.status).where(Video.id == video_id).with_for_update()
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_for_update(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> Video | None:
        stmt = select(Video).where(Video.id == video_id).with_for_update()
        return (await db.execute(stmt)).scalar_one_or_none()

    async def mark_failing(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        error_message: str,
    ) -> bool:
        """Transition any active pipeline stage to durable failure shutdown."""
        result = await db.execute(
            update(Video)
            .where(
                Video.id == video_id,
                Video.status.in_(
                    ["UPLOADED", "PROCESSING", "FINALIZING", "CANCELLING"]
                ),
            )
            .values(status="FAILING", error_message=error_message)
        )
        return result.rowcount == 1

    async def mark_failed(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """Finalize failure only after all active chunks have stopped."""
        result = await db.execute(
            update(Video)
            .where(Video.id == video_id, Video.status == "FAILING")
            .values(status="FAILED", failed_at=datetime.now(timezone.utc))
        )
        return result.rowcount == 1

    async def mark_cancelling(self, db: AsyncSession, video_id: uuid.UUID) -> bool:
        """
        Atomically transition active pipeline work to CANCELLING.

        Returns True if the video was transitioned.
        Returns False if it was not in an active cancellable state.
        """
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status.in_(["UPLOADED", "PROCESSING", "FINALIZING"]),
            )
            .values(
                status="CANCELLING",
            )
        )
        result = await db.execute(stmt)
        return result.rowcount > 0

    async def mark_ready_if_finalizing(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        completed_at: datetime,
    ) -> bool:
        """Prevent cancellation from being overwritten by a READY transition."""
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "FINALIZING",
            )
            .values(
                status="READY",
                completed_at=completed_at,
            )
        )
        result = await db.execute(stmt)
        return result.rowcount == 1

    async def release_finalization_for_retry(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """Make a retryable video-finalizer job claimable again."""
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "FINALIZING",
            )
            .values(
                status="PROCESSING",
                finalizing_started_at=None,
            )
        )
        result = await db.execute(stmt)
        if result.rowcount == 1:
            await db.commit()
            return True

        current_status = await self.get_status(db, video_id)
        await db.rollback()
        return current_status == "PROCESSING"

    async def redrive_planning(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        commit: bool = True,
    ) -> bool:
        """Restore a failed planner job without reopening terminal cancellation."""
        video = (
            await db.execute(
                select(Video).where(Video.id == video_id).with_for_update()
            )
        ).scalar_one_or_none()
        if video is None or video.status in {"CANCELLING", "CANCELLED", "READY"}:
            await db.rollback()
            return False
        if video.status in {"UPLOADED", "PROCESSING"}:
            return True
        if video.status != "FAILED":
            await db.rollback()
            return False

        has_renditions = (
            await db.execute(
                select(Rendition.id)
                .where(Rendition.video_id == video_id)
                .limit(1)
            )
        ).scalar_one_or_none() is not None
        video.status = "PROCESSING" if has_renditions else "UPLOADED"
        video.error_message = None
        video.failed_at = None
        video.completed_at = None
        if commit:
            await db.commit()
        else:
            await db.flush()
        return True

    async def redrive_finalization(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        commit: bool = True,
    ) -> bool:
        """Make terminal/stuck video finalization manually claimable again."""
        result = await db.execute(
            update(Video)
            .where(
                Video.id == video_id,
                Video.status.in_(["FINALIZING", "FAILED"]),
            )
            .values(
                status="PROCESSING",
                finalizing_started_at=None,
                completed_at=None,
                failed_at=None,
                error_message=None,
            )
        )
        if result.rowcount == 1:
            if commit:
                await db.commit()
            else:
                await db.flush()
            return True

        current_status = await self.get_status(db, video_id)
        if current_status != "PROCESSING":
            await db.rollback()
        return current_status == "PROCESSING"

    async def mark_cancelled(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """
        Transition CANCELLING -> CANCELLED after no active chunks remain.
        """
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "CANCELLING",
            )
            .values(
                status="CANCELLED",
            )
        )
        result = await db.execute(stmt)
        return result.rowcount > 0

    async def continue_cancelled_completion(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """Return CANCELLING to PROCESSING only for legitimate finalization."""
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "CANCELLING",
            )
            .values(status="PROCESSING")
        )
        result = await db.execute(stmt)
        return result.rowcount == 1

    async def resume_cancelled(self, db: AsyncSession, video_id: uuid.UUID) -> bool:
        """Conditionally transition a fully CANCELLED video back to PROCESSING."""
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "CANCELLED",
            )
            .values(
                status="PROCESSING",
                completed_at=None,
                finalizing_started_at=None,
                error_message=None,
            )
        )
        result = await db.execute(stmt)
        return result.rowcount == 1

    async def resume_cancelled_for_planning(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        """Restore a pre-plan cancellation to the Planner's expected state."""
        stmt = (
            update(Video)
            .where(
                Video.id == video_id,
                Video.status == "CANCELLED",
            )
            .values(
                status="UPLOADED",
                completed_at=None,
                finalizing_started_at=None,
                error_message=None,
            )
        )
        result = await db.execute(stmt)
        return result.rowcount == 1


video_repository = VideoRepository()
