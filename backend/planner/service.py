from datetime import datetime, timezone
import uuid
import asyncio
import logging
from app.config import settings
from app.database import AsyncSessionLocal
from app.repositories.video_repository import video_repository
from app.repositories.rendition_repository import rendition_repository
from app.models.rendition import Rendition
from app.models.chunk import Chunk
from worker.producer import get_worker_producer, publish_chunk

logger = logging.getLogger("planner")
AVAILABLE_RENDITIONS = settings.SUPPORTED_RENDITIONS


def determine_renditions(source_height: int) -> list[int]:
    """
    Return renditions that do not upscale the source significantly.
    Allows a 10% height tolerance so near-1080p videos (e.g., 1018p, 1040p)
    generate the 1080p rendition bucket.

    Example:
        source_height = 1018
        -> [360, 480, 720, 1080]
    """
    return [
        rendition
        for rendition in AVAILABLE_RENDITIONS
        if rendition <= source_height or (source_height >= int(rendition * 0.9))
    ]


def determine_chunks(duration_seconds: float) -> list[tuple[float, float]]:
    """
    Return the time ranges that should be processed.
    """
    if duration_seconds <= settings.DISTRIBUTED_THRESHOLD_SECONDS:
        return [(0.0, duration_seconds)]

    chunks = []
    start = 0.0

    while start < duration_seconds:
        end = min(start + settings.CHUNK_DURATION_SECONDS, duration_seconds)
        chunks.append((start, end))
        start = end

    return chunks


async def plan_video_async(video_id: str) -> bool:
    """
    Async implementation that executes in a single database transaction
    and commits all Rendition, Chunk, and VideoEvent records atomically.
    Handles rollback cleanly without leaving open transactions or unhandled exceptions.
    Returns True if video was planned, False if skipped or invalid.
    """
    try:
        video_uuid = uuid.UUID(video_id) if isinstance(video_id, str) else video_id
    except ValueError:
        logger.error(f"Invalid video UUID string: '{video_id}'")
        return False

    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch the video
            video = await video_repository.get_by_id(db, video_uuid)

            if video is None:
                logger.warning(
                    f"Video {video_id} does not exist in database. Skipping."
                )
                return False

            # 2. Make sure upload has completed
            if video.status != "UPLOADED":
                logger.info(
                    f"Skipping video {video_id}: current status is '{video.status}' (expected 'UPLOADED')."
                )
                return False

            # 3. Validate metadata required by planner
            if video.source_height is None or video.duration_seconds is None:
                logger.warning(
                    f"Video {video_id} missing required metadata (height={video.source_height}, duration={video.duration_seconds}). Skipping."
                )
                return False

            # 4. Check whether we've already planned this video
            is_planned_already = await rendition_repository.has_renditions(db, video.id)
            if is_planned_already:
                logger.info(f"Video {video.id} has already been planned. Skipping.")
                return False

            # 5. Determine renditions & chunk ranges
            resolutions = determine_renditions(video.source_height)
            if not resolutions:
                logger.warning(
                    f"No supported rendition for source height {video.source_height}p. Skipping."
                )
                return False

            chunk_ranges = determine_chunks(video.duration_seconds)

            logger.info(
                f"Planning video {video.id}: duration={video.duration_seconds:.2f}s, source={video.source_height}p | "
                f"Target Renditions={resolutions} | Chunks per rendition={len(chunk_ranges)}"
            )

            # 6. Create Rendition + Chunk ORM objects
            now = datetime.now(timezone.utc)
            created_chunk_ids: list[str] = []
            for resolution in resolutions:
                rendition_id = uuid.uuid4()
                rendition = Rendition(
                    id=rendition_id,
                    video_id=video.id,
                    resolution=resolution,
                    status="PROCESSING",
                    processing_started_at=now,
                    s3_prefix=f"videos/{video.id}/processed/{resolution}p/",
                )
                db.add(rendition)

                for index, (start_sec, end_sec) in enumerate(chunk_ranges):
                    chunk_id = uuid.uuid4()
                    chunk = Chunk(
                        id=chunk_id,
                        rendition_id=rendition_id,
                        chunk_index=index,
                        start_seconds=start_sec,
                        end_seconds=end_sec,
                        status="PENDING",
                        temporary_s3_prefix=(
                            f"videos/{video.id}/processed/"
                            f"{resolution}p/chunks/{index:03d}/"
                        ),
                    )
                    db.add(chunk)
                    created_chunk_ids.append(str(chunk_id))

            # 7. Update Video status & log VideoEvent audit log
            video.status = "PROCESSING"
            await video_repository.log_event(
                db=db,
                video_id=video.id,
                event_type="PROCESSING_STARTED",
                message=f"Created {len(resolutions)} renditions with {len(chunk_ranges)} chunks each.",
                event_metadata={
                    "resolutions": resolutions,
                    "chunks_count": len(chunk_ranges),
                    "duration_seconds": video.duration_seconds,
                },
            )

            # 8. Commit changes atomically to Supabase
            await db.commit()
            logger.info(
                f"Successfully planned and committed video {video.id} to database."
            )

            # 9. Publish created chunk transcode jobs to Kafka topic transcode.jobs, Planning completed here.
            try:
                worker_producer = get_worker_producer()
                if worker_producer:
                    for cid in created_chunk_ids:
                        publish_chunk(producer=worker_producer, chunk_id=cid)
                    worker_producer.flush()
                    logger.info(
                        f"Published {len(created_chunk_ids)} chunk transcode job(s) for video {video.id} to Kafka topic '{settings.KAFKA_WORKER_TOPIC}'."
                    )
            except Exception as e:
                logger.warning(
                    f"Could not publish chunk transcode jobs to Kafka for video {video.id}: {e}"
                )

            return True

        except Exception as e:
            await db.rollback()
            logger.error(
                f"Error planning video {video_id}, transaction rolled back: {e}",
                exc_info=True,
            )
            return False


def plan_video(video_id: str) -> bool:
    """Synchronous entry point for single-video execution."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If an event loop is already running, run task in loop
        return asyncio.run_coroutine_threadsafe(
            plan_video_async(video_id), loop
        ).result()
    else:
        return asyncio.run(plan_video_async(video_id))
