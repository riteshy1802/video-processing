import logging
import asyncio
from worker.consumer import create_worker_consumer
from worker.transcoder import main_worker
from app.services.pipeline_cancellation import listen_for_video_cancellations

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("worker_main")


async def main_async():
    consumer = create_worker_consumer()
    logger.info("Worker consumer started. Waiting for jobs...")
    active_job = {
        "video_id": None,
        "cancel_event": None,
    }

    # immediately begins running alongside main_async().

    cancellation_listener_task = asyncio.create_task(
        listen_for_video_cancellations(
            active_job,
            logger=logger,
            worker_name="transcode worker",
        )
    )

    try:
        while True:
            # kafka-python is synchronous, so poll it in a separate thread.
            # This prevents it from blocking our Redis cancellation listener.
            records = await asyncio.to_thread(
                consumer.poll,
                timeout_ms=1000,
                max_records=1,
            )

            if not records:
                continue
            for _, messages in records.items():
                for message in messages:
                    chunk_id = (
                        message.value.get("chunk_id")
                        if isinstance(message.value, dict)
                        else str(message.value)
                    )
                    logger.info(
                        f"Processing job: chunk_id={chunk_id} | partition={message.partition} | offset={message.offset}"
                    )

                    try:
                        cancel_event = asyncio.Event()
                        active_job["cancel_event"] = cancel_event
                        # Execute main worker logic to print/process chunk data
                        await main_worker(
                            chunk_id,
                            cancel_event=cancel_event,
                            active_job=active_job,
                        )
                        # Manually commit offset after job execution
                        await asyncio.to_thread(consumer.commit)
                        logger.info(f"Committed Kafka offset for {chunk_id}")
                    except Exception:
                        logger.exception(f"Chunk processing failed: {chunk_id}")
                        # NO Kafka commit
                    finally:
                        active_job["video_id"] = None
                        active_job["cancel_event"] = None

    except KeyboardInterrupt:
        logger.info("Worker shutting down gracefully...")

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
