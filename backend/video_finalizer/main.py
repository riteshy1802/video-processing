import logging
import asyncio
import uuid
from video_finalizer.consumer import create_kafka_video_consumer
from video_finalizer.all_rendition_final import finalize_video
from app.services.pipeline_cancellation import listen_for_video_cancellations
from app.core.failure_handling import (
    classify_failure,
    FailureType,
    MAX_RETRY_ATTEMPTS,
    calculate_retry_delay,
)
from app.core.dead_letter import build_dead_letter_message, publish_dead_letter
from app.config import settings
from video_finalizer.producer import (
    get_video_finalizer_producer,
    publish_video_finalizer_job,
)
from app.database import AsyncSessionLocal
from app.repositories.video_repository import video_repository
from app.core.shutdown import install_shutdown_handlers, wait_for_shutdown
from app.services.failure_service import propagate_video_failure

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("video_worker_main")


async def release_video_for_retry(video_id: str) -> bool:
    try:
        video_uuid = uuid.UUID(video_id)
    except (TypeError, ValueError):
        return False
    async with AsyncSessionLocal() as db:
        return await video_repository.release_finalization_for_retry(db, video_uuid)


async def main_async():
    consumer = create_kafka_video_consumer()
    shutdown_event = asyncio.Event()
    install_shutdown_handlers(shutdown_event, logger)
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

                    video_id = value.get("video_id")
                    attempt = value.get("attempt", 1)
                    if not video_id:
                        logger.error(f"Invalid video finalization message : {value}")
                        await asyncio.to_thread(consumer.commit)
                        continue
                    logger.info(f"Received video finalization job: {video_id} | attempt : {attempt}")
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
                    except Exception as exc:
                        if shutdown_event.is_set():
                            logger.info(
                                "Shutdown arrived during video finalizer job %s; leaving offset uncommitted",
                                video_id,
                            )
                            return
                        failure_type = classify_failure(exc)
                        logger.exception(
                            "Video processing failed: Video_ID=%s | attempt=%s | failure_type=%s",
                            video_id,
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
                            released = await release_video_for_retry(video_id)
                            if not released:
                                logger.warning(
                                    "Video %s could not be released for finalizer retry; original offset remains uncommitted",
                                    video_id,
                                )
                                continue

                            next_attempt = attempt + 1
                            delay = calculate_retry_delay(attempt)
                            logger.warning(
                                "Retrying video finalization: video_id=%s | next_attempt=%s | delay=%.2fs",
                                video_id,
                                next_attempt,
                                delay,
                            )
                            if await wait_for_shutdown(shutdown_event, delay):
                                return

                            producer = get_video_finalizer_producer()
                            if producer is None:
                                raise RuntimeError(
                                    "Could not initialize video finalizer producer for retry"
                                )
                            retry_future = await asyncio.to_thread(
                                publish_video_finalizer_job,
                                producer,
                                video_id,
                                next_attempt,
                            )
                            await asyncio.to_thread(producer.flush)
                            await asyncio.to_thread(retry_future.get, timeout=10)

                            # Commit only after the retry is durably published.
                            await asyncio.to_thread(consumer.commit)
                        elif failure_type in {
                            FailureType.PERMANENT,
                            FailureType.RETRYABLE,
                        }:
                            producer = get_video_finalizer_producer()
                            if producer is None:
                                raise RuntimeError(
                                    "Could not initialize video finalizer producer for DLQ"
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
                                dlq_topic=settings.KAFKA_FINALIZE_VIDEO_DLQ_TOPIC,
                                message=dlq_message,
                            )
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
