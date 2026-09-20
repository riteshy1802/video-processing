import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.chunk import Chunk
from app.models.rendition import Rendition
from app.models.video import Video


class ChunkRepository:
    async def get_by_id(self, db: AsyncSession, chunk_id: uuid.UUID) -> Optional[Chunk]:
        """Fetches a chunk by UUID with rendition loaded."""
        stmt = (
            select(Chunk)
            .where(Chunk.id == chunk_id)
            .options(selectinload(Chunk.rendition))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_rendition_id(
        self, db: AsyncSession, rendition_id: uuid.UUID
    ) -> List[Chunk]:
        """Fetches all chunks for a rendition, sorted by chunk_index ascending."""
        stmt = (
            select(Chunk)
            .where(Chunk.rendition_id == rendition_id)
            .order_by(Chunk.chunk_index.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self,
        db: AsyncSession,
        chunk: Chunk,
        status: str,
        worker_id: Optional[str] = None,
        error_message: Optional[str] = None,
        processing_time_seconds: Optional[float] = None,
    ) -> Chunk:
        """Updates chunk status, worker attribution, and processing timestamps."""
        now = datetime.now(timezone.utc)
        chunk.status = status
        chunk.updated_at = now

        if worker_id:
            chunk.worker_id = worker_id

        if status == "PROCESSING":
            chunk.processing_started_at = now
            chunk.attempt_count += 1
        elif status in ("DONE", "COMPLETED"):
            chunk.completed_at = now
            chunk.lease_expires_at = None
            if processing_time_seconds is not None:
                chunk.processing_time_seconds = processing_time_seconds
            elif chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        elif status == "FAILED":
            chunk.lease_expires_at = None
            if error_message:
                chunk.error_message = error_message

        await db.commit()
        await db.refresh(chunk)
        return chunk

    async def are_all_chunks_completed(
        self, db: AsyncSession, rendition_id: uuid.UUID
    ) -> bool:
        """Return True only when the rendition has chunks and every one is DONE."""
        stmt = select(
            func.count(Chunk.id),
            func.count(Chunk.id).filter(Chunk.status != "DONE"),
        ).where(Chunk.rendition_id == rendition_id)
        total, incomplete = (await db.execute(stmt)).one()
        return total > 0 and incomplete == 0

    async def get_status_for_worker(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
    ) -> str | None:
        stmt = select(Chunk.status).where(Chunk.id == chunk_id)

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def is_processing(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
    ) -> bool:
        stmt = select(Chunk.id).where(
            Chunk.id == chunk_id,
            Chunk.status == "PROCESSING",
        )
        return (await db.execute(stmt)).scalar_one_or_none() is not None

    async def claim_for_processing(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        worker_id: str,
        lease_duration_seconds: int,
    ) -> bool:
        """Atomically claim PENDING or reclaim expired PROCESSING work."""
        # Serialize claims with cancellation on the parent video. Otherwise a
        # claim and cancel can update different rows from stale snapshots.
        video_status_stmt = (
            select(Video.status)
            .join(Rendition, Rendition.video_id == Video.id)
            .join(Chunk, Chunk.rendition_id == Rendition.id)
            .where(
                Chunk.id == chunk_id,
            )
            .with_for_update(of=Video)
        )
        video_status = (await db.execute(video_status_stmt)).scalar_one_or_none()
        if video_status != "PROCESSING":
            await db.rollback()
            return False

        now = datetime.now(timezone.utc)
        lease_expires_at = func.now() + timedelta(seconds=lease_duration_seconds)

        stmt = (
            update(Chunk)
            .where(
                Chunk.id == chunk_id,
                or_(
                    Chunk.status == "PENDING",
                    and_(
                        Chunk.status == "PROCESSING",
                        or_(
                            Chunk.lease_expires_at.is_(None),
                            Chunk.lease_expires_at <= func.now(),
                        ),
                    ),
                ),
            )
            .values(
                status="PROCESSING",
                worker_id=worker_id,
                lease_expires_at=lease_expires_at,
                processing_started_at=now,
                progress_percent=0.0,
                ffmpeg_progress=None,
                attempt_count=Chunk.attempt_count + 1,
                completed_at=None,
                processing_time_seconds=None,
                updated_at=now,
            )
        )

        result = await db.execute(stmt)

        if result.rowcount == 0:
            await db.rollback()
            return False

        await db.commit()
        return True

    async def extend_lease(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        worker_id: str,
        lease_duration_seconds: int,
    ) -> bool:
        """Extend an unexpired lease only for its current owner."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(Chunk)
            .where(
                Chunk.id == chunk_id,
                Chunk.status == "PROCESSING",
                Chunk.worker_id == worker_id,
                Chunk.lease_expires_at.is_not(None),
                Chunk.lease_expires_at > func.now(),
            )
            .values(
                lease_expires_at=func.now()
                + timedelta(seconds=lease_duration_seconds),
                updated_at=now,
            )
        )
        await db.commit()
        return result.rowcount == 1

    async def owns_active_lease(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        worker_id: str,
    ) -> bool:
        stmt = select(Chunk.id).where(
            Chunk.id == chunk_id,
            Chunk.status == "PROCESSING",
            Chunk.worker_id == worker_id,
            Chunk.lease_expires_at.is_not(None),
            Chunk.lease_expires_at > func.now(),
        )
        return (await db.execute(stmt)).scalar_one_or_none() is not None

    async def cancel_pending_chunks(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """
        Mark all PENDING chunks belonging to the video as CANCELLED.

        PROCESSING chunks are left untouched because their FFmpeg
        processes may still be running.

        DONE / FAILED / CANCELLED chunks are also left untouched.

        Returns the number of chunks cancelled.
        """
        rendition_ids = select(Rendition.id).where(Rendition.video_id == video_id)

        stmt = (
            update(Chunk)
            .where(
                Chunk.rendition_id.in_(rendition_ids),
                Chunk.status == "PENDING",
            )
            .values(
                status="CANCELLED",
                progress_percent=0.0,
                worker_id=None,
                lease_expires_at=None,
                ffmpeg_progress=None,
                updated_at=datetime.now(timezone.utc),
            )
        )

        result = await db.execute(stmt)
        # Do NOT commit here.
        # video_service owns the cancellation transaction.
        # video service later commits the video + chunk + rendition cancellation changes together.
        return result.rowcount

    async def mark_cancelled(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        worker_id: str | None = None,
    ) -> bool:
        """Conditionally mark only a currently PROCESSING chunk CANCELLED."""
        now = datetime.now(timezone.utc)
        chunk = await db.get(Chunk, chunk_id, with_for_update=True)
        if (
            chunk is None
            or chunk.status != "PROCESSING"
            or (worker_id is not None and chunk.worker_id != worker_id)
        ):
            return False

        chunk.status = "CANCELLED"
        chunk.progress_percent = 0.0
        chunk.ffmpeg_progress = None
        chunk.completed_at = now
        chunk.updated_at = now
        chunk.worker_id = None
        chunk.lease_expires_at = None
        if chunk.processing_started_at:
            chunk.processing_time_seconds = (
                now - chunk.processing_started_at
            ).total_seconds()
        return True

    async def mark_failed(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        error_message: str,
        worker_id: str | None = None,
    ) -> bool:
        """Conditionally preserve the current owner's terminal chunk as FAILED."""
        now = datetime.now(timezone.utc)
        chunk = (
            await db.execute(
                select(Chunk)
                .where(
                    Chunk.id == chunk_id,
                    Chunk.status == "PROCESSING",
                    Chunk.worker_id == worker_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if chunk is None:
            return False

        chunk.status = "FAILED"
        chunk.error_message = error_message
        chunk.completed_at = now
        chunk.updated_at = now
        chunk.worker_id = worker_id
        chunk.lease_expires_at = None
        if chunk.processing_started_at:
            chunk.processing_time_seconds = (
                now - chunk.processing_started_at
            ).total_seconds()
        return True

    async def count_processing_chunks_for_video(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """
        Count chunks belonging to this video that are still PROCESSING.

        Used to determine whether all active FFmpeg work has stopped
        and video cancellation can safely be finalized.
        """
        stmt = (
            select(func.count(Chunk.id))
            .join(
                Rendition,
                Chunk.rendition_id == Rendition.id,
            )
            .where(
                Rendition.video_id == video_id,
                Chunk.status == "PROCESSING",
            )
        )
        result = await db.execute(stmt)

        return result.scalar_one()

    async def are_all_chunks_done_for_video(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> bool:
        stmt = (
            select(Chunk.id)
            .join(Rendition, Chunk.rendition_id == Rendition.id)
            .where(
                Rendition.video_id == video_id,
                Chunk.status != "DONE",
            )
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none() is None

    async def resume_cancelled_chunks(
        self,
        db: AsyncSession,
        rendition_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        """Reset only CANCELLED chunks belonging to resumed renditions."""
        if not rendition_ids:
            return []

        ids_stmt = select(Chunk.id).where(
            Chunk.rendition_id.in_(rendition_ids),
            Chunk.status == "CANCELLED",
        )
        chunk_ids = list((await db.execute(ids_stmt)).scalars().all())
        if not chunk_ids:
            return []

        now = datetime.now(timezone.utc)
        await db.execute(
            update(Chunk)
            .where(
                Chunk.id.in_(chunk_ids),
                Chunk.status == "CANCELLED",
            )
            .values(
                status="PENDING",
                progress_percent=0.0,
                worker_id=None,
                lease_expires_at=None,
                processing_started_at=None,
                completed_at=None,
                processing_time_seconds=None,
                error_message=None,
                ffmpeg_progress=None,
                updated_at=now,
            )
        )
        return chunk_ids

    async def get_pending_ids_for_renditions(
        self,
        db: AsyncSession,
        rendition_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        if not rendition_ids:
            return []
        stmt = (
            select(Chunk.id)
            .where(
                Chunk.rendition_id.in_(rendition_ids),
                Chunk.status == "PENDING",
            )
            .order_by(Chunk.rendition_id, Chunk.chunk_index)
        )
        return list((await db.execute(stmt)).scalars().all())

    async def release_for_retry(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        error_message: str,
        worker_id: str | None,
    ) -> bool:
        """Persist a retryable error and safely return PROCESSING to PENDING."""
        video_status_stmt = (
            select(Video.status)
            .join(Rendition, Rendition.video_id == Video.id)
            .join(Chunk, Chunk.rendition_id == Rendition.id)
            .where(Chunk.id == chunk_id)
            .with_for_update(of=Video)
        )
        video_status = (await db.execute(video_status_stmt)).scalar_one_or_none()
        if video_status != "PROCESSING":
            await db.rollback()
            return False

        now = datetime.now(timezone.utc)
        stmt = (
            update(Chunk)
            .where(
                Chunk.id == chunk_id,
                Chunk.status == "PROCESSING",
                Chunk.worker_id == worker_id,
            )
            .values(
                status="PENDING",
                progress_percent=0.0,
                worker_id=None,
                lease_expires_at=None,
                processing_started_at=None,
                completed_at=None,
                processing_time_seconds=None,
                error_message=error_message,
                ffmpeg_progress=None,
                updated_at=now,
            )
        )
        result = await db.execute(stmt)
        if result.rowcount == 1:
            await db.commit()
            return True

        # A failure can occur while acquiring the claim itself. In that case
        # PENDING is already the correct retry state and no attempt was made.
        current_status = await self.get_status_for_worker(db, chunk_id)
        if current_status == "PENDING":
            await db.execute(
                update(Chunk)
                .where(Chunk.id == chunk_id, Chunk.status == "PENDING")
                .values(error_message=error_message, updated_at=now)
            )
            await db.commit()
            return True

        await db.rollback()
        return False

    async def redrive_failed(
        self,
        db: AsyncSession,
        chunk_id: uuid.UUID,
        commit: bool = True,
    ) -> bool:
        """Make a terminally failed chunk claimable without reviving cancellation."""
        video_status_stmt = (
            select(Video.status)
            .join(Rendition, Rendition.video_id == Video.id)
            .join(Chunk, Chunk.rendition_id == Rendition.id)
            .where(Chunk.id == chunk_id)
            .with_for_update(of=Video)
        )
        video_status = (await db.execute(video_status_stmt)).scalar_one_or_none()
        if video_status != "PROCESSING":
            await db.rollback()
            return False

        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(Chunk)
            .where(
                Chunk.id == chunk_id,
                Chunk.status == "FAILED",
            )
            .values(
                status="PENDING",
                progress_percent=0.0,
                worker_id=None,
                processing_started_at=None,
                completed_at=None,
                processing_time_seconds=None,
                error_message=None,
                ffmpeg_progress=None,
                lease_expires_at=None,
                updated_at=now,
            )
        )
        if result.rowcount == 1:
            if commit:
                await db.commit()
            else:
                await db.flush()
            return True

        current_status = await self.get_status_for_worker(db, chunk_id)
        if current_status != "PENDING":
            await db.rollback()
        return current_status == "PENDING"


chunk_repository = ChunkRepository()
