import logging
from typing import Optional
from confluent_kafka import Producer
from app.config import settings
from app.core.kafka import create_json_producer, flush_producer, produce_json

logger = logging.getLogger("finalizer_producer")

_producer_instance: Optional[Producer] = None


def create_finalizer_producer() -> Producer:
    return create_json_producer()


def get_finalizer_producer() -> Optional[Producer]:
    global _producer_instance
    if _producer_instance is None:
        try:
            _producer_instance = create_finalizer_producer()
        except Exception as e:
            logger.warning(
                f"Could not connect to Kafka bootstrap servers ({settings.KAFKA_BOOTSTRAP_SERVERS}): {e}"
            )
            return None
    return _producer_instance


def close_finalizer_producer() -> None:
    global _producer_instance
    if _producer_instance is not None:
        flush_producer(_producer_instance)
        _producer_instance = None


def publish_finalizer_job(
    producer: Producer,
    rendition_id: str,
    attempt: int = 1,
):
    message = {
        "rendition_id": rendition_id,
        "attempt": attempt
    }

    future = produce_json(producer, settings.KAFKA_FINALIZE_TOPIC, message)
    return future
