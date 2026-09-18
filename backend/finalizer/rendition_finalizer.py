import uuid
import math
import logging
from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.database import AsyncSessionLocal
from app.services.s3 import s3_service
from datetime import datetime, timezone
from video_finalizer.all_rendition_final import check_all_renditions_complete
from video_finalizer.producer import (
    get_video_finalizer_producer,
    publish_video_finalizer_job,
)

# Rendition:
# PENDING → PROCESSING → READY / FAILED

# Video:
# PENDING_UPLOAD → UPLOADED → PROCESSING → COMPLETED / FAILED

logger = logging.getLogger("finalizer")


async def check_rendition_ready(rendition_id: str) -> bool:
    """
    Return True only if every chunk belonging to this rendition has status COMPLETED or DONE.
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
                raise ValueError("EXTINF entry has no segment URI")

            segment_name = lines[i + 1]

            if segment_name.startswith("#"):
                raise ValueError(
                    f"Expected segment URI after EXTINF, got: {segment_name}"
                )

            segments.append((duration, segment_name))

    if not segments:
        raise ValueError("Playlist contains no HLS segments")

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


async def finalize_rendition(rendition_id: str) -> bool:
    """
    Finalizes a rendition by aggregating chunks.
    Returns True if successfully processed, False if skipped or not found.
    Does not crash the consumer process on missing DB records or pending chunks.
    """
    try:
        rendition_uuid = (
            uuid.UUID(rendition_id) if isinstance(rendition_id, str) else rendition_id
        )
    except ValueError:
        logger.error(f"Invalid rendition UUID string: '{rendition_id}'")
        return False

    async with AsyncSessionLocal() as db:
        rendition = await rendition_repository.get_by_id(
            db, rendition_id=rendition_uuid
        )
        if rendition is None:
            logger.warning(
                f"Rendition {rendition_id} does not exist in database. Skipping."
            )
            return False

        chunks = await chunk_repository.get_by_rendition_id(
            db, rendition_id=rendition_uuid
        )
        if not chunks:
            logger.warning(f"No chunks found for rendition {rendition_id}. Skipping.")
            return False

        if any(chunk.status != "DONE" for chunk in chunks):
            logger.info(
                f"Rendition {rendition_id} is not ready for finalization (pending chunks). Skipping."
            )
            return False

        print("=" * 60)
        print(f"  Finalizing Rendition : {rendition.id} ({rendition.resolution}p)")
        print(f"  Total Chunks         : {len(chunks)}")

        final_segments = build_final_segment_plan(chunks)

        print(f"Total final segments: {len(final_segments)}")

        final_prefix = rendition.s3_prefix.rstrip("/")

        for segment in final_segments:
            destination_key = f"{final_prefix}/segments/{segment['final_name']}"
            s3_service.copy_object(
                source_key=segment["source_key"],
                destination_key=destination_key,
            )
            print(
                f"Chunk {segment['chunk_index']:03d} | "
                f"{segment['source_key']} "
                f"-> {segment['final_name']} "
                f"({segment['duration']:.6f}s)"
            )

        final_playlist = generate_final_playlist(final_segments)
        final_playlist_key = f"{final_prefix}/index.m3u8"

        s3_service.put_text_file(
            s3_key=final_playlist_key,
            content=final_playlist,
        )

        print(f"Final playlist uploaded: {final_playlist_key}")

        completed_at = datetime.now(timezone.utc)
        rendition.status = "READY"
        rendition.playlist_s3_key = final_playlist_key
        rendition.completed_at = completed_at
        if rendition.processing_started_at is not None:
            rendition.processing_time_seconds = (
                completed_at - rendition.processing_started_at
            ).total_seconds()

        await db.commit()

        video_id = str(rendition.video_id)
        all_ready = await check_all_renditions_complete()
        if all_ready:
            producer = get_video_finalizer_producer()
            if producer is None:
                raise RuntimeError("Could not initialize video finalizer producer")
            # But keep one thing in mind, all the workers will try (and are allowed) to publish at the same time,
            # what we do is claim in the database by changing the status = "FINALIZING",
            # and if a worker picks a video having a status of FINALIZING, it should immediately drop it
            # we need to handle that in our next consumer we have which will consume on our topic : KAFKA_FINALIZE_VIDEO_TOPIC
            publish_video_finalizer_job(
                producer=producer,
                video_id=video_id,
            )

        # TODO: Enable after Rendition READY + DB commit is implemented.
        # chunks_prefix = f"{final_prefix}/chunks"
        # s3_service.delete_prefix(chunks_prefix)

        return True
