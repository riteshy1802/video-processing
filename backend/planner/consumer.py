import json
from kafka import KafkaConsumer
from app.config import settings


def create_planner_consumer() -> KafkaConsumer:
    return KafkaConsumer(
        settings.KAFKA_PLANNER_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_PLANNER_GROUP_ID,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        enable_auto_commit=False,  # We dont want this commit to immediately occur
        auto_offset_reset="earliest",  # Tells, that if you dont know where you left off, start from the first one.
    )
