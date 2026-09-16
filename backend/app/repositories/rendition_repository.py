import uuid
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rendition import Rendition


class RenditionRepository:
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
        """Fetches all renditions for a specific video."""
        stmt = select(Rendition).where(Rendition.video_id == video_id)
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


rendition_repository = RenditionRepository()
