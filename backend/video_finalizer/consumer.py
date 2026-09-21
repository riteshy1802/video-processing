from app.config import settings
from app.core.kafka_consumer import BlockingConsumerAdapter, KafkaConsumerThread


def create_kafka_video_consumer() -> BlockingConsumerAdapter:
    """
    This will take all the confirmed renditions and will
    use to create the video finalizer consumer
    """
    return BlockingConsumerAdapter(
        KafkaConsumerThread(
            topic=settings.KAFKA_FINALIZE_VIDEO_TOPIC,
            group_id=settings.KAFKA_FINALIZE_VIDEO_GROUP_ID,
            logger_name="video_finalizer_consumer",
        )
    )
