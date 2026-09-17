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


def get_planner_producer() -> Optional[KafkaProducer]:
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


def publish_chunk(producer: KafkaProducer, chunk_id: str):
    message = {"chunk_id": chunk_id}
    future = producer.send(settings.KAFKA_WORKER_TOPIC, value=message)
    return future
