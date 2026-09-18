from kafka.admin import KafkaAdminClient, NewTopic
from app.config import settings

admin = KafkaAdminClient(
    bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
    client_id="video-transcoder-admin",
)
existing_topics = set(admin.list_topics())

topics = [
    NewTopic(name=settings.KAFKA_PLANNER_TOPIC, num_partitions=6, replication_factor=1),
    NewTopic(name=settings.KAFKA_WORKER_TOPIC, num_partitions=6, replication_factor=1),
    NewTopic(
        name=settings.KAFKA_FINALIZE_TOPIC, num_partitions=3, replication_factor=1
    ),
    NewTopic(
        name=settings.KAFKA_FINALIZE_VIDEO_TOPIC, num_partitions=3, replication_factor=1
    ),
]
missing_topics = [topic for topic in topics if topic.name not in existing_topics]
if missing_topics:
    admin.create_topics(new_topics=missing_topics)
    for topic in missing_topics:
        print(f"Created topic: {topic.name}")
else:
    print("All Kafka topics already exist.")
admin.close()
