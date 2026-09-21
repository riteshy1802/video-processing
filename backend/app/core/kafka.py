from __future__ import annotations

import concurrent.futures
import json
import time
from dataclasses import dataclass
from typing import Any

from confluent_kafka import KafkaException, Producer

from app.config import settings


@dataclass(frozen=True)
class DeliveryMetadata:
    topic: str
    partition: int
    offset: int


class DeliveryFuture:
    """Small compatibility future backed by Confluent delivery callbacks."""

    def __init__(self, producer: Producer):
        self._producer = producer
        self._future: concurrent.futures.Future[DeliveryMetadata] = (
            concurrent.futures.Future()
        )

    def callback(self, error, message) -> None:
        if self._future.done():
            return
        if error is not None:
            self._future.set_exception(KafkaException(error))
            return
        self._future.set_result(
            DeliveryMetadata(
                topic=message.topic(),
                partition=message.partition(),
                offset=message.offset(),
            )
        )

    def get(self, timeout: float = 10) -> DeliveryMetadata:
        deadline = time.monotonic() + timeout
        while not self._future.done():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Kafka delivery acknowledgement timed out")
            self._producer.poll(min(0.1, remaining))
        return self._future.result()


def create_json_producer() -> Producer:
    return Producer(
        {
            "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
            "delivery.timeout.ms": 5000,
        }
    )


def produce_json(
    producer: Producer,
    topic: str,
    payload: Any,
    *,
    key: str | bytes | None = None,
) -> DeliveryFuture:
    encoded_key = key.encode("utf-8") if isinstance(key, str) else key
    encoded_value = json.dumps(payload).encode("utf-8")
    future = DeliveryFuture(producer)
    while True:
        try:
            producer.produce(
                topic,
                key=encoded_key,
                value=encoded_value,
                on_delivery=future.callback,
            )
            break
        except BufferError:
            producer.poll(0.1)
    producer.poll(0)
    return future


def flush_producer(producer: Producer, timeout: float = 10) -> None:
    remaining = producer.flush(timeout)
    if remaining:
        raise TimeoutError(f"{remaining} Kafka message(s) were not delivered")

