import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.models.outbox_event import OutboxEvent
from app.models.rendition import Rendition


class OutboxRepository:
    async def delete_for_video(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> int:
        """Remove every outbox record associated with a video and its work."""
        rendition_ids = list(
            (
                await db.execute(
                    select(Rendition.id).where(Rendition.video_id == video_id)
                )
            ).scalars()
        )
        chunk_ids: list[uuid.UUID] = []
        if rendition_ids:
            chunk_ids = list(
                (
                    await db.execute(
                        select(Chunk.id).where(Chunk.rendition_id.in_(rendition_ids))
                    )
                ).scalars()
            )

        dedupe_keys = {
            f"planner:{video_id}",
            f"video-finalize:{video_id}",
            *(f"rendition-finalize:{rendition_id}" for rendition_id in rendition_ids),
            *(f"transcode:{chunk_id}" for chunk_id in chunk_ids),
        }
        result = await db.execute(
            delete(OutboxEvent).where(OutboxEvent.dedupe_key.in_(dedupe_keys))
        )
        return result.rowcount or 0

    async def enqueue(
        self,
        db: AsyncSession,
        *,
        event_type: str,
        topic: str,
        payload: dict,
        dedupe_key: str,
    ) -> bool:
        """Add a job to the caller's transaction, deduplicating pending work."""
        insert_factory = (
            sqlite_insert
            if db.get_bind().dialect.name == "sqlite"
            else postgresql_insert
        )
        statement = (
            insert_factory(OutboxEvent)
            .values(
                id=uuid.uuid4(),
                event_type=event_type,
                topic=topic,
                payload=payload,
                dedupe_key=dedupe_key,
                publish_attempts=0,
                created_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing()
        )
        result = await db.execute(statement)
        return result.rowcount == 1

    async def lock_next_unpublished(
        self,
        db: AsyncSession,
    ) -> OutboxEvent | None:
        statement = (
            select(OutboxEvent)
            .where(OutboxEvent.published_at.is_(None))
            .order_by(OutboxEvent.created_at, OutboxEvent.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        return (await db.execute(statement)).scalar_one_or_none()

    async def get_next_unpublished(self, db: AsyncSession) -> OutboxEvent | None:
        """Return the next event without retaining a row lock during Kafka I/O."""
        statement = (
            select(OutboxEvent)
            .where(OutboxEvent.published_at.is_(None))
            .order_by(OutboxEvent.created_at, OutboxEvent.id)
            .limit(1)
        )
        return (await db.execute(statement)).scalar_one_or_none()

    async def mark_published_by_id(
        self,
        db: AsyncSession,
        event_id: uuid.UUID,
    ) -> bool:
        """Idempotently acknowledge an event after Kafka confirms delivery."""
        result = await db.execute(
            update(OutboxEvent)
            .where(
                OutboxEvent.id == event_id,
                OutboxEvent.published_at.is_(None),
            )
            .values(
                publish_attempts=OutboxEvent.publish_attempts + 1,
                last_error=None,
                published_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
        return result.rowcount == 1

    async def was_enqueued_since(
        self,
        db: AsyncSession,
        *,
        dedupe_key: str,
        since: datetime,
    ) -> bool:
        statement = (
            select(OutboxEvent.id)
            .where(
                OutboxEvent.dedupe_key == dedupe_key,
                OutboxEvent.created_at >= since,
            )
            .limit(1)
        )
        return (await db.execute(statement)).scalar_one_or_none() is not None

    def mark_published(self, event: OutboxEvent) -> None:
        event.publish_attempts += 1
        event.last_error = None
        event.published_at = datetime.now(timezone.utc)


outbox_repository = OutboxRepository()
