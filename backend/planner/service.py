from datetime import datetime, timezone
import uuid
import asyncio
import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import AsyncSessionLocal
from app.repositories.video_repository import video_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.chunk_repository import chunk_repository
from app.models.rendition import Rendition
from app.models.chunk import Chunk
from app.services.s3 import s3_service
from app.services.redis_publisher import publish_event_async
from app.services.outbox_service import enqueue_transcode_job
from app.core.failure_handling import PermanentJobError

logger = logging.getLogger("planner")
AVAILABLE_RENDITIONS = settings.SUPPORTED_RENDITIONS


FPS_PROBE_TIMEOUT_SECONDS = 8.0


async def enqueue_transcode_frontier(
    db: AsyncSession,
    video_id: uuid.UUID,
    chunk_ids: list[str],
    cancel_event: asyncio.Event | None,
) -> int:
    """Durably enqueue only still-required chunk work in the current transaction."""
    if cancel_event is not None and cancel_event.is_set():
        return 0
    if await video_repository.get_status(db, video_id) != "PROCESSING":
        return 0

    queued_count = 0
    for chunk_id in chunk_ids:
        if cancel_event is not None and cancel_event.is_set():
            break
        if await enqueue_transcode_job(db, chunk_id):
            queued_count += 1
    return queued_count


def select_source_frame_rate(
    payload: dict,
    packet_duration_seconds: float | None = None,
) -> float:
    """Choose metadata FPS when sane, otherwise derive average FPS from packets."""
    streams = payload.get("streams") or []
    stream = streams[0] if streams else {}

    def parse_rate(value: str | None) -> float:
        try:
            if not value or value == "0/0":
                return 0.0
            numerator, denominator = value.split("/", 1)
            return float(numerator) / float(denominator)
        except (ValueError, ZeroDivisionError):
            return 0.0

    average_rate = parse_rate(stream.get("avg_frame_rate"))
    if 1.0 <= average_rate <= 240.0:
        return average_rate

    duration = packet_duration_seconds or float(
        (payload.get("format") or {}).get("duration") or 0
    )
    packet_count = int(stream.get("nb_read_packets") or 0)
    derived_rate = packet_count / duration if duration > 0 else 0.0
    if 1.0 <= derived_rate <= 240.0:
        # VFR sources have no single exact rate. A milliframe precision value
        # preserves their average cadence consistently across all renditions.
        return round(derived_rate, 3)

    nominal_rate = parse_rate(stream.get("r_frame_rate"))
    return nominal_rate if 1.0 <= nominal_rate <= 240.0 else 30.0


async def probe_source_frame_rate(
    video,
    cancel_event: asyncio.Event | None = None,
) -> float:
    """Return a sane source FPS, deriving it from packets for malformed VFR WebM."""
    input_url = s3_service.generate_presigned_get_url(
        s3_key=video.s3_key,
        expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        response_filename=video.original_filename,
    )
    logger.info(
        "Probing source FPS metadata for video %s",
        video.id,
    )
    try:
        process = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=avg_frame_rate,r_frame_rate",
            "-of",
            "json",
            input_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as ex:
        logger.warning("Could not start FFprobe for FPS detection: %s", ex)
        return 30.0
    communicate_task = asyncio.create_task(process.communicate())
    cancel_task = (
        asyncio.create_task(cancel_event.wait()) if cancel_event is not None else None
    )
    waiters = {communicate_task}
    if cancel_task is not None:
        waiters.add(cancel_task)
    done, _ = await asyncio.wait(
        waiters,
        timeout=FPS_PROBE_TIMEOUT_SECONDS,
        return_when=asyncio.FIRST_COMPLETED,
    )
    if cancel_task is not None and cancel_task in done:
        if process.returncode is None:
            process.terminate()
        try:
            stdout, stderr = await asyncio.wait_for(
                asyncio.shield(communicate_task),
                timeout=5.0,
            )
        except asyncio.TimeoutError:
            process.kill()
            stdout, stderr = await communicate_task
        logger.info("Stopped FFprobe because video %s was cancelled", video.id)
        return 30.0
    if communicate_task not in done:
        process.kill()
        stdout, stderr = await communicate_task
        logger.warning(
            "FFprobe FPS detection timed out after %.1f seconds for video %s; using 30 fps",
            FPS_PROBE_TIMEOUT_SECONDS,
            video.id,
        )
        return 30.0
    stdout, stderr = communicate_task.result()
    if cancel_task is not None:
        cancel_task.cancel()
        try:
            await cancel_task
        except asyncio.CancelledError:
            pass
    if process.returncode != 0:
        logger.warning(
            "FFprobe FPS detection failed: %s", stderr.decode(errors="replace")
        )
        return 30.0

    try:
        frame_rate = select_source_frame_rate(json.loads(stdout.decode()))
        logger.info(
            "Detected source frame rate %.3f fps for video %s", frame_rate, video.id
        )
        return frame_rate
    except (ValueError, TypeError, json.JSONDecodeError) as ex:
        logger.warning("Could not parse FFprobe FPS output: %s", ex)
        return 30.0


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


async def plan_video_async(
    video_id: str,
    cancel_event: asyncio.Event | None = None,
) -> bool:
    """
    Probe outside a database transaction, then create all Rendition, Chunk,
    VideoEvent, and outbox records in one atomic transaction.
    Handles rollback cleanly without leaving open transactions or unhandled exceptions.
    Returns True if video was planned, False if skipped or invalid.
    """
    try:
        video_uuid = uuid.UUID(video_id) if isinstance(video_id, str) else video_id
    except (ValueError, TypeError) as exc:
        raise PermanentJobError(
            f"Invalid video UUID: {video_id}"
        ) from exc

    # Read only the source metadata, then close the transaction before ffprobe.
    # ffprobe can take several seconds and must not occupy a pooled DB session.
    async with AsyncSessionLocal() as db:
        video = await video_repository.get_by_id(db, video_uuid)
        if video is None:
            raise PermanentJobError(
                f"Video does not exist in database: video_id={video_id}"
            )

        if video.status in {"CANCELLING", "CANCELLED", "FAILING", "FAILED"}:
            logger.info(
                "Skipping planner job for video %s because status is %s",
                video_id,
                video.status,
            )
            return True

        # A duplicate planner message reasserts pending outbox work without
        # creating a second graph.
        if video.status == "PROCESSING":
            existing_renditions = await rendition_repository.get_by_video_id(
                db, video.id
            )
            pending_ids = await chunk_repository.get_pending_ids_for_renditions(
                db,
                [rendition.id for rendition in existing_renditions],
            )
            if pending_ids:
                queued_count = await enqueue_transcode_frontier(
                    db,
                    video.id,
                    [str(chunk_id) for chunk_id in pending_ids],
                    cancel_event,
                )
                await db.commit()
                logger.info(
                    "Planner retry queued %s pending chunk job(s) for video %s",
                    queued_count,
                    video.id,
                )
            else:
                logger.info(
                    "Planner retry found no pending chunks for video %s",
                    video.id,
                )
            return True

        if video.status != "UPLOADED":
            logger.info(
                f"Skipping video {video_id}: current status is '{video.status}' (expected 'UPLOADED')."
            )
            return False

        if video.source_height is None or video.duration_seconds is None:
            raise PermanentJobError(
                f"Video {video_id} missing required metadata: "
                f"height={video.source_height}, duration={video.duration_seconds}"
            )

        if await rendition_repository.has_renditions(db, video.id):
            logger.info(f"Video {video.id} has already been planned. Skipping.")
            return False

        resolutions = determine_renditions(video.source_height)
        if not resolutions:
            raise PermanentJobError(
                f"No supported rendition for source height={video.source_height}p"
            )
        chunk_ranges = determine_chunks(video.duration_seconds)

    source_frame_rate = await probe_source_frame_rate(video, cancel_event)

    async with AsyncSessionLocal() as db:
        try:
            # Lock and re-read after ffprobe so cancellation or a duplicate
            # planner cannot race the graph creation.
            video = await video_repository.get_by_id_for_update(db, video_uuid)
            if video is None:
                raise PermanentJobError(
                    f"Video does not exist in database: video_id={video_id}"
                )
            if video.status in {"CANCELLING", "CANCELLED", "FAILING", "FAILED"} or (
                cancel_event is not None and cancel_event.is_set()
            ):
                logger.info(
                    "Stopping planner job for video %s before creating work because it was cancelled",
                    video_id,
                )
                await db.rollback()
                return True

            if video.status != "UPLOADED":
                await db.rollback()
                logger.info(
                    "Planner lost its UPLOADED claim for video %s; status=%s",
                    video_id,
                    video.status,
                )
                return video.status == "PROCESSING"

            if await rendition_repository.has_renditions(db, video.id):
                await db.rollback()
                logger.info("Video %s was planned by another consumer", video.id)
                return True

            video.source_frame_rate = source_frame_rate

            logger.info(
                f"Planning video {video.id}: duration={video.duration_seconds:.2f}s, "
                f"source={video.source_height}p @ {video.source_frame_rate:.3f} fps | "
                f"Target Renditions={resolutions} | Chunks per rendition={len(chunk_ranges)}"
            )

            # 6. Create Rendition + Chunk ORM objects
            now = datetime.now(timezone.utc)
            created_chunk_ids: list[str] = []
            planned_renditions: list[dict] = []
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
                planned_chunks: list[dict] = []

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
                    planned_chunks.append(
                        {
                            "chunk_id": str(chunk_id),
                            "chunk_index": index,
                            "rendition_id": str(rendition_id),
                            "resolution": resolution,
                            "status": "PENDING",
                            "progress": 0.0,
                            "start_seconds": start_sec,
                            "end_seconds": end_sec,
                        }
                    )

                planned_renditions.append(
                    {
                        "rendition_id": str(rendition_id),
                        "resolution": resolution,
                        "status": "PROCESSING",
                        "progress": 0.0,
                        "total_chunks": len(planned_chunks),
                        "completed_chunks": 0,
                        "chunks": planned_chunks,
                    }
                )

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
                    "source_frame_rate": video.source_frame_rate,
                },
                commit=False,
            )

            queued_count = 0
            for chunk_id in created_chunk_ids:
                if cancel_event is not None and cancel_event.is_set():
                    break
                if await enqueue_transcode_job(db, chunk_id):
                    queued_count += 1

            # 8. Commit changes atomically to Supabase
            await db.commit()
            logger.info(
                f"Successfully planned and committed video {video.id} to database."
            )

            # Publish after the DB commit: the UI can immediately replace its
            # pending planner state with the actual rendition/chunk plan.
            await publish_event_async(
                video.id,
                {
                    "type": "planner.completed",
                    "video_id": str(video.id),
                    "status": "PROCESSING",
                    "planner_status": "COMPLETED",
                    "resolutions": resolutions,
                    "chunks_count": len(chunk_ranges),
                    "renditions": planned_renditions,
                },
            )

            logger.info(
                "Queued %s chunk transcode job(s) transactionally for video %s",
                queued_count,
                video.id,
            )

            return True

        except Exception as e:
            await db.rollback()
            logger.error(
                f"Error planning video {video_id}, transaction rolled back: {e}",
                exc_info=True,
            )
            raise


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
