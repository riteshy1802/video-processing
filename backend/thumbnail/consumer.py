# import json
# from kafka import KafkaConsumer
# from app.config import settings


# def create_thumbnail_consumer() -> KafkaConsumer:
#     return KafkaConsumer(
#         settings.KAFKA_THUMBNAIL_TOPIC,
#         bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
#         group_id=settings.KAFKA_THUMBNAIL_GROUP_ID,
#         value_deserializer=lambda value: json.loads(value.decode("utf-8")),
#         auto_offset_reset="earliest",
#         enable_auto_commit=False,
#         max_poll_records=1,
#         max_poll_interval_ms=600_000,
#     )
