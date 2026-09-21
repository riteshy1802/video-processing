import sys
import uuid
from finalizer.producer import create_finalizer_producer, publish_finalizer_job
from app.core.kafka import flush_producer


def produce_finalizer_jobs(rendition_ids: list[str]):
    producer = create_finalizer_producer()
    print(
        f"Publishing {len(rendition_ids)} finalizer job(s) to Kafka topic 'finalize.jobs'...\n"
    )

    for i, rendition_id in enumerate(rendition_ids, start=1):
        future = publish_finalizer_job(producer=producer, rendition_id=rendition_id)
        # Wait for Kafka acknowledgement so we can inspect partition and offset
        metadata = future.get(timeout=10)
        print(
            f"Job {i}/{len(rendition_ids)}: "
            f"rendition_id={rendition_id} | "
            f"partition={metadata.partition} | "
            f"offset={metadata.offset}"
        )

    flush_producer(producer)
    print(f"\nFinished producing {len(rendition_ids)} finalizer job(s).")


if __name__ == "__main__":
    # Handle space-separated strings passed from Makefile: make produce-finalizer-job IDS="id1 id2"
    raw_args = sys.argv[1:]
    target_ids: list[str] = []
    for arg in raw_args:
        target_ids.extend([item.strip() for item in arg.split() if item.strip()])

    if not target_ids:
        print("No rendition ID provided. Generating 1 sample UUID for testing...")
        target_ids = [str(uuid.uuid4())]

    produce_finalizer_jobs(target_ids)
