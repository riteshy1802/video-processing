import sys
import uuid
from finalizer.producer import create_finalizer_producer, publish_finalizer_job


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

    producer.flush()
    producer.close()
    print(f"\nFinished producing {len(rendition_ids)} finalizer job(s).")


if __name__ == "__main__":
    # If explicit rendition ID arguments are passed, use them; otherwise generate sample UUIDs in a loop
    args = sys.argv[1:]
    target_ids = args if args else [str(uuid.uuid4()) for _ in range(10)]
    produce_finalizer_jobs(target_ids)
