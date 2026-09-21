from __future__ import annotations

from typing import Any

from confluent_kafka import Producer

from app.core.failure_handling import FailureType
from app.core.kafka import flush_producer, produce_json


def build_dead_letter_message(
    *,
    payload: Any,
    source_topic: str,
    source_partition: int,
    source_offset: int,
    attempt: int,
    failure_type: FailureType,
    error_message: str,
) -> dict[str, Any]:
    """Build the shared DLQ envelope without changing the source payload."""
    return {
        "payload": payload,
        "source_topic": source_topic,
        "source_partition": source_partition,
        "source_offset": source_offset,
        "attempt": attempt,
        "failure_type": failure_type.value,
        "error_message": error_message,
    }


def publish_dead_letter(
    *,
    producer: Producer,
    dlq_topic: str,
    message: dict[str, Any],
) -> None:
    """Publish and confirm a DLQ record before its source offset is committed."""
    future = produce_json(producer, dlq_topic, message)
    future.get(timeout=10)
    flush_producer(producer)
