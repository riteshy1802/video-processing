import sys
import uuid
from thumbnail.producer import create_thumbnail_producer, publish_thumbnail_job


def produce_thumbnail_jobs(video_ids: list[str]):
    producer = create_thumbnail_producer()
    print(f"Publishing {len(video_ids)} thumbnail job(s) to Kafka topic...\n")

    for i, video_id in enumerate(video_ids, start=1):
        future = publish_thumbnail_job(producer=producer, video_id=video_id)
        # Wait for Kafka acknowledgement so we can inspect where it went
        metadata = future.get(timeout=10)
        print(
            f"Job {i}/{len(video_ids)}: "
            f"video_id={video_id} | "
            f"partition={metadata.partition} | "
            f"offset={metadata.offset}"
        )

    producer.flush()
    producer.close()
    print(f"\nFinished producing {len(video_ids)} thumbnail job(s).")


if __name__ == "__main__":
    # If explicit video ID arguments are passed, use them; otherwise generate sample UUIDs
    args = sys.argv[1:]
    target_ids = args if args else [str(uuid.uuid4()) for _ in range(1)]
    produce_thumbnail_jobs(target_ids)
