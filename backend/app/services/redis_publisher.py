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
    vid = str(video_id)
    channel = f"video:{vid}:progress"
    client = get_async_redis_client()
    try:
        subscribers = await client.publish(channel, json.dumps(event_data))
        logger.info(
            "Published event to %s (active subscribers=%s): %s",
            channel,
            subscribers,
            event_data.get("type"),
        )
        return True
    except Exception as e:
        logger.warning("Failed to publish Redis event to %s: %s", channel, e)
        return False
    finally:
        await client.aclose()


async def publish_video_cancelled(video_id: str | uuid.UUID) -> bool:
    """Publish the terminal cancellation event on the video's SSE channel."""
    return await publish_event_async(
        video_id,
        {
            "type": "video.cancelled",
            "video_id": str(video_id),
            "status": "CANCELLED",
            "message": "Video processing stopped",
        },
    )

async def publish_video_cancel(video_id: str | uuid.UUID) -> bool:
    """
    Broadcast a video cancellation request to all transcode workers.

    Workers subscribed to the shared `video.cancel` channel will receive it.
    Only workers currently processing this video will react.
    """

    try:
        client = get_async_redis_client()

        payload = json.dumps({
            "video_id": str(video_id),
        })

        subscribers = await client.publish(
            "video.cancel",
            payload,
        )

        logger.info(
            f"Published cancellation for video={video_id} "
            f"(active subscribers={subscribers})"
        )

        await client.aclose()
        return True

    except Exception as e:
        logger.warning(
            f"Failed to publish cancellation for video={video_id}: {e}"
        )
        return False
