import sys
import uuid
from worker.producer import create_worker_producer, publish_chunk


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

    worker_producer.flush()
    worker_producer.close()
    print(f"\nFinished producing {len(chunk_ids)} worker transcode job(s).")


if __name__ == "__main__":
    # If explicit chunk ID arguments are passed, use them; otherwise generate sample UUIDs
    args = sys.argv[1:]
    target_ids = args if args else [str(uuid.uuid4()) for _ in range(10)]
    produce_worker_jobs(target_ids)
