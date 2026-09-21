import sys
import uuid
from worker.producer import create_worker_producer, publish_chunk
from app.core.kafka import flush_producer


def produce_worker_jobs(chunk_ids: list[str]):
    worker_producer = create_worker_producer()
    print(
        f"Publishing {len(chunk_ids)} worker transcode job(s) to Kafka topic 'worker.jobs'...\n"
    )

    for i, chunk_id in enumerate(chunk_ids, start=1):
        future = publish_chunk(producer=worker_producer, chunk_id=chunk_id)
        # Wait for Kafka acknowledgement so we can inspect where it went
        metadata = future.get(timeout=10)
        print(
            f"Job {i}/{len(chunk_ids)}: "
            f"chunk_id={chunk_id} | "
            f"partition={metadata.partition} | "
            f"offset={metadata.offset}"
        )

    flush_producer(worker_producer)
    print(f"\nFinished producing {len(chunk_ids)} worker transcode job(s).")


if __name__ == "__main__":
    # Handle space-separated strings passed from Makefile: make produce-worker-job IDS="id1 id2"
    raw_args = sys.argv[1:]
    target_ids: list[str] = []
    for arg in raw_args:
        target_ids.extend([item.strip() for item in arg.split() if item.strip()])

    if not target_ids:
        print("No chunk ID provided. Generating 1 sample UUID for testing...")
        target_ids = [str(uuid.uuid4())]

    produce_worker_jobs(target_ids)
