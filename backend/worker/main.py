import logging
import asyncio
from worker.consumer import create_worker_consumer
from worker.transcoder import main_worker

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("worker_main")


async def main_async():
    consumer = create_worker_consumer()
    logger.info("Worker consumer started. Waiting for jobs...")

    try:
        for message in consumer:
            chunk_id = (
                message.value.get("chunk_id")
                if isinstance(message.value, dict)
                else str(message.value)
            )
            logger.info(
                f"Processing job: chunk_id={chunk_id} | partition={message.partition} | offset={message.offset}"
            )

            # Execute main worker logic to print/process chunk data
            await main_worker(chunk_id)

            # Manually commit offset after job execution
            consumer.commit()
            logger.info(f"Committed offset {message.offset} for chunk_id={chunk_id}")
    except KeyboardInterrupt:
        logger.info("Worker shutting down gracefully...")
    finally:
        consumer.close()


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
