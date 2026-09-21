# We have chunks which we will be scheduling in "transcode.jobs" [TOPIC] :

import logging
from typing import Optional
from confluent_kafka import Producer
from app.config import settings
from app.core.kafka import create_json_producer, flush_producer, produce_json

logger = logging.getLogger("worker_producer")

_producer_instance: Optional[Producer] = None


def create_worker_producer() -> Producer:
    return create_json_producer()


def get_worker_producer() -> Optional[Producer]:
    global _producer_instance
    if _producer_instance is None:
        try:
            _producer_instance = create_worker_producer()
        except Exception as e:
            logger.warning(
                f"Could not connect to Kafka bootstrap servers ({settings.KAFKA_BOOTSTRAP_SERVERS}): {e}"
            )
            return None
    return _producer_instance


def close_worker_producer() -> None:
    global _producer_instance
    if _producer_instance is not None:
        flush_producer(_producer_instance)
        _producer_instance = None


def publish_chunk(producer: Producer, chunk_id: str, attempt: int = 1):
    message = {
        "chunk_id": str(chunk_id),
        "attempt": attempt
    }
    future = produce_json(
        producer,
        settings.KAFKA_WORKER_TOPIC,
        message,
        key=str(chunk_id),
    )
    return future


# To publish the finalize jobs in the Kafka topic :


def publish_finalize_jobs_for_each_rendition(
    rendition_id: str,
    producer: Optional[Producer] = None,
):
    """
    Used to finalize all the chunks group them together under one rendition
    """
    if producer is None:
        producer = get_worker_producer()

    if producer is None:
        logger.error(
            f"Cannot publish finalize job for rendition {rendition_id}: Kafka producer unavailable."
        )
        return None

    message = {"rendition_id": str(rendition_id)}
    future = produce_json(
        producer,
        settings.KAFKA_FINALIZE_TOPIC,
        message,
        key=str(rendition_id),
    )

    metadata = future.get(timeout=10)

    logger.info(
        f"Published finalize job: "
        f"rendition_id={rendition_id} "
        f"partition={metadata.partition} "
        f"offset={metadata.offset}"
    )
    return metadata
