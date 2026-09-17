import logging
import asyncio
from finalizer.consumer import create_finalizer_consumer
from finalizer.rendition_finalizer import finalize_rendition

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("finalizer_main")


async def main_async():
    consumer = create_finalizer_consumer()
    logger.info("Finalizer started. Waiting for jobs...")

    try:
        for message in consumer:
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
                success = await finalize_rendition(rendition_id=rendition_id)
                if success:
                    consumer.commit()
                    logger.info(
                        f"Committed offset {message.offset} for rendition_id={rendition_id}"
                    )
                else:
                    # Still commit skipped/idempotent messages so the partition offset advances cleanly
                    consumer.commit()
            except Exception as e:
                logger.error(f"Error finalizing rendition {rendition_id}: {e}")
                consumer.commit()
    except KeyboardInterrupt:
        logger.info("Finalizer shutting down gracefully...")
    finally:
        consumer.close()


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
