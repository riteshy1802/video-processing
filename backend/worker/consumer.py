import json
from kafka import KafkaConsumer
from app.config import settings


def create_worker_consumer() -> KafkaConsumer:
    return KafkaConsumer(
        settings.KAFKA_WORKER_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        group_id=settings.KAFKA_WORKER_GROUP_ID,
        enable_auto_commit=False,  # We dont want this commit to immediately occur
        auto_offset_reset="earliest",  # Tells, that if you dont know where you left off, start from the first one.
    )
