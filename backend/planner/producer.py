import logging
from typing import Optional
from confluent_kafka import Producer
from app.config import settings
from app.core.kafka import create_json_producer, flush_producer, produce_json

logger = logging.getLogger("planner_producer")

_producer_instance: Optional[Producer] = None


def create_planner_producer() -> Producer:
    return create_json_producer()


def get_planner_producer() -> Optional[Producer]:
    global _producer_instance
    if _producer_instance is None:
        try:
            _producer_instance = create_planner_producer()
        except Exception as e:
            logger.warning(
                f"Could not connect to Kafka bootstrap servers ({settings.KAFKA_BOOTSTRAP_SERVERS}): {e}"
            )
            return None
    return _producer_instance


def close_planner_producer() -> None:
    global _producer_instance
    if _producer_instance is not None:
        flush_producer(_producer_instance)
        _producer_instance = None


def publish_planning_job(
    producer: Producer,
    video_id: str,
    attempt: int = 1,
):
    message = {
        "video_id": video_id,
        "attempt": attempt
    }

    future = produce_json(producer, settings.KAFKA_PLANNER_TOPIC, message)

    return future
