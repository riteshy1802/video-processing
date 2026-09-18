import logging
import asyncio
from video_finalizer.consumer import create_kafka_video_consumer
from video_finalizer.all_rendition_final import finalize_video

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("video_worker_main")


async def main_async():
    consumer = create_kafka_video_consumer()
    logger.info("Video finalizer worker started")
    try:
        for message in consumer:
            payload = message.value
            video_id = payload.get("video_id")
            if not video_id:
                logger.error(f"Invalid video finalization message : {payload}")
                # Retrying this will never fix it, so skip it :
                consumer.commit()
                continue
            logger.info(f"Received video finalization job: {video_id}")
            try:
                success = await finalize_video(video_id=video_id)
                if success:
                    consumer.commit()

                    logger.info(f"Video finalization job completed: {video_id}")
                else:
                    logger.warning(f"Video finalization skipped: {video_id}")
            except Exception:
                logger.exception(f"Video finalization failed: {video_id}")
                # IMPORTANT:
                # No Kafka commit here.
    finally:
        consumer.close()


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
