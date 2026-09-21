from confluent_kafka.admin import AdminClient, NewTopic
from app.config import settings

admin = AdminClient(
    {
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "client.id": "video-transcoder-admin",
    }
)
existing_topics = set(admin.list_topics(timeout=10).topics)

topics = [
    NewTopic(topic=settings.KAFKA_PLANNER_TOPIC, num_partitions=6, replication_factor=1),
    NewTopic(topic=settings.KAFKA_WORKER_TOPIC, num_partitions=6, replication_factor=1),
    NewTopic(
        topic=settings.KAFKA_FINALIZE_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        topic=settings.KAFKA_FINALIZE_VIDEO_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        topic=settings.KAFKA_PLANNER_DLQ_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        topic=settings.KAFKA_WORKER_DLQ_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        topic=settings.KAFKA_FINALIZE_DLQ_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        topic=settings.KAFKA_FINALIZE_VIDEO_DLQ_TOPIC,
        num_partitions=3,
        replication_factor=1,
    ),
]
missing_topics = [topic for topic in topics if topic.topic not in existing_topics]
if missing_topics:
    futures = admin.create_topics(missing_topics)
    for topic_name, future in futures.items():
        future.result(timeout=10)
        print(f"Created topic: {topic_name}")
else:
    print("All Kafka topics already exist.")
