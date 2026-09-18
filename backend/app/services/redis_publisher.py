import json
import logging
import uuid
import redis
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger("redis_publisher")

_sync_client: redis.Redis | None = None


def get_sync_redis_client() -> redis.Redis:
    global _sync_client
    if _sync_client is None:
        _sync_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _sync_client


def get_async_redis_client() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def publish_event_sync(video_id: str | uuid.UUID, event_data: dict) -> bool:
    """
    Publish a real-time progress event to Redis Pub/Sub synchronously.
    Channel: video:{video_id}:progress
    """
    vid = str(video_id)
    channel = f"video:{vid}:progress"
    try:
        payload = json.dumps(event_data)
        client = get_sync_redis_client()
        subscribers = client.publish(channel, payload)
        logger.info(
            f"Published event to {channel} (active subscribers={subscribers}): {event_data.get('type')}"
        )
        return True
    except Exception as e:
        logger.warning(f"Failed to publish Redis event to {channel}: {e}")
        return False


async def publish_event_async(video_id: str | uuid.UUID, event_data: dict) -> bool:
    """
    Publish a real-time progress event to Redis Pub/Sub asynchronously.
    Channel: video:{video_id}:progress
    """
    return publish_event_sync(video_id, event_data)
