from app.config import settings
from app.core.kafka_consumer import BlockingConsumerAdapter, KafkaConsumerThread


def create_finalizer_consumer() -> BlockingConsumerAdapter:
    """
    Used to create the finalizer consumer
    """
    return BlockingConsumerAdapter(
        KafkaConsumerThread(
            topic=settings.KAFKA_FINALIZE_TOPIC,
            group_id=settings.KAFKA_FINALIZE_GROUP_ID,
            logger_name="rendition_finalizer_consumer",
        )
    )
