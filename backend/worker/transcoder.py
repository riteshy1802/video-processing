import uuid
import logging
import asyncio
import shutil
import socket
import time
from pathlib import Path
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.models import Chunk, Rendition, Video
from app.services.s3 import s3_service
from app.services.redis_publisher import publish_event_async
from app.config import settings
from datetime import datetime, timezone
from finalizer.rendition_finalizer import check_rendition_ready
from worker.producer import publish_finalize_jobs_for_each_rendition
from app.repositories.chunk_repository import chunk_repository
from app.repositories.video_repository import video_repository
from app.services.cancellation_service import settle_video_cancellation
from app.services.pipeline_cancellation import is_video_cancellation_requested

logger = logging.getLogger("transcoder")


class TranscodeCancelled(Exception):
    """
    Raised when an FFmpeg process is intentionally stopped because
    the user cancelled video processing.

    This is kept separate from normal FFmpeg failures so the chunk
    becomes CANCELLED instead of FAILED.
    """

    pass


async def terminate_ffmpeg_process(
    process: asyncio.subprocess.Process,
    chunk_id: str,
) -> None:
    """
    Stop a currently running FFmpeg process.

    First request graceful termination.
    If FFmpeg does not stop within 5 seconds, force kill it.
    """

    # FFmpeg has already exited, nothing needs to be stopped.
    if process.returncode is not None:
        return

    logger.info(f"Stopping FFmpeg for cancelled chunk={chunk_id}")

    # Ask FFmpeg to terminate gracefully.
    process.terminate()

    try:
        # Give FFmpeg a few seconds to exit and release its resources.
        await asyncio.wait_for(process.wait(), timeout=5.0)

    except asyncio.TimeoutError:
        # FFmpeg did not respond to graceful termination.
        # Forcefully kill the process.
        logger.warning(
            f"FFmpeg did not stop gracefully for chunk={chunk_id}. Force killing."
        )

        process.kill()
        await process.wait()

    logger.info(f"FFmpeg stopped for chunk={chunk_id}")


async def fetch_chunk_rendition_video_data(chunk_id: str):
    """
    Helps to fetch the chunk data, rendition data, and video data for a given chunk_id
    """
    try:
        chunk_uuid = uuid.UUID(chunk_id) if isinstance(chunk_id, str) else chunk_id
    except ValueError:
        logger.error(f"Invalid chunk UUID string: '{chunk_id}'")
        return None

    async with AsyncSessionLocal() as db:
        stmt = (
            select(
                Chunk.id,
                Chunk.chunk_index,
                Chunk.rendition_id,
                Rendition.video_id,
                Video.s3_key,
                Video.original_filename,
                Rendition.resolution,
                Video.source_frame_rate,
                Chunk.start_seconds,
                Chunk.end_seconds,
                Chunk.temporary_s3_prefix,
            )
            .join(Rendition, Chunk.rendition_id == Rendition.id)
            .join(Video, Rendition.video_id == Video.id)
            .where(Chunk.id == chunk_uuid)
        )
        result = await db.execute(stmt)
        return result.mappings().first()


async def upload_hls_chunks(
    local_directory: Path,
    s3_prefix: str,
    video_id: str,
    cancel_event: asyncio.Event,
) -> int:
    """
    Uploads the HLS chunks (.m3u8 playlist and .ts segments) from local_directory to S3 at s3_prefix.
    """
    if not local_directory.exists() or not local_directory.is_dir():
        logger.error(f"Local directory '{local_directory}' does not exist.")
        return 0

    uploaded_count = 0
    prefix = s3_prefix.rstrip("/") + "/"
    for file_path in local_directory.iterdir():
        if not file_path.is_file():
            continue
        if await is_video_cancellation_requested(video_id, cancel_event):
            raise TranscodeCancelled()
        s3_key = f"{prefix}{file_path.name}"

        success = await asyncio.to_thread(
            s3_service.upload_file,
            local_file_path=str(file_path),
            s3_key=s3_key,
        )
        if not success:
            raise RuntimeError(f"Failed to upload {file_path.name} to S3")
        uploaded_count += 1

    return uploaded_count


async def transcode_chunk(
    input_url: str,
    chunk_id: str,
    video_id: str,
    rendition_id: str,
    resolution: str,
    chunk_index: int,
    start_seconds: float,
    end_seconds: float,
    worker_id: str,
    source_frame_rate: float,
    cancel_event: asyncio.Event,
):
    duration = end_seconds - start_seconds
    duration_us = max(1.0, duration * 1_000_000)
    output_dir = Path(f"/tmp/video-transcoder/{chunk_id}")
    output_dir.mkdir(parents=True, exist_ok=True)
    playlist = output_dir / "index.m3u8"
    segment_pattern = output_dir / "segment_%03d.ts"

    command = [
        "ffmpeg",
        "-y",
        "-nostats",
        "-stats_period",
        "0.5",
        "-progress",
        "pipe:1",
        "-ss",
        str(start_seconds),
        "-i",
        input_url,
        "-t",
        str(duration),
        "-vf",
        f"scale=-2:{resolution},fps={source_frame_rate:.6f}",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-force_key_frames",
        "expr:gte(t,n_forced*6)",
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist),
    ]
    logger.info(
        f"Starting FFmpeg: chunk={chunk_id}, "
        f"resolution={resolution}p, "
        f"range={start_seconds}-{end_seconds}"
    )

    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    last_publish_time = 0.0
    last_progress = 0.0
    ffmpeg_values: dict[str, str] = {}

    stderr_chunks = []

    async def read_stderr():
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            stderr_chunks.append(line)

    stderr_task = asyncio.create_task(read_stderr())

    while True:
        # Wait for either:
        # 1. FFmpeg to produce another progress line
        # 2. This chunk/video to receive a cancellation signal
        progress_task = asyncio.create_task(process.stdout.readline())
        cancel_task = asyncio.create_task(cancel_event.wait())

        done, pending = await asyncio.wait(
            {progress_task, cancel_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancellation won the race.
        if cancel_task in done and cancel_event.is_set():
            # We no longer need to wait for the pending stdout read.
            if not progress_task.done():
                progress_task.cancel()

            await terminate_ffmpeg_process(
                process=process,
                chunk_id=chunk_id,
            )

            # Wait for stderr reader to finish now that FFmpeg is dead.
            await stderr_task

            raise TranscodeCancelled(f"Transcoding cancelled for chunk {chunk_id}")

        # FFmpeg produced output first.
        # Stop the unused cancellation waiter for this iteration.
        cancel_task.cancel()

        line_bytes = await progress_task

        if not line_bytes:
            break

        # Everything below this remains exactly as it already is.
        line = line_bytes.decode(errors="replace").strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        ffmpeg_values[key] = value

        # FFmpeg terminates each structured progress block with this key.
        if key == "progress":
            try:
                out_time_us = float(ffmpeg_values.get("out_time_us", "0"))
                pct = round(min(99.0, max(0.0, (out_time_us / duration_us) * 100.0)), 1)
                now = time.time()
                if (
                    now - last_publish_time > 0.5 and pct > last_progress
                ) or value == "end":
                    last_publish_time = now
                    last_progress = pct
                    await record_chunk_progress(
                        chunk_id=chunk_id,
                        video_id=video_id,
                        rendition_id=rendition_id,
                        resolution=resolution,
                        chunk_index=chunk_index,
                        worker_id=worker_id,
                        progress=pct,
                    )
            except Exception as ex:
                logger.debug(f"Error parsing FFmpeg progress line '{line}': {ex}")
            finally:
                ffmpeg_values = {}

    await process.wait()
    await stderr_task

    if process.returncode != 0:
        error = b"".join(stderr_chunks).decode(errors="replace")
        logger.error(f"FFmpeg failed for chunk {chunk_id}:\n{error}")
        raise RuntimeError(f"FFmpeg exited with code {process.returncode}")

    logger.info(f"FFmpeg completed chunk={chunk_id}: {playlist}")

    return output_dir


async def publish_chunk_status_event(
    *,
    chunk_id: str,
    status: str,
    video_id: str,
    rendition_id: str,
    resolution: str,
    chunk_index: int,
    worker_id: str | None = None,
    error_msg: str | None = None,
) -> None:
    event_types = {
        "PROCESSING": "chunk.started",
        "DONE": "chunk.completed",
        "CANCELLED": "chunk.cancelled",
        "FAILED": "chunk.failed",
    }
    messages = {
        "PROCESSING": "Worker started FFmpeg for this chunk",
        "DONE": "Chunk transcoding and upload completed",
        "CANCELLED": "Chunk processing was cancelled",
        "FAILED": "Chunk transcoding failed",
    }
    payload = {
        "type": event_types[status],
        "video_id": video_id,
        "rendition_id": rendition_id,
        "chunk_id": chunk_id,
        "chunk_index": chunk_index,
        "resolution": resolution,
        "worker_id": worker_id or socket.gethostname(),
        "status": status,
        "progress": 100.0 if status == "DONE" else 0.0,
        "message": messages[status],
    }
    if error_msg:
        payload["error"] = error_msg
    await publish_event_async(video_id, payload)


async def update_chunk_status(
    chunk_id: str,
    status: str,
    video_id: str | None = None,
    rendition_id: str | None = None,
    resolution: str | None = None,
    chunk_index: int | None = None,
    worker_id: str | None = None,
    error_msg: str | None = None,
) -> bool:
    chunk_uuid = uuid.UUID(chunk_id)
    async with AsyncSessionLocal() as db:
        if video_id:
            video_status = await video_repository.get_status_for_update(
                db, uuid.UUID(video_id)
            )
            if status in {"DONE", "FAILED"} and video_status != "PROCESSING":
                await db.rollback()
                return False

        chunk = await db.get(Chunk, chunk_uuid)

        if chunk is None:
            raise ValueError(f"Chunk not found: {chunk_id}")

        now = datetime.now(timezone.utc)

        if status == "PROCESSING":
            if chunk.status != "PENDING":
                raise ValueError(
                    f"Cannot transition chunk {chunk_id} to PROCESSING from status {chunk.status}"
                )
            chunk.status = "PROCESSING"
            chunk.attempt_count += 1
            chunk.processing_started_at = now
            chunk.progress_percent = 0.0
            chunk.worker_id = worker_id
        elif status == "DONE":
            if chunk.status != "PROCESSING":
                await db.rollback()
                return False
            chunk.status = "DONE"
            chunk.progress_percent = 100.0
            chunk.completed_at = now
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        elif status == "FAILED":
            if chunk.status != "PROCESSING":
                await db.rollback()
                return False
            chunk.status = "FAILED"
            chunk.completed_at = now
            chunk.error_message = error_msg
        elif status == "CANCELLED":
            if chunk.status != "PROCESSING":
                await db.rollback()
                return False
            chunk.status = "CANCELLED"
            chunk.progress_percent = 0.0
            chunk.ffmpeg_progress = None
            chunk.completed_at = now
            chunk.worker_id = None
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        else:
            raise ValueError(f"Invalid chunk status: {status}")
        await db.commit()
        logger.info(f"Chunk {chunk_id} marked {status}")

    if video_id and rendition_id and resolution is not None and chunk_index is not None:
        await publish_chunk_status_event(
            chunk_id=chunk_id,
            status=status,
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
            error_msg=error_msg,
        )
    return True


async def record_chunk_progress(
    *,
    chunk_id: str,
    video_id: str,
    rendition_id: str,
    resolution: str,
    chunk_index: int,
    worker_id: str,
    progress: float,
) -> None:
    """Persist and publish a worker's latest chunk progress on the video channel."""
    bounded_progress = round(min(99.0, max(0.0, progress)), 1)
    async with AsyncSessionLocal() as db:
        chunk = await db.get(Chunk, uuid.UUID(chunk_id))
        if chunk is None:
            raise ValueError(f"Chunk not found: {chunk_id}")
        if chunk.status != "PROCESSING":
            return
        # Progress must never move backwards when FFmpeg emits a delayed line.
        chunk.progress_percent = max(chunk.progress_percent or 0.0, bounded_progress)
        chunk.worker_id = worker_id
        persisted_progress = chunk.progress_percent
        await db.commit()

    await publish_event_async(
        video_id,
        {
            "type": "chunk.progress",
            "video_id": video_id,
            "rendition_id": rendition_id,
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "resolution": resolution,
            "worker_id": worker_id,
            "status": "PROCESSING",
            "progress": persisted_progress,
            "message": "FFmpeg is transcoding this chunk",
        },
    )


def cleanup_chunk_directory(output_dir: Path):
    try:
        if output_dir.exists():
            shutil.rmtree(output_dir)
            logger.info(f"Cleaned temporary directory: {output_dir}")
    except Exception as e:
        logger.warning(f"Failed to clean temporary directory {output_dir}: {e}")


async def cancellation_requested(
    video_id: str,
    cancel_event: asyncio.Event | None = None,
) -> bool:
    """Read the durable cancellation state; Redis is only the fast signal."""
    return await is_video_cancellation_requested(video_id, cancel_event)


async def cancel_and_settle_chunk(
    *,
    chunk_id: str,
    video_id: str,
    rendition_id: str,
    resolution: str,
    chunk_index: int,
    worker_id: str,
) -> None:
    """Cancel this chunk, run shared settlement, then publish its event."""
    async with AsyncSessionLocal() as db:
        settlement = await settle_video_cancellation(
            db,
            uuid.UUID(video_id),
            cancelled_chunk_id=uuid.UUID(chunk_id),
        )

    if settlement.chunk_transitioned:
        await publish_chunk_status_event(
            chunk_id=chunk_id,
            status="CANCELLED",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )


async def main_worker(chunk_id: str, cancel_event: asyncio.Event, active_job: dict):
    """
    This is the main worker function that will be called by the worker process.
    It will fetch chunk data, generate presigned URL, transcode with FFmpeg, and upload to S3.
    """
    result = await fetch_chunk_rendition_video_data(chunk_id)
    if not result:
        logger.warning(f"No database records found for chunk_id: {chunk_id}")
        return

    video_id = str(result["video_id"])
    active_job["video_id"] = video_id
    rendition_id = str(result["rendition_id"])
    resolution = str(result["resolution"])
    chunk_index = int(result["chunk_index"])
    worker_id = socket.gethostname()
    source_frame_rate = float(result["source_frame_rate"] or 30.0)

    # Generate the S3 pre-signed url
    presigned_url = s3_service.generate_presigned_get_url(
        s3_key=result["s3_key"],
        expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        response_filename=result["original_filename"],
    )

    try:
        async with AsyncSessionLocal() as db:
            claimed = await chunk_repository.claim_for_processing(
                db=db,
                chunk_id=uuid.UUID(chunk_id),
                worker_id=worker_id,
            )

        if not claimed:
            logger.info(f"Skipping chunk={chunk_id}. Chunk is no longer PENDING.")
            # Cancellation may have changed this queued chunk to CANCELLED
            # before the worker received it. Re-run the shared, idempotent
            # settlement so the last ineligible Kafka job can complete
            # CANCELLING -> CANCELLED once no active chunks remain.
            if await cancellation_requested(video_id):
                async with AsyncSessionLocal() as db:
                    await settle_video_cancellation(db, uuid.UUID(video_id))
            return

        # claim_for_processing already performed the only DB transition. This
        # restores the event previously emitted by update_chunk_status().
        await publish_chunk_status_event(
            chunk_id=chunk_id,
            status="PROCESSING",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )

        output_dir = await transcode_chunk(
            input_url=presigned_url,
            chunk_id=str(result["id"]),
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            start_seconds=result["start_seconds"],
            end_seconds=result["end_seconds"],
            worker_id=worker_id,
            source_frame_rate=source_frame_rate,
            cancel_event=cancel_event,
        )

        logger.info(f"Transcoded chunk to local directory: {output_dir}")

        # Redis can be missed. Re-read PostgreSQL immediately before uploading
        # so a completed FFmpeg process cannot bypass durable cancellation.
        if await cancellation_requested(video_id):
            logger.info(
                f"Skipping HLS upload for cancelled video={video_id}, chunk={chunk_id}"
            )
            cleanup_chunk_directory(output_dir)
            await cancel_and_settle_chunk(
                chunk_id=chunk_id,
                video_id=video_id,
                rendition_id=rendition_id,
                resolution=resolution,
                chunk_index=chunk_index,
                worker_id=worker_id,
            )
            return

        # Upload HLS chunk files to S3 prefix
        uploaded_count = await upload_hls_chunks(
            local_directory=output_dir,
            s3_prefix=result["temporary_s3_prefix"],
            video_id=video_id,
            cancel_event=cancel_event,
        )

        marked_done = await update_chunk_status(
            chunk_id=chunk_id,
            status="DONE",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )
        if not marked_done:
            cleanup_chunk_directory(output_dir)
            if await cancellation_requested(video_id):
                await cancel_and_settle_chunk(
                    chunk_id=chunk_id,
                    video_id=video_id,
                    rendition_id=rendition_id,
                    resolution=resolution,
                    chunk_index=chunk_index,
                    worker_id=worker_id,
                )
            return
    except TranscodeCancelled:
        logger.info(f"Chunk {chunk_id} was cancelled while transcoding")

        # Remove partial HLS files generated before FFmpeg was stopped.
        cleanup_chunk_directory(Path(f"/tmp/video-transcoder/{chunk_id}"))
        await cancel_and_settle_chunk(
            chunk_id=chunk_id,
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )
        return

    except Exception as e:
        marked_failed = await update_chunk_status(
            chunk_id=chunk_id,
            status="FAILED",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
            error_msg=str(e),
        )
        if not marked_failed and await cancellation_requested(video_id):
            cleanup_chunk_directory(Path(f"/tmp/video-transcoder/{chunk_id}"))
            await cancel_and_settle_chunk(
                chunk_id=chunk_id,
                video_id=video_id,
                rendition_id=rendition_id,
                resolution=resolution,
                chunk_index=chunk_index,
                worker_id=worker_id,
            )
            return
        raise

    # Check if all the chunks have been covered or not for this Rendition before going with playlist assembly
    all_chunks_covered_for_this_rendition = await check_rendition_ready(
        rendition_id=result["rendition_id"]
    )

    if all_chunks_covered_for_this_rendition and not await cancellation_requested(
        video_id, cancel_event
    ):
        await asyncio.to_thread(
            publish_finalize_jobs_for_each_rendition,
            rendition_id,
        )

    cleanup_chunk_directory(output_dir)

    print("=" * 60)
    print(f"  Chunk ID     : {result['id']}")
    print(f"  Source S3    : {result['s3_key']}")
    print(f"  Rendition ID : {result['rendition_id']}")
    print(f"  Resolution   : {result['resolution']}p")
    print(f"  Time Range   : {result['start_seconds']}s -> {result['end_seconds']}s")
    print(f"  Target S3    : {result['temporary_s3_prefix']}")
    print(f"  Uploaded S3  : {uploaded_count} HLS file(s)")
    print("=" * 60)
