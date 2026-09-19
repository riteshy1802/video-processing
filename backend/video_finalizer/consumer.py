import json

from kafka import KafkaConsumer

from app.config import settings


def create_kafka_video_consumer() -> KafkaConsumer:
    """
    This will take all the confirmed renditions and will
    use to create the video finalizer consumer
    """
    return KafkaConsumer(
        settings.KAFKA_FINALIZE_VIDEO_TOPIC,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_FINALIZE_VIDEO_GROUP_ID,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        max_poll_records=1,
        max_poll_interval_ms=1800000,
        session_timeout_ms=45000,
        heartbeat_interval_ms=10000,
    )
