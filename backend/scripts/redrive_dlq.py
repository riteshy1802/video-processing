"""Manually restore and durably queue one copied Kafka DLQ envelope.

Examples:
    .venv/bin/python scripts/redrive_dlq.py --file /tmp/dlq-message.json
    kafka-console-consumer ... | .venv/bin/python scripts/redrive_dlq.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Any

from app.config import settings
from app.database import AsyncSessionLocal
from app.repositories.outbox_repository import outbox_repository
from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository


def load_envelope(message: str | None, file_path: Path | None) -> dict[str, Any]:
    if message is not None:
        raw = message
    elif file_path is not None:
        raw = file_path.read_text(encoding="utf-8")
    else:
        raw = sys.stdin.read()

    envelope = json.loads(raw)
    if not isinstance(envelope, dict):
        raise ValueError("DLQ message must be a JSON object")
    if not isinstance(envelope.get("payload"), dict):
        raise ValueError("DLQ message payload must be a JSON object")
    return envelope


async def restore_database_state(source_topic: str, payload: dict[str, Any]) -> None:
    async with AsyncSessionLocal() as db:
        if source_topic == settings.KAFKA_PLANNER_TOPIC:
            video_id = uuid.UUID(str(payload.get("video_id")))
            eligible = await video_repository.redrive_planning(
                db, video_id, commit=False
            )
            dedupe_key = f"planner:{video_id}"
        elif source_topic == settings.KAFKA_WORKER_TOPIC:
            chunk_id = uuid.UUID(str(payload.get("chunk_id")))
            eligible = await chunk_repository.redrive_failed(
                db, chunk_id, commit=False
            )
            dedupe_key = f"transcode:{chunk_id}"
        elif source_topic == settings.KAFKA_FINALIZE_TOPIC:
            rendition_id = uuid.UUID(str(payload.get("rendition_id")))
            eligible = await rendition_repository.redrive_failed_finalization(
                db,
                rendition_id,
                commit=False,
            )
            dedupe_key = f"rendition-finalize:{rendition_id}"
        elif source_topic == settings.KAFKA_FINALIZE_VIDEO_TOPIC:
            video_id = uuid.UUID(str(payload.get("video_id")))
            eligible = await video_repository.redrive_finalization(
                db, video_id, commit=False
            )
            dedupe_key = f"video-finalize:{video_id}"
        else:
            raise ValueError(f"Unsupported DLQ source topic: {source_topic}")

        if not eligible:
            await db.rollback()
            raise RuntimeError(
                "Job DB state is not eligible for re-drive; "
                "cancelled/ready work is not reopened"
            )

        await outbox_repository.enqueue(
            db,
            event_type="manual.redrive.job",
            topic=source_topic,
            payload=payload,
            dedupe_key=dedupe_key,
        )
        await db.commit()


async def redrive(envelope: dict[str, Any]) -> None:
    source_topic = envelope.get("source_topic")
    payload = dict(envelope["payload"])
    payload["attempt"] = 1

    await restore_database_state(source_topic, payload)
    print(f"Queued durable re-drive to {source_topic} attempt=1")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manually restore and queue one DLQ message through the outbox"
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--message", help="DLQ JSON envelope")
    source.add_argument("--file", type=Path, help="File containing a DLQ JSON envelope")
    args = parser.parse_args()

    envelope = load_envelope(args.message, args.file)
    asyncio.run(redrive(envelope))


if __name__ == "__main__":
    main()
