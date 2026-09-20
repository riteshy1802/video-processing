import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.rendition import Rendition
from app.models.video import Video


class RenditionRepository:
    async def get_by_id(
        self, db: AsyncSession, rendition_id: uuid.UUID
    ) -> Optional[Rendition]:
        """Fetches a rendition by UUID with chunks loaded."""
        stmt = (
            select(Rendition)
            .where(Rendition.id == rendition_id)
            .options(selectinload(Rendition.chunks))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def has_renditions(self, db: AsyncSession, video_id: uuid.UUID) -> bool:
        """
        Checks if any rendition already exists for the given video_id.
        Returns True if the video has already been planned / initialized.
        """
        stmt = select(Rendition.id).where(Rendition.video_id == video_id).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_by_video_id(
        self, db: AsyncSession, video_id: uuid.UUID
    ) -> List[Rendition]:
        """Fetches all renditions for a specific video sorted by resolution descending."""
        stmt = (
            select(Rendition)
            .where(Rendition.video_id == video_id)
            .order_by(Rendition.resolution.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_video_id(
        self,
        db: AsyncSession,
        rendition_id: uuid.UUID,
    ) -> uuid.UUID | None:
        stmt = select(Rendition.video_id).where(Rendition.id == rendition_id)
        return (await db.execute(stmt)).scalar_one_or_none()

    async def create_renditions(
        self, db: AsyncSession, renditions: List[Rendition]
    ) -> List[Rendition]:
        """Bulk inserts new Rendition records."""
        db.add_all(renditions)
        await db.commit()
        for r in renditions:
            await db.refresh(r)
        return renditions

    async def update_status(
        self,
        db: AsyncSession,
        rendition: Rendition,
        status: str,
        error_message: Optional[str] = None,
    ) -> Rendition:
        """Updates rendition status and outputs."""
        now = datetime.now(timezone.utc)
        rendition.status = status
        rendition.updated_at = now

        if status == "READY":
            rendition.completed_at = now

        if error_message:
            rendition.error_message = error_message

        await db.commit()
        await db.refresh(rendition)
        return rendition

    async def are_all_renditions_completed(
        self, db: AsyncSession, video_id: uuid.UUID
    ) -> bool:
        """Checks if all renditions belonging to a video are READY."""
        stmt = (
            select(Rendition.id)
            .where(Rendition.video_id == video_id, Rendition.status != "READY")
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is None

    async def mark_unfinished_as_cancelling(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """
        Mark unfinished renditions as CANCELLING.

        READY renditions remain READY.
        FAILED/CANCELLED terminal renditions remain unchanged.

        Return the number of affected renditions.
        """
        stmt = (
            update(Rendition)
            .where(
                Rendition.video_id == video_id,
                Rendition.status.in_(["PENDING", "PROCESSING"]),
            )
            .values(
                status="CANCELLING",
                updated_at=datetime.now(timezone.utc),
            )
        )

        result = await db.execute(stmt)

        # Do not commit here.
        # video_service owns the cancellation transaction.
        return result.rowcount

    async def mark_cancelling_as_cancelled(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """
        Transition CANCELLING renditions to CANCELLED after
        all active chunk processing for the video has stopped.

        READY / FAILED / already CANCELLED renditions remain unchanged.

        Returns the number of affected renditions.
        """

        stmt = (
            update(Rendition)
            .where(
                Rendition.video_id == video_id,
                Rendition.status == "CANCELLING",
            )
            .values(
                status="CANCELLED",
                updated_at=datetime.now(timezone.utc),
            )
        )

        result = await db.execute(stmt)

        # Do not commit here.
        # The service owns the transaction.
        return result.rowcount

    async def mark_ready_if_processing(
        self,
        db: AsyncSession,
        rendition_id: uuid.UUID,
        playlist_s3_key: str,
        completed_at: datetime,
        processing_time_seconds: float | None,
    ) -> bool:
        """Prevent a concurrent cancellation from becoming READY."""
        stmt = (
            update(Rendition)
            .where(
                Rendition.id == rendition_id,
                Rendition.status == "PROCESSING",
                Rendition.video_id.in_(
                    select(Video.id).where(Video.status == "PROCESSING")
                ),
            )
            .values(
                status="READY",
                playlist_s3_key=playlist_s3_key,
                completed_at=completed_at,
                processing_time_seconds=processing_time_seconds,
                updated_at=completed_at,
            )
        )
        result = await db.execute(stmt)
        return result.rowcount == 1

    async def get_cancelled_ids_for_video(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        stmt = select(Rendition.id).where(
            Rendition.video_id == video_id,
            Rendition.status == "CANCELLED",
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def resume_cancelled(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """Resume unfinished renditions while preserving READY renditions."""
        stmt = (
            update(Rendition)
            .where(
                Rendition.video_id == video_id,
                Rendition.status == "CANCELLED",
            )
            .values(
                status="PROCESSING",
                completed_at=None,
                processing_time_seconds=None,
                updated_at=datetime.now(timezone.utc),
            )
        )
        result = await db.execute(stmt)
        return result.rowcount

    async def redrive_failed_finalization(
        self,
        db: AsyncSession,
        rendition_id: uuid.UUID,
        commit: bool = True,
    ) -> bool:
        """Restore only a failed rendition whose parent video is still active."""
        video_status_stmt = (
            select(Video.status)
            .join(Rendition, Rendition.video_id == Video.id)
            .where(Rendition.id == rendition_id)
            .with_for_update(of=Video)
        )
        video_status = (await db.execute(video_status_stmt)).scalar_one_or_none()
        if video_status != "PROCESSING":
            await db.rollback()
            return False

        result = await db.execute(
            update(Rendition)
            .where(
                Rendition.id == rendition_id,
                Rendition.status == "FAILED",
            )
            .values(
                status="PROCESSING",
                playlist_s3_key=None,
                completed_at=None,
                processing_time_seconds=None,
                updated_at=datetime.now(timezone.utc),
            )
        )
        if result.rowcount == 1:
            if commit:
                await db.commit()
            else:
                await db.flush()
            return True

        current_status = (
            await db.execute(
                select(Rendition.status).where(Rendition.id == rendition_id)
            )
        ).scalar_one_or_none()
        if current_status != "PROCESSING":
            await db.rollback()
        return current_status == "PROCESSING"


rendition_repository = RenditionRepository()
