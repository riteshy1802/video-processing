# import logging
# import json
# from typing import Optional
# from kafka import KafkaProducer
# from app.config import settings

# logger = logging.getLogger("planner_producer")

# _producer_instance: Optional[KafkaProducer] = None

# def create_thumbnail_producer() -> KafkaProducer:
#     return KafkaProducer(
#         bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
#         value_serializer=lambda value: json.dumps(value).encode("utf-8"),
#         request_timeout_ms=5000,
#     )

# def get_thumbnail_producer() -> Optional[KafkaProducer]:
#     global _producer_instance
#     if _producer_instance is None:
#         try:
#             _producer_instance = create_thumbnail_producer()
#         except Exception as e:
#             logger.warning(
#                 f"Could not connect to Kafka bootstrap servers ({settings.KAFKA_BOOTSTRAP_SERVERS}): {e}"
#             )
#             return None
#     return _producer_instance

# def publish_thumbnail_job(
#     producer: KafkaProducer,
#     video_id: str,
# ):
#     message = {"video_id": video_id}

#     future = producer.send(settings.KAFKA_THUMBNAIL_TOPIC, key=video_id.encode("utf-8"), value=message)

#     return future
