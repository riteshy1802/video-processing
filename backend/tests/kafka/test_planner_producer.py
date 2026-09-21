import sys
import uuid
from planner.producer import create_planner_producer, publish_planning_job
from app.core.kafka import flush_producer


def produce_planner_jobs(video_ids: list[str]):
    producer = create_planner_producer()
    print(
        f"Publishing {len(video_ids)} planner job(s) to Kafka topic 'planner.jobs'...\n"
    )

    for i, video_id in enumerate(video_ids, start=1):
        future = publish_planning_job(producer=producer, video_id=video_id)
        # Wait for Kafka acknowledgement so we can inspect where it went
        metadata = future.get(timeout=10)
        print(
            f"Job {i}/{len(video_ids)}: "
            f"video_id={video_id} | "
            f"partition={metadata.partition} | "
            f"offset={metadata.offset}"
        )

    flush_producer(producer)
    print(f"\nFinished producing {len(video_ids)} planner job(s).")


if __name__ == "__main__":
    # If explicit video ID arguments are passed, use them; otherwise generate sample UUIDs
    args = sys.argv[1:]
    target_ids = args if args else [str(uuid.uuid4()) for _ in range(10)]
    produce_planner_jobs(target_ids)
