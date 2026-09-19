import logging
import asyncio

from planner.consumer import create_planner_consumer
from planner.service import plan_video_async
from app.services.pipeline_cancellation import listen_for_video_cancellations

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("planner_main")


async def main_async():
    consumer = create_planner_consumer()
    logger.info("Planner consumer started. Waiting for jobs...")
    active_job = {"video_id": None, "cancel_event": None}
    cancellation_listener_task = asyncio.create_task(
        listen_for_video_cancellations(
            active_job,
            logger=logger,
            worker_name="planner",
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
                    video_id = (
                        message.value.get("video_id")
                        if isinstance(message.value, dict)
                        else str(message.value)
                    )
                    logger.info(
                        f"Processing job: video_id={video_id} | partition={message.partition} | offset={message.offset}"
                    )

                    try:
                        cancel_event = asyncio.Event()
                        active_job["video_id"] = str(video_id)
                        active_job["cancel_event"] = cancel_event
                        await plan_video_async(video_id, cancel_event=cancel_event)
                        await asyncio.to_thread(consumer.commit)
                        logger.info(
                            f"Committed offset {message.offset} for video_id={video_id}"
                        )
                    except Exception as e:
                        logger.error(f"Failed to plan video {video_id}: {e}")
                    finally:
                        active_job["video_id"] = None
                        active_job["cancel_event"] = None
    except KeyboardInterrupt:
        logger.info("Planner shutting down gracefully...")
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
