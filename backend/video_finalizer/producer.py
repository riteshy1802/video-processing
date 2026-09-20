import json
import logging
from kafka import KafkaProducer
from typing import Optional
from app.config import settings

logger = logging.getLogger("video_finalizer")

_producer_instance: Optional[KafkaProducer] = None


def create_finalizer_video_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
        request_timeout_ms=5000,
    )


def get_video_finalizer_producer() -> Optional[KafkaProducer]:
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


def publish_video_finalizer_job(
    producer: KafkaProducer,
    video_id: str,
    attempt: int = 1
):
    message = {
        "video_id": video_id,
        "attempt": attempt
    }

    future = producer.send(
        settings.KAFKA_FINALIZE_VIDEO_TOPIC,
        value=message,
    )
    return future
