import logging
import asyncio
from video_finalizer.consumer import create_kafka_video_consumer
from video_finalizer.all_rendition_final import finalize_video
from app.services.pipeline_cancellation import listen_for_video_cancellations

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("video_worker_main")


async def main_async():
    consumer = create_kafka_video_consumer()
    logger.info("Video finalizer worker started")
    active_job = {"video_id": None, "cancel_event": None}
    cancellation_listener_task = asyncio.create_task(
        listen_for_video_cancellations(
            active_job,
            logger=logger,
            worker_name="video finalizer",
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
                    payload = message.value
                    video_id = (
                        payload.get("video_id") if isinstance(payload, dict) else None
                    )
                    if not video_id:
                        logger.error(f"Invalid video finalization message : {payload}")
                        await asyncio.to_thread(consumer.commit)
                        continue
                    logger.info(f"Received video finalization job: {video_id}")
                    try:
                        cancel_event = asyncio.Event()
                        active_job["video_id"] = str(video_id)
                        active_job["cancel_event"] = cancel_event
                        success = await finalize_video(
                            video_id=video_id,
                            cancel_event=cancel_event,
                        )
                        # Successful, duplicate, ineligible, and intentionally
                        # cancelled jobs all advance normally.
                        await asyncio.to_thread(consumer.commit)
                        if success:
                            logger.info(f"Video finalization job completed: {video_id}")
                        else:
                            logger.warning(f"Video finalization skipped: {video_id}")
                    except Exception:
                        logger.exception(f"Video finalization failed: {video_id}")
                    finally:
                        active_job["video_id"] = None
                        active_job["cancel_event"] = None
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
