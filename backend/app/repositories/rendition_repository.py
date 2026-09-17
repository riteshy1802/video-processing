import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.rendition import Rendition


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
        master_playlist_url: Optional[str] = None,
    ) -> Rendition:
        """Updates rendition status and outputs."""
        now = datetime.now(timezone.utc)
        rendition.status = status
        rendition.updated_at = now

        if status == "COMPLETED":
            rendition.completed_at = now

        if error_message:
            rendition.error_message = error_message

        await db.commit()
        await db.refresh(rendition)
        return rendition

    async def are_all_renditions_completed(
        self, db: AsyncSession, video_id: uuid.UUID
    ) -> bool:
        """Checks if all renditions belonging to a video are COMPLETED."""
        stmt = (
            select(Rendition.id)
            .where(Rendition.video_id == video_id, Rendition.status != "COMPLETED")
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is None


rendition_repository = RenditionRepository()
