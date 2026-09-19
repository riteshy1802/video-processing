import logging
import asyncio
import uuid
from finalizer.consumer import create_finalizer_consumer
from finalizer.rendition_finalizer import finalize_rendition
from app.database import AsyncSessionLocal
from app.repositories.rendition_repository import rendition_repository
from app.services.pipeline_cancellation import listen_for_video_cancellations

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("finalizer_main")


async def resolve_video_id(rendition_id: str) -> str | None:
    try:
        rendition_uuid = uuid.UUID(rendition_id)
    except (TypeError, ValueError):
        return None
    async with AsyncSessionLocal() as db:
        video_id = await rendition_repository.get_video_id(db, rendition_uuid)
    return str(video_id) if video_id else None


async def main_async():
    consumer = create_finalizer_consumer()
    logger.info("Finalizer started. Waiting for jobs...")
    active_job = {"video_id": None, "cancel_event": None}
    cancellation_listener_task = asyncio.create_task(
        listen_for_video_cancellations(
            active_job,
            logger=logger,
            worker_name="rendition finalizer",
        )
    )

    try:
        while True:
            records = await asyncio.to_thread(
                consumer.poll,
                timeout_ms=1000,
                max_records=1,
            )
            for _, messages in records.items():
                for message in messages:
                    rendition_id = (
                        message.value.get("rendition_id")
                        if isinstance(message.value, dict)
                        else str(message.value)
                    )
                    logger.info(
                        f"Received finalization job: "
                        f"rendition_id={rendition_id} | "
                        f"partition={message.partition} | "
                        f"offset={message.offset}"
                    )

                    try:
                        cancel_event = asyncio.Event()
                        active_job["video_id"] = await resolve_video_id(rendition_id)
                        active_job["cancel_event"] = cancel_event
                        await finalize_rendition(
                            rendition_id=rendition_id,
                            cancel_event=cancel_event,
                        )
                        await asyncio.to_thread(consumer.commit)
                        logger.info(
                            f"Committed offset {message.offset} for rendition_id={rendition_id}"
                        )
                    except Exception as e:
                        logger.error(f"Error finalizing rendition {rendition_id}: {e}")
                    finally:
                        active_job["video_id"] = None
                        active_job["cancel_event"] = None
    except KeyboardInterrupt:
        logger.info("Finalizer shutting down gracefully...")
    finally:
        cancellation_listener_task.cancel()
        try:
            await cancellation_listener_task
        except asyncio.CancelledError:
            pass
        await asyncio.to_thread(consumer.close)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
