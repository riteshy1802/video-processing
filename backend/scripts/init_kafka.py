from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError

BOOTSTRAP_SERVERS = "localhost:9092"

admin = KafkaAdminClient(
    bootstrap_servers=BOOTSTRAP_SERVERS, client_id="video-transcoder-admin"
)

topic = NewTopic(name="planner.jobs", num_partitions=6, replication_factor=1)

try:
    admin.create_topics([topic])
    print("Created topic: planner.jobs")
except TopicAlreadyExistsError:
    print("Topic already exists: planner.jobs")
finally:
    admin.close()
