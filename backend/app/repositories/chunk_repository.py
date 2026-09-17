import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.chunk import Chunk


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
        elif status == "COMPLETED":
            chunk.completed_at = now
            if processing_time_seconds is not None:
                chunk.processing_time_seconds = processing_time_seconds
            elif chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        elif status == "FAILED":
            if error_message:
                chunk.error_message = error_message

        await db.commit()
        await db.refresh(chunk)
        return chunk

    async def are_all_chunks_completed(
        self, db: AsyncSession, rendition_id: uuid.UUID
    ) -> bool:
        """Checks if all chunks belonging to a rendition are COMPLETED."""
        stmt = (
            select(Chunk.id)
            .where(Chunk.rendition_id == rendition_id, Chunk.status != "COMPLETED")
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is None


chunk_repository = ChunkRepository()
