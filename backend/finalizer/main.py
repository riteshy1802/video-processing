import logging
import asyncio
import uuid
from finalizer.consumer import create_finalizer_consumer
from finalizer.rendition_finalizer import finalize_rendition
from app.database import AsyncSessionLocal
from app.repositories.rendition_repository import rendition_repository
from app.services.pipeline_cancellation import listen_for_video_cancellations
from app.core.failure_handling import (
    classify_failure,
    FailureType,
    MAX_RETRY_ATTEMPTS,
    calculate_retry_delay,
)
from app.core.dead_letter import build_dead_letter_message, publish_dead_letter
from app.config import settings
from finalizer.producer import (
    get_finalizer_producer,
    publish_finalizer_job,
)
from app.core.shutdown import install_shutdown_handlers, wait_for_shutdown
from app.services.failure_service import propagate_video_failure
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
    shutdown_event = asyncio.Event()
    install_shutdown_handlers(shutdown_event, logger)
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
        while not shutdown_event.is_set():
            records = await asyncio.to_thread(
                consumer.poll,
                timeout_ms=1000,
                max_records=1,
            )
            if shutdown_event.is_set():
                break
            for _, messages in records.items():
                for message in messages:
                    original_payload = message.value
                    value = original_payload if isinstance(original_payload, dict) else {}
                    rendition_id = value.get("rendition_id")
                    attempt = value.get("attempt", 1)
                    logger.info(
                        f"Received finalization job: "
                        f"rendition_id={rendition_id} | "
                        f"attempt={attempt} | "
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
                    except Exception as exc:
                        if shutdown_event.is_set():
                            logger.info(
                                "Shutdown arrived during rendition job %s; leaving offset uncommitted",
                                rendition_id,
                            )
                            return
                        failure_type = classify_failure(exc)

                        logger.exception(
                            "Finalization failed: rendition_id=%s | attempt=%s | failure_type=%s",
                            rendition_id,
                            attempt,
                            failure_type.value,
                        )

                        if failure_type == FailureType.CANCELLED:
                            await asyncio.to_thread(consumer.commit)
                            continue

                        if (
                            failure_type == FailureType.RETRYABLE
                            and attempt < MAX_RETRY_ATTEMPTS
                        ):
                            next_attempt = attempt + 1
                            delay = calculate_retry_delay(attempt)

                            logger.warning(
                                "Retrying rendition_id=%s | next_attempt=%s | delay=%.2fs",
                                rendition_id,
                                next_attempt,
                                delay,
                            )

                            if await wait_for_shutdown(shutdown_event, delay):
                                return

                            producer = get_finalizer_producer()

                            if producer is None:
                                raise RuntimeError(
                                    "Could not initialize finalizer producer for retry"
                                )

                            retry_future = await asyncio.to_thread(
                                publish_finalizer_job,
                                producer,
                                rendition_id,
                                next_attempt,
                            )

                            await asyncio.to_thread(producer.flush)
                            await asyncio.to_thread(retry_future.get, timeout=10)

                            # New retry message is safely in Kafka.
                            # We can now acknowledge the failed original message.
                            await asyncio.to_thread(consumer.commit)
                        elif failure_type in {
                            FailureType.PERMANENT,
                            FailureType.RETRYABLE,
                        }:
                            producer = get_finalizer_producer()
                            if producer is None:
                                raise RuntimeError(
                                    "Could not initialize finalizer producer for DLQ"
                                )
                            dlq_message = build_dead_letter_message(
                                payload=original_payload,
                                source_topic=message.topic,
                                source_partition=message.partition,
                                source_offset=message.offset,
                                attempt=attempt,
                                failure_type=failure_type,
                                error_message=str(exc),
                            )
                            await asyncio.to_thread(
                                publish_dead_letter,
                                producer=producer,
                                dlq_topic=settings.KAFKA_FINALIZE_DLQ_TOPIC,
                                message=dlq_message,
                            )
                            video_id = active_job.get("video_id")
                            if video_id:
                                await propagate_video_failure(
                                    video_id=video_id,
                                    error_message=str(exc),
                                )
                            await asyncio.to_thread(consumer.commit)
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
