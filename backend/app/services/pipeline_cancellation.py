import asyncio
import json
import logging
import uuid

from app.database import AsyncSessionLocal
from app.repositories.video_repository import video_repository
from app.services.redis_publisher import get_async_redis_client


CANCELLATION_STATUSES = {"CANCELLING", "CANCELLED"}


async def is_video_cancellation_requested(
    video_id: str | uuid.UUID,
    cancel_event: asyncio.Event | None = None,
) -> bool:
    """Use Redis for immediacy and PostgreSQL as the durable kill switch."""
    if cancel_event is not None and cancel_event.is_set():
        return True
    try:
        video_uuid = (
            video_id if isinstance(video_id, uuid.UUID) else uuid.UUID(video_id)
        )
    except (TypeError, ValueError):
        return False
    async with AsyncSessionLocal() as db:
        status = await video_repository.get_status(db, video_uuid)
    return status in CANCELLATION_STATUSES


async def listen_for_video_cancellations(
    active_job: dict,
    *,
    logger: logging.Logger,
    worker_name: str,
) -> None:
    """Set the current job's event without stopping the long-lived worker."""
    redis_client = get_async_redis_client()
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("video.cancel")
    logger.info("%s subscribed to Redis channel: video.cancel", worker_name)

    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message.get("data"))
                cancelled_video_id = str(payload["video_id"])
            except (json.JSONDecodeError, KeyError, TypeError):
                logger.warning("Invalid video.cancel message: %s", message.get("data"))
                continue

            if str(active_job.get("video_id")) != cancelled_video_id:
                continue
            cancel_event = active_job.get("cancel_event")
            if cancel_event is not None:
                logger.info(
                    "Cancellation received for active %s job video=%s",
                    worker_name,
                    cancelled_video_id,
                )
                cancel_event.set()
    finally:
        await pubsub.unsubscribe("video.cancel")
        await pubsub.aclose()
        await redis_client.aclose()
