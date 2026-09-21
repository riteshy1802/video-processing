from app.config import settings
from app.core.kafka_consumer import KafkaConsumerThread


class TranscodeConsumerThread(KafkaConsumerThread):
    def __init__(self):
        super().__init__(
            topic=settings.KAFKA_WORKER_TOPIC,
            group_id=settings.KAFKA_WORKER_GROUP_ID,
            logger_name="worker_consumer",
        )
