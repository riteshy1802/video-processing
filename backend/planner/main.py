import logging
import asyncio

from planner.consumer import create_planner_consumer
from planner.service import plan_video_async

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("planner_main")


async def main_async():
    consumer = create_planner_consumer()
    logger.info("Planner consumer started. Waiting for jobs...")

    try:
        for message in consumer:
            video_id = (
                message.value.get("video_id")
                if isinstance(message.value, dict)
                else str(message.value)
            )
            logger.info(
                f"Processing job: video_id={video_id} | partition={message.partition} | offset={message.offset}"
            )

            try:
                success = await plan_video_async(video_id)
                if success:
                    consumer.commit()
                    logger.info(
                        f"Committed offset {message.offset} for video_id={video_id}"
                    )
                else:
                    # Still commit skipped/idempotent messages so the partition offset advances cleanly
                    consumer.commit()
            except Exception as e:
                logger.error(f"Failed to plan video {video_id}: {e}")
                continue
    except KeyboardInterrupt:
        logger.info("Planner shutting down gracefully...")
    finally:
        consumer.close()


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
