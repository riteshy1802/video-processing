import sys
import uuid
from video_finalizer.producer import (
    create_finalizer_video_producer,
    publish_video_finalizer_job,
)


def produce_video_finalizer_jobs(video_ids: list[str]):
    producer = create_finalizer_video_producer()
    print(
        f"Publishing {len(video_ids)} video finalizer job(s) to Kafka topic 'video.finalize.jobs'...\n"
    )

    for i, video_id in enumerate(video_ids, start=1):
        future = publish_video_finalizer_job(producer=producer, video_id=video_id)
        metadata = future.get(timeout=10)
        print(
            f"  Job {i}/{len(video_ids)}: "
            f"video_id={video_id} | "
            f"partition={metadata.partition} | "
            f"offset={metadata.offset}"
        )

    producer.flush()
    producer.close()
    print(f"\nFinished producing {len(video_ids)} video finalizer job(s).")


if __name__ == "__main__":
    # Handle space-separated strings passed from Makefile: make produce-video-finalizer-job IDS="id1 id2"
    raw_args = sys.argv[1:]
    target_ids: list[str] = []
    for arg in raw_args:
        target_ids.extend([item.strip() for item in arg.split() if item.strip()])

    if not target_ids:
        print("No video ID provided. Generating 1 sample UUID for testing...")
        target_ids = [str(uuid.uuid4())]

    produce_video_finalizer_jobs(target_ids)
