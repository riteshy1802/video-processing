from app.config import settings
from app.core.kafka_consumer import BlockingConsumerAdapter, KafkaConsumerThread


def create_planner_consumer() -> BlockingConsumerAdapter:
    return BlockingConsumerAdapter(
        KafkaConsumerThread(
            topic=settings.KAFKA_PLANNER_TOPIC,
            group_id=settings.KAFKA_PLANNER_GROUP_ID,
            logger_name="planner_consumer",
        )
    )
