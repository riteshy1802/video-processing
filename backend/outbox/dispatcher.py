import asyncio
import logging

from confluent_kafka import Producer

from app.config import settings
from app.database import AsyncSessionLocal
from app.repositories.outbox_repository import outbox_repository
from app.core.shutdown import install_shutdown_handlers, wait_for_shutdown
from app.core.kafka import create_json_producer, flush_producer, produce_json

logger = logging.getLogger("outbox_dispatcher")


def create_outbox_producer() -> Producer:
    return create_json_producer()


def publish_and_flush(producer: Producer, topic: str, payload: dict) -> None:
    entity_key = (
        payload.get("chunk_id")
        or payload.get("rendition_id")
        or payload.get("video_id")
    )
    future = produce_json(
        producer,
        topic,
        payload,
        key=str(entity_key) if entity_key else None,
    )
    future.get(timeout=10)
    flush_producer(producer)


async def dispatch_one(producer: Producer) -> bool:
    """Publish one event without holding a DB connection during Kafka I/O."""
    async with AsyncSessionLocal() as db:
        event = await outbox_repository.get_next_unpublished(db)
        if event is None:
            return False
        payload = dict(event.payload)
        payload["outbox_event_id"] = str(event.id)
        event_id = event.id
        topic = event.topic

    try:
        await asyncio.to_thread(
            publish_and_flush,
            producer,
            topic,
            payload,
        )
    except Exception:
        logger.exception(
            "Failed to dispatch outbox event id=%s topic=%s",
            event_id,
            topic,
        )
        raise

    async with AsyncSessionLocal() as db:
        await outbox_repository.mark_published_by_id(db, event_id)
    logger.info("Dispatched outbox event id=%s topic=%s", event_id, topic)
    return True


async def run_dispatcher() -> None:
    producer = create_outbox_producer()
    shutdown_event = asyncio.Event()
    install_shutdown_handlers(shutdown_event, logger)
    logger.info("Transactional outbox dispatcher started")
    try:
        while not shutdown_event.is_set():
            try:
                dispatched = await dispatch_one(producer)
            except Exception:
                await wait_for_shutdown(
                    shutdown_event,
                    settings.OUTBOX_POLL_INTERVAL_SECONDS,
                )
                continue
            if not dispatched:
                await wait_for_shutdown(
                    shutdown_event,
                    settings.OUTBOX_POLL_INTERVAL_SECONDS,
                )
    finally:
        flush_producer(producer)
