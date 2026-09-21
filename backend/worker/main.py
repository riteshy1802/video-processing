import logging
import asyncio
from worker.consumer import TranscodeConsumerThread
from worker.transcoder import (
    ChunkLeaseBusyError,
    WorkerShutdownError,
    main_worker,
    mark_chunk_failed_terminal,
    release_chunk_for_retry,
    settle_retry_failure_if_cancelled,
)
from app.services.pipeline_cancellation import listen_for_video_cancellations
from app.core.failure_handling import (
    classify_failure,
    FailureType,
    MAX_RETRY_ATTEMPTS,
    calculate_retry_delay,
)
from worker.producer import close_worker_producer, get_worker_producer, publish_chunk
from app.core.dead_letter import build_dead_letter_message, publish_dead_letter
from app.config import settings
from app.core.shutdown import install_shutdown_handlers, wait_for_shutdown

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

logging.getLogger("kafka").setLevel(logging.WARNING)
logger = logging.getLogger("worker_main")


async def main_async():
    shutdown_event = asyncio.Event()
    install_shutdown_handlers(shutdown_event, logger)
    consumer_thread = TranscodeConsumerThread()
    await consumer_thread.start()
    logger.info("Worker consumer started. Waiting for jobs...")
    active_job = {
        "video_id": None,
        "cancel_event": None,
        "worker_id": None,
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
        while not shutdown_event.is_set():
            message = await consumer_thread.get_message(shutdown_event)
            if message is None:
                break

            original_payload = message.value
            value = original_payload if isinstance(original_payload, dict) else {}
            chunk_id = value.get("chunk_id")
            attempt = value.get("attempt", 1)
            settled = False
            logger.info(
                "Processing job: chunk_id=%s | partition=%s | attempt=%s | offset=%s",
                chunk_id,
                message.partition,
                attempt,
                message.offset,
            )

            try:
                cancel_event = asyncio.Event()
                active_job["cancel_event"] = cancel_event
                await main_worker(
                    chunk_id,
                    cancel_event=cancel_event,
                    active_job=active_job,
                    shutdown_event=shutdown_event,
                )
                committed = await consumer_thread.commit(message)
                settled = True
                if committed:
                    logger.info("Committed Kafka offset for %s", chunk_id)
                else:
                    logger.info(
                        "Kafka ownership changed for chunk=%s; source offset remains "
                        "uncommitted for redelivery",
                        chunk_id,
                    )
            except Exception as exc:
                if isinstance(exc, WorkerShutdownError):
                    logger.info(
                        "Shutdown interrupted chunk=%s; leaving offset uncommitted and lease to expire",
                        chunk_id,
                    )
                    return
                if shutdown_event.is_set():
                    logger.info(
                        "Shutdown arrived during chunk=%s; leaving offset uncommitted",
                        chunk_id,
                    )
                    return
                if isinstance(exc, ChunkLeaseBusyError):
                    logger.info(
                        "Deferring lease-contended chunk=%s without consuming attempt=%s",
                        chunk_id,
                        attempt,
                    )
                    if await wait_for_shutdown(
                        shutdown_event,
                        settings.TRANSCODE_LEASE_HEARTBEAT_SECONDS,
                    ):
                        return
                    producer = get_worker_producer()
                    if producer is None:
                        raise RuntimeError(
                            "Could not initialize transcode producer for lease deferral"
                        )
                    requeue_future = await asyncio.to_thread(
                        publish_chunk,
                        producer,
                        chunk_id,
                        attempt,
                    )
                    await asyncio.to_thread(producer.flush)
                    await asyncio.to_thread(requeue_future.get, timeout=10)
                    await consumer_thread.commit(message)
                    settled = True
                    continue

                failure_type = classify_failure(exc)
                logger.exception(
                    "Chunk processing failed: chunk_id=%s | attempt=%s | failure_type=%s",
                    chunk_id,
                    attempt,
                    failure_type.value,
                )
                if failure_type == FailureType.CANCELLED:
                    await consumer_thread.commit(message)
                    settled = True
                    continue
                if (
                    failure_type == FailureType.RETRYABLE
                    and attempt < MAX_RETRY_ATTEMPTS
                ):
                    next_attempt = attempt + 1
                    released = await release_chunk_for_retry(
                        chunk_id,
                        str(exc),
                        active_job.get("worker_id"),
                        next_attempt,
                    )
                    if not released:
                        if await settle_retry_failure_if_cancelled(
                            chunk_id,
                            active_job.get("worker_id"),
                        ):
                            committed = await consumer_thread.commit(message)
                            settled = True
                            if committed:
                                logger.info(
                                    "Committed cancelled retry-race offset for chunk %s",
                                    chunk_id,
                                )
                            else:
                                logger.info(
                                    "Cancelled retry-race offset for chunk %s remains "
                                    "uncommitted after rebalance",
                                    chunk_id,
                                )
                            continue
                        logger.warning(
                            "Chunk %s could not be released to PENDING; original offset remains uncommitted",
                            chunk_id,
                        )
                        continue

                    delay = calculate_retry_delay(attempt)
                    logger.warning(
                        "Retrying chunk: chunk_id=%s | next_attempt=%s | delay=%.2fs",
                        chunk_id,
                        next_attempt,
                        delay,
                    )
                    if await wait_for_shutdown(shutdown_event, delay):
                        return

                    producer = get_worker_producer()
                    if producer is None:
                        raise RuntimeError(
                            "Could not initialize transcode producer for retry"
                        )
                    retry_future = await asyncio.to_thread(
                        publish_chunk,
                        producer,
                        chunk_id,
                        next_attempt,
                    )
                    await asyncio.to_thread(producer.flush)
                    await asyncio.to_thread(retry_future.get, timeout=10)

                    # Commit only after the retry is durably acknowledged.
                    await consumer_thread.commit(message)
                    settled = True
                elif failure_type in {
                    FailureType.PERMANENT,
                    FailureType.RETRYABLE,
                }:
                    if (
                        failure_type == FailureType.RETRYABLE
                        and await settle_retry_failure_if_cancelled(
                            chunk_id,
                            active_job.get("worker_id"),
                        )
                    ):
                        await consumer_thread.commit(message)
                        settled = True
                        continue

                    producer = get_worker_producer()
                    if producer is None:
                        raise RuntimeError(
                            "Could not initialize transcode producer for DLQ"
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
                        dlq_topic=settings.KAFKA_WORKER_DLQ_TOPIC,
                        message=dlq_message,
                    )

                    marked_failed = await mark_chunk_failed_terminal(
                        chunk_id,
                        str(exc),
                        active_job.get("worker_id"),
                    )
                    if not marked_failed and active_job.get("video_id"):
                        raise RuntimeError(
                            "Terminal chunk could not be marked FAILED because "
                            f"worker ownership was lost: {chunk_id}"
                        )
                    if not marked_failed:
                        logger.warning(
                            "Terminal chunk job %s had no resolvable parent video; "
                            "the DLQ record is the terminal outcome",
                            chunk_id,
                        )
                    await consumer_thread.commit(message)
                    settled = True
            finally:
                active_job["video_id"] = None
                active_job["cancel_event"] = None
                active_job["worker_id"] = None
                if not settled and not shutdown_event.is_set():
                    try:
                        await consumer_thread.release(message)
                    except Exception:
                        logger.exception(
                            "Could not release uncommitted Kafka record for chunk=%s",
                            chunk_id,
                        )
                        raise

    finally:
        cancellation_listener_task.cancel()
        try:
            await cancellation_listener_task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Cancellation listener stopped unexpectedly during shutdown")
        finally:
            try:
                await consumer_thread.stop()
            finally:
                await asyncio.to_thread(close_worker_producer)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
