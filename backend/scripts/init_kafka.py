from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError
from app.config import settings

admin = KafkaAdminClient(
    bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
    client_id="video-transcoder-admin",
)

topics = [
    NewTopic(name="planner.jobs", num_partitions=6, replication_factor=1),
    NewTopic(name="transcode.jobs", num_partitions=6, replication_factor=1),
]

try:
    admin.create_topics(new_topics=topics)
    for t in topics:
        print(f"Created topic: {t.name}")
except TopicAlreadyExistsError as topic_err:
    print(f"One or more topics already exist. Error: {topic_err}")
finally:
    admin.close()
