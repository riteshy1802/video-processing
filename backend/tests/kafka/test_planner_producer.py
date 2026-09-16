import uuid
from planner.producer import create_planner_producer, publish_planning_job

producer = create_planner_producer()

for i in range(10):
    video_id = str(uuid.uuid4())
    future = publish_planning_job(producer=producer, video_id=video_id)
    # Wait for Kafka acknowledgement so we can inspect where it went
    metadata = future.get(timeout=10)
    print(
        f"Job {i + 1}: "
        f"video_id={video_id} | "
        f"partition={metadata.partition} | "
        f"offset={metadata.offset}"
    )

producer.flush()
producer.close()

print("Finished producing 10 planner jobs.")
