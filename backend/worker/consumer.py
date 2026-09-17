import json
from kafka import KafkaConsumer
from app.config import settings


def create_worker_consumer() -> KafkaConsumer:
    return KafkaConsumer(
        settings.KAFKA_WORKER_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        group_id=settings.KAFKA_WORKER_GROUP_ID,
        enable_auto_commit=False,  # We manually commit offsets after FFmpeg completes
        auto_offset_reset="earliest",
        max_poll_records=1,  # Fetch 1 chunk job at a time so workers don't hoard batch messages
        max_poll_interval_ms=1800000,  # 30 min max processing timeout for FFmpeg per chunk
        session_timeout_ms=45000,  # 45s session timeout
        heartbeat_interval_ms=10000,  # 10s heartbeat interval
    )
