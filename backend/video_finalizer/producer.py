import logging
from confluent_kafka import Producer
from typing import Optional
from app.config import settings
from app.core.kafka import create_json_producer, flush_producer, produce_json

logger = logging.getLogger("video_finalizer")

_producer_instance: Optional[Producer] = None


def create_finalizer_video_producer() -> Producer:
    return create_json_producer()


def get_video_finalizer_producer() -> Optional[Producer]:
    global _producer_instance
    if _producer_instance is None:
        try:
            _producer_instance = create_finalizer_video_producer()
        except Exception as e:
            logger.warning(
                f"Could not connect to Kafka bootstrap servers ({settings.KAFKA_BOOTSTRAP_SERVERS}): {e}"
            )
            return None
    return _producer_instance


def close_video_finalizer_producer() -> None:
    global _producer_instance
    if _producer_instance is not None:
        flush_producer(_producer_instance)
        _producer_instance = None


def publish_video_finalizer_job(
    producer: Producer,
    video_id: str,
    attempt: int = 1
):
    message = {
        "video_id": video_id,
        "attempt": attempt
    }

    future = produce_json(producer, settings.KAFKA_FINALIZE_VIDEO_TOPIC, message)
    return future
