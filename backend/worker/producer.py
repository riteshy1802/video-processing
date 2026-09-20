# We have chunks which we will be scheduling in "transcode.jobs" [TOPIC] :

import json
import logging
from typing import Optional
from kafka import KafkaProducer
from app.config import settings

logger = logging.getLogger("worker_producer")

_producer_instance: Optional[KafkaProducer] = None


def create_worker_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
        request_timeout_ms=5000,
    )


def get_worker_producer() -> Optional[KafkaProducer]:
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


def publish_chunk(producer: KafkaProducer, chunk_id: str, attempt: int = 1):
    message = {
        "chunk_id": str(chunk_id),
        "attempt": attempt
    }
    future = producer.send(
        settings.KAFKA_WORKER_TOPIC,
        key=str(chunk_id).encode("utf-8"),
        value=message,
    )
    return future


# To publish the finalize jobs in the Kafka topic :


def publish_finalize_jobs_for_each_rendition(
    rendition_id: str,
    producer: Optional[KafkaProducer] = None,
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
    future = producer.send(
        settings.KAFKA_FINALIZE_TOPIC,
        key=str(rendition_id).encode("utf-8"),
        value=message,
    )

    metadata = future.get(timeout=10)

    logger.info(
        f"Published finalize job: "
        f"rendition_id={rendition_id} "
        f"partition={metadata.partition} "
        f"offset={metadata.offset}"
    )
    return metadata
