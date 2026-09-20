import uuid
import math
import logging
import asyncio
from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository
from app.database import AsyncSessionLocal
from app.services.s3 import s3_service
from app.services.redis_publisher import publish_event_async
from app.services.pipeline_cancellation import is_video_cancellation_requested
from app.services.pipeline_settlement import settle_stopped_video
from datetime import datetime, timezone
from app.services.outbox_service import enqueue_video_finalizer_job
from app.core.failure_handling import (
    PermanentJobError,
    RetryableJobError,
)

# Rendition:
# PENDING → PROCESSING → READY / FAILED

# Video:
# PENDING_UPLOAD → UPLOADED → PROCESSING → COMPLETED / FAILED

logger = logging.getLogger("finalizer")


async def check_rendition_ready(rendition_id: str) -> bool:
    """
    Return True only if every chunk belonging to this rendition has status DONE.
    """
    try:
        rendition_uuid = (
            uuid.UUID(rendition_id) if isinstance(rendition_id, str) else rendition_id
        )
    except ValueError:
        logger.error(f"Invalid rendition UUID string: '{rendition_id}'")
        return False

    async with AsyncSessionLocal() as db:
        chunks = await chunk_repository.get_by_rendition_id(
            db, rendition_id=rendition_uuid
        )
        if not chunks:
            return False
        for chunk in chunks:
            if chunk.status != "DONE":
                return False
        return True


def generate_final_playlist(final_segments: list) -> str:
    """
    Generates your final index.m3u8 file for each rendition!
    """
    if not final_segments:
        raise ValueError("Cannot generate playlist without segments")

    target_duration = math.ceil(max(segment["duration"] for segment in final_segments))

    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        f"#EXT-X-TARGETDURATION:{target_duration}",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-PLAYLIST-TYPE:VOD",
    ]
    previous_chunk_index = None

    for segment in final_segments:
        current_chunk_index = segment["chunk_index"]

        # New independently transcoded processing chunk begins
        if (
            previous_chunk_index is not None
            and current_chunk_index != previous_chunk_index
        ):
            lines.append("#EXT-X-DISCONTINUITY")

        lines.append(f"#EXTINF:{segment['duration']:.6f},")
        lines.append(f"segments/{segment['final_name']}")

        previous_chunk_index = current_chunk_index

    lines.append("#EXT-X-ENDLIST")

    return "\n".join(lines) + "\n"


def parse_hls_playlist(content: str) -> list[tuple[float, str]]:
    segments = []
    lines = [line.strip() for line in content.splitlines() if line.strip()]

    for i, line in enumerate(lines):
        if line.startswith("#EXTINF:"):
            duration = float(line.removeprefix("#EXTINF:").rstrip(","))

            if i + 1 >= len(lines):
                raise PermanentJobError(
                    "HLS playlist EXTINF entry has no segment URI"
                )

            segment_name = lines[i + 1]

            if segment_name.startswith("#"):
                raise PermanentJobError(
                    f"Expected segment URI after EXTINF, got: {segment_name}"
                )

            segments.append((duration, segment_name))

    if not segments:
        raise PermanentJobError(
            "Playlist contains no HLS segments"
        )

    return segments


def build_final_segment_plan(chunks) -> list:
    final_segments = []
    global_index = 0
    for chunk in chunks:
        playlist_key = f"{chunk.temporary_s3_prefix.rstrip('/')}/index.m3u8"

        playlist_content = s3_service.get_text_file(s3_key=playlist_key)
        segments = parse_hls_playlist(
            playlist_content
        )  # Generates [(duration -> segment_name)...] list stores the mapping

        for duration, segment_name in segments:
            source_key = f"{chunk.temporary_s3_prefix.rstrip('/')}/{segment_name}"
            final_segments.append(
                {
                    "duration": duration,
                    "source_key": source_key,
                    "final_name": f"segment_{global_index:06d}.ts",
                    "chunk_index": chunk.chunk_index,
                }
            )

            global_index += 1

    return final_segments


async def build_final_segment_plan_cancelable(
    chunks,
    video_id: str,
    cancel_event: asyncio.Event | None,
) -> list | None:
    """Build the segment plan without starving the Redis cancellation listener."""
    final_segments = []
    global_index = 0
    for chunk in chunks:
        if await is_video_cancellation_requested(video_id, cancel_event):
            return None
        playlist_key = f"{chunk.temporary_s3_prefix.rstrip('/')}/index.m3u8"
        playlist_content = await asyncio.to_thread(
            s3_service.get_text_file,
            s3_key=playlist_key,
        )
        if playlist_content is None:
            raise RetryableJobError(
                f"Chunk playlist is not available yet: {playlist_key}"
            )
        for duration, segment_name in parse_hls_playlist(playlist_content):
            final_segments.append(
                {
                    "duration": duration,
                    "source_key": (
                        f"{chunk.temporary_s3_prefix.rstrip('/')}/{segment_name}"
                    ),
                    "final_name": f"segment_{global_index:06d}.ts",
                    "chunk_index": chunk.chunk_index,
                }
            )
            global_index += 1
    return final_segments


async def settle_and_skip_cancelled_video(video_id: str) -> None:
    async with AsyncSessionLocal() as settlement_db:
        await settle_stopped_video(settlement_db, uuid.UUID(video_id))


async def finalize_rendition(
    rendition_id: str,
    cancel_event: asyncio.Event | None = None,
) -> bool:
    """
    Finalizes a rendition by aggregating chunks.
    Returns True if successfully processed, False if skipped or not found.
    Does not crash the consumer process on missing DB records or pending chunks.
    """
    try:
        rendition_uuid = (
            uuid.UUID(rendition_id) if isinstance(rendition_id, str) else rendition_id
        )
    except (ValueError, TypeError) as exc:
        raise PermanentJobError(
            f"Invalid rendition UUID: {rendition_id}"
        ) from exc

    # Snapshot the required rows, then release the DB connection before any S3
    # reads/copies. The final state transition is performed in a fresh session.
    async with AsyncSessionLocal() as db:
        rendition = await rendition_repository.get_by_id(
            db, rendition_id=rendition_uuid
        )
        if rendition is None:
            raise PermanentJobError(
                f"Rendition does not exist in database: rendition_id={rendition_id}"
            )
        video_id = str(rendition.video_id)
        rendition_status = rendition.status
        resolution = rendition.resolution
        final_prefix = rendition.s3_prefix.rstrip("/")
        processing_started_at = rendition.processing_started_at
        created_at = rendition.created_at
        chunks = await chunk_repository.get_by_rendition_id(
            db, rendition_id=rendition_uuid
        )

    if await is_video_cancellation_requested(video_id, cancel_event):
        logger.info(
            "Skipping rendition finalization %s because video %s is cancelling/cancelled",
            rendition_id,
            video_id,
        )
        await settle_and_skip_cancelled_video(video_id)
        return True

    if rendition_status != "PROCESSING":
        logger.info(
            f"Rendition {rendition_id} is {rendition_status}; skipping finalization."
        )
        return False

    if not chunks:
        raise PermanentJobError(
            f"No chunks found for rendition_id={rendition_id}"
        )

    if any(chunk.status != "DONE" for chunk in chunks):
        logger.info(
            f"Rendition {rendition_id} is not ready for finalization (pending chunks). Skipping."
        )
        return False

    await publish_event_async(
        video_id,
        {
            "type": "rendition.processing",
            "video_id": video_id,
            "rendition_id": str(rendition_uuid),
            "resolution": str(resolution),
            "status": "PROCESSING",
        },
    )

    print("=" * 60)
    print(f"  Finalizing Rendition : {rendition_uuid} ({resolution}p)")
    print(f"  Total Chunks         : {len(chunks)}")

    final_segments = await build_final_segment_plan_cancelable(
        chunks,
        video_id,
        cancel_event,
    )
    if final_segments is None:
        logger.info(
            "Stopped rendition assembly %s because video %s was cancelled",
            rendition_id,
            video_id,
        )
        await settle_and_skip_cancelled_video(video_id)
        return True

    print(f"Total final segments: {len(final_segments)}")

    for segment in final_segments:
        if await is_video_cancellation_requested(video_id, cancel_event):
            logger.info(
                "Stopped rendition copy work %s because video %s was cancelled",
                rendition_id,
                video_id,
            )
            await settle_and_skip_cancelled_video(video_id)
            return True
        destination_key = f"{final_prefix}/segments/{segment['final_name']}"
        copied = await asyncio.to_thread(
            s3_service.copy_object,
            source_key=segment["source_key"],
            destination_key=destination_key,
        )
        if not copied:
            raise RetryableJobError(
                f"Failed to copy rendition segment to {destination_key}"
            )
        print(
            f"Chunk {segment['chunk_index']:03d} | "
            f"{segment['source_key']} "
            f"-> {segment['final_name']} "
            f"({segment['duration']:.6f}s)"
        )

    final_playlist = generate_final_playlist(final_segments)
    final_playlist_key = f"{final_prefix}/index.m3u8"

    if await is_video_cancellation_requested(video_id, cancel_event):
        await settle_and_skip_cancelled_video(video_id)
        return True
    await asyncio.to_thread(
        s3_service.put_text_file,
        s3_key=final_playlist_key,
        content=final_playlist,
    )

    print(f"Final playlist uploaded: {final_playlist_key}")

    completed_at = datetime.now(timezone.utc)
    processing_time_seconds = None
    if processing_started_at is not None:
        processing_time_seconds = (
            completed_at - processing_started_at
        ).total_seconds()
    elif created_at is not None:
        processing_time_seconds = (
            completed_at - created_at
        ).total_seconds()

    async with AsyncSessionLocal() as db:
        current_rendition = await rendition_repository.get_by_id(
            db, rendition_id=rendition_uuid
        )
        if current_rendition is None:
            raise PermanentJobError(
                f"Rendition disappeared during finalization: {rendition_id}"
            )
        current_video_status = await video_repository.get_status_for_update(
            db, current_rendition.video_id
        )
        if current_video_status != "PROCESSING":
            await db.rollback()
            logger.info(
                "Video %s became %s before rendition %s could become READY",
                video_id,
                current_video_status,
                rendition_id,
            )
            await settle_and_skip_cancelled_video(video_id)
            return True

        marked_ready = await rendition_repository.mark_ready_if_processing(
            db,
            current_rendition.id,
            final_playlist_key,
            completed_at,
            processing_time_seconds,
        )
        all_ready = False
        if marked_ready:
            await db.flush()
            all_ready = await rendition_repository.are_all_renditions_completed(
                db, current_rendition.video_id
            )
            if all_ready:
                await enqueue_video_finalizer_job(db, current_rendition.video_id)
        await db.commit()

    if not marked_ready:
        logger.info(
            f"Rendition {rendition_id} was cancelled during finalization; "
            "not publishing READY or video finalization work."
        )
        return False

    await publish_event_async(
        video_id,
        {
            "type": "rendition.ready",
            "video_id": video_id,
            "rendition_id": str(rendition_uuid),
            "resolution": str(resolution),
            "status": "READY",
        },
    )

    if all_ready:
        logger.info(
            "Queued video finalization transactionally for video %s",
            video_id,
        )

    chunks_prefix = f"{final_prefix}/chunks"
    try:
        await asyncio.to_thread(s3_service.delete_prefix, chunks_prefix)
    except Exception as cleanup_error:
        # Cleanup is best-effort. A missing ListBucket/DeleteObject IAM
        # permission must not turn a completed rendition into a failed one
        # or prevent the video finalizer from being published.
        logger.warning(
            f"Could not delete temporary chunk prefix {chunks_prefix}: {cleanup_error}"
        )

    return True
