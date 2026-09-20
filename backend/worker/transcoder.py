import uuid
import logging
import asyncio
import os
import shutil
import socket
import time
from pathlib import Path
from app.database import AsyncSessionLocal
from sqlalchemy import func, select
from app.models import Chunk, Rendition, Video
from app.services.s3 import s3_service
from app.services.redis_publisher import publish_event_async
from app.config import settings
from datetime import datetime, timezone
from app.repositories.chunk_repository import chunk_repository
from app.repositories.video_repository import video_repository
from app.services.outbox_service import enqueue_rendition_finalizer_job
from app.services.failure_service import propagate_video_failure
from app.services.pipeline_settlement import settle_stopped_video
from app.services.pipeline_cancellation import is_video_cancellation_requested
from app.core.failure_handling import (
    JobCancelledError,
    PermanentJobError,
    RetryableJobError,
)
# FFmpeg failures are permanent and some are retryable -> hence we require careful handling for that

logger = logging.getLogger("transcoder")


def chunk_attempt_output_dir(chunk_id: str, worker_id: str) -> Path:
    safe_worker_id = worker_id.replace("/", "_").replace(":", "_")
    return Path(f"/tmp/video-transcoder/{chunk_id}/{safe_worker_id}")


class TranscodeCancelled(JobCancelledError):
    """
    Raised when an FFmpeg process is intentionally stopped because
    the user cancelled video processing.

    This is kept separate from normal FFmpeg failures so the chunk
    becomes CANCELLED instead of FAILED.
    """

    pass


class LeaseLostError(RetryableJobError):
    """This worker no longer owns the durable chunk processing lease."""

    pass


class WorkerShutdownError(Exception):
    """The process is stopping; leave Kafka and the chunk lease recoverable."""

    pass


class ChunkLeaseBusyError(RetryableJobError):
    """A different worker still holds this chunk's active lease."""

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

    logger.info(f"Stopping FFmpeg for chunk={chunk_id}")

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
    except (ValueError, TypeError) as exc:
        raise PermanentJobError(
            f"Invalid chunk UUID: {chunk_id}"
        ) from exc # Having a wrong chunk_id, and retrying it again and again wont make it valid

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
    lease_lost_event: asyncio.Event,
) -> int:
    """
    Uploads the HLS chunks (.m3u8 playlist and .ts segments) from local_directory to S3 at s3_prefix.
    """
    if not local_directory.exists() or not local_directory.is_dir():
        raise RetryableJobError(
            f"Transcode output directory '{local_directory}' does not exist"
        )

    playlist = local_directory / "index.m3u8"
    segments = sorted(local_directory.glob("*.ts"))
    if not playlist.is_file() or not segments:
        raise RetryableJobError(
            f"Incomplete local HLS output for chunk: playlist={playlist.is_file()} "
            f"segments={len(segments)}"
        )

    uploaded_count = 0
    prefix = s3_prefix.rstrip("/") + "/"
    # Publish the playlist last. A failed partial upload therefore cannot expose
    # a new manifest that references segments which have not reached S3 yet.
    upload_order = segments + [playlist]
    for file_path in upload_order:
        if await is_video_cancellation_requested(video_id, cancel_event):
            raise TranscodeCancelled()
        if lease_lost_event.is_set():
            raise LeaseLostError("Chunk lease was lost before HLS upload completed")
        s3_key = f"{prefix}{file_path.name}"

        success = await asyncio.to_thread(
            s3_service.upload_file,
            local_file_path=str(file_path),
            s3_key=s3_key,
        )
        if not success:
            raise RetryableJobError(f"Failed to upload {file_path.name} to S3")

        uploaded_count += 1

    return uploaded_count

def build_ffmpeg_failure(
    stderr: str,
    returncode: int,
) -> Exception:
    """
    Convert an FFmpeg failure into a pipeline failure type.

    Permanent:
        The source/input itself is invalid or unsupported.

    Retryable:
        Everything else for now, since infrastructure/resource/network
        failures may succeed on another attempt.
    """

    error = stderr.lower()

    permanent_patterns = (
        "invalid data found when processing input",
        "moov atom not found",
        "could not find codec parameters",
        "unsupported codec",
    )

    if any(pattern in error for pattern in permanent_patterns):
        return PermanentJobError(
            f"FFmpeg rejected the source media: {stderr[-1000:]}"
        )

    return RetryableJobError(
        f"FFmpeg exited with code {returncode}: {stderr[-1000:]}"
    )

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
    lease_lost_event: asyncio.Event,
    shutdown_event: asyncio.Event | None = None,
):
    duration = end_seconds - start_seconds
    duration_us = max(1.0, duration * 1_000_000)
    output_dir = chunk_attempt_output_dir(chunk_id, worker_id)
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

    async def monitor_durable_stop_state() -> None:
        """Poll PostgreSQL without retaining a session while FFmpeg runs."""
        while process.returncode is None and not cancel_event.is_set():
            await asyncio.sleep(5.0)
            try:
                if await is_video_cancellation_requested(video_id):
                    logger.info(
                        "Durable stop state detected for video=%s chunk=%s",
                        video_id,
                        chunk_id,
                    )
                    cancel_event.set()
                    return
            except Exception:
                logger.warning(
                    "Could not check durable stop state for video=%s chunk=%s",
                    video_id,
                    chunk_id,
                    exc_info=True,
                )

    durable_stop_task = asyncio.create_task(monitor_durable_stop_state())

    async def stop_durable_stop_monitor() -> None:
        if not durable_stop_task.done():
            durable_stop_task.cancel()
        try:
            await durable_stop_task
        except asyncio.CancelledError:
            pass

    while True:
        # Wait for either:
        # 1. FFmpeg to produce another progress line
        # 2. This chunk/video to receive a cancellation signal
        progress_task = asyncio.create_task(process.stdout.readline())
        cancel_task = asyncio.create_task(cancel_event.wait())
        lease_task = asyncio.create_task(lease_lost_event.wait())
        shutdown_task = (
            asyncio.create_task(shutdown_event.wait())
            if shutdown_event is not None
            else None
        )

        waiters = {progress_task, cancel_task, lease_task}
        if shutdown_task is not None:
            waiters.add(shutdown_task)
        done, _ = await asyncio.wait(
            waiters,
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Durable user cancellation wins if it races process shutdown.
        if cancel_task in done and cancel_event.is_set():
            if not progress_task.done():
                progress_task.cancel()
            if not lease_task.done():
                lease_task.cancel()
            if shutdown_task is not None and not shutdown_task.done():
                shutdown_task.cancel()
            await stop_durable_stop_monitor()
            await terminate_ffmpeg_process(
                process=process,
                chunk_id=chunk_id,
            )
            await stderr_task
            raise TranscodeCancelled(f"Transcoding cancelled for chunk {chunk_id}")

        if shutdown_task is not None and shutdown_task in done:
            if not progress_task.done():
                progress_task.cancel()
            if not cancel_task.done():
                cancel_task.cancel()
            if not lease_task.done():
                lease_task.cancel()
            await stop_durable_stop_monitor()
            await terminate_ffmpeg_process(process=process, chunk_id=chunk_id)
            await stderr_task
            raise WorkerShutdownError(
                f"Worker shutdown interrupted chunk {chunk_id}"
            )

        if lease_task in done and lease_lost_event.is_set():
            if not progress_task.done():
                progress_task.cancel()
            if not cancel_task.done():
                cancel_task.cancel()
            if shutdown_task is not None and not shutdown_task.done():
                shutdown_task.cancel()
            await stop_durable_stop_monitor()
            await terminate_ffmpeg_process(process=process, chunk_id=chunk_id)
            await stderr_task
            raise LeaseLostError(f"Transcode lease lost for chunk {chunk_id}")

        # FFmpeg produced output first.
        # Stop the unused cancellation waiter for this iteration.
        cancel_task.cancel()
        lease_task.cancel()
        if shutdown_task is not None:
            shutdown_task.cancel()

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

    await stop_durable_stop_monitor()
    await process.wait()
    await stderr_task

    if process.returncode != 0:
        error = b"".join(stderr_chunks).decode(errors="replace")
        logger.error(f"FFmpeg failed for chunk {chunk_id}:\n{error}")
        raise build_ffmpeg_failure(
            stderr=error,
            returncode=process.returncode,
        )

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
            owns_lease = worker_id is not None and (
                await chunk_repository.owns_active_lease(
                    db,
                    chunk_uuid,
                    worker_id,
                )
            )
            if not owns_lease:
                await db.rollback()
                return False
            chunk.status = "DONE"
            chunk.progress_percent = 100.0
            chunk.completed_at = now
            chunk.error_message = None
            chunk.lease_expires_at = None
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
            await db.flush()
            if await chunk_repository.are_all_chunks_completed(
                db, chunk.rendition_id
            ):
                await enqueue_rendition_finalizer_job(db, chunk.rendition_id)
        elif status == "FAILED":
            if chunk.status != "PROCESSING" or chunk.worker_id != worker_id:
                await db.rollback()
                return False
            chunk.status = "FAILED"
            chunk.completed_at = now
            chunk.error_message = error_msg
            chunk.lease_expires_at = None
        elif status == "CANCELLED":
            if chunk.status != "PROCESSING" or chunk.worker_id != worker_id:
                await db.rollback()
                return False
            chunk.status = "CANCELLED"
            chunk.progress_percent = 0.0
            chunk.ffmpeg_progress = None
            chunk.completed_at = now
            chunk.worker_id = None
            chunk.lease_expires_at = None
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
        chunk = (
            await db.execute(
                select(Chunk)
                .where(
                    Chunk.id == uuid.UUID(chunk_id),
                    Chunk.status == "PROCESSING",
                    Chunk.worker_id == worker_id,
                    Chunk.lease_expires_at.is_not(None),
                    Chunk.lease_expires_at > func.now(),
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if chunk is None:
            await db.rollback()
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


async def owns_active_chunk_lease(chunk_id: str, worker_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        return await chunk_repository.owns_active_lease(
            db,
            uuid.UUID(chunk_id),
            worker_id,
        )


async def maintain_chunk_lease(
    *,
    chunk_id: str,
    worker_id: str,
    stop_event: asyncio.Event,
    lease_lost_event: asyncio.Event,
) -> None:
    """Extend this attempt's lease until stopped or ownership is lost."""
    last_confirmed_at = asyncio.get_running_loop().time()
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.TRANSCODE_LEASE_HEARTBEAT_SECONDS,
            )
            return
        except asyncio.TimeoutError:
            pass

        try:
            async with AsyncSessionLocal() as db:
                extended = await chunk_repository.extend_lease(
                    db,
                    uuid.UUID(chunk_id),
                    worker_id,
                    settings.TRANSCODE_LEASE_DURATION_SECONDS,
                )
        except Exception:
            logger.warning(
                "Could not heartbeat chunk lease chunk=%s worker=%s",
                chunk_id,
                worker_id,
                exc_info=True,
            )
            if (
                asyncio.get_running_loop().time() - last_confirmed_at
                >= settings.TRANSCODE_LEASE_DURATION_SECONDS
            ):
                lease_lost_event.set()
                return
            continue

        if not extended:
            logger.warning(
                "Chunk lease ownership lost chunk=%s worker=%s",
                chunk_id,
                worker_id,
            )
            lease_lost_event.set()
            return
        last_confirmed_at = asyncio.get_running_loop().time()


async def stop_chunk_heartbeat(
    task: asyncio.Task | None,
    stop_event: asyncio.Event,
) -> None:
    if task is None:
        return
    stop_event.set()
    try:
        await task
    except asyncio.CancelledError:
        pass


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
        settlement = await settle_stopped_video(
            db,
            uuid.UUID(video_id),
            stopped_chunk_id=uuid.UUID(chunk_id),
            worker_id=worker_id,
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


async def release_chunk_for_retry(
    chunk_id: str,
    error_message: str,
    worker_id: str | None,
    next_attempt: int,
) -> bool:
    """Make a retryable chunk claimable by the republished Kafka job."""
    try:
        chunk_uuid = uuid.UUID(chunk_id)
    except (TypeError, ValueError):
        return False
    async with AsyncSessionLocal() as db:
        released = await chunk_repository.release_for_retry(
            db,
            chunk_uuid,
            error_message,
            worker_id,
        )
    if not released:
        return False

    # PostgreSQL remains PENDING. RETRYING is intentionally only a transient
    # SSE/UI state while backoff and Kafka republication are in progress.
    result = await fetch_chunk_rendition_video_data(chunk_id)
    if result and not await cancellation_requested(str(result["video_id"])):
        await publish_event_async(
            str(result["video_id"]),
            {
                "type": "chunk.retrying",
                "video_id": str(result["video_id"]),
                "rendition_id": str(result["rendition_id"]),
                "chunk_id": chunk_id,
                "chunk_index": int(result["chunk_index"]),
                "resolution": str(result["resolution"]),
                "status": "RETRYING",
                "progress": 0.0,
                "worker_id": None,
                "attempt": next_attempt,
                "message": "Scheduled for retry",
            },
        )
    return True


async def settle_retry_failure_if_cancelled(
    chunk_id: str,
    worker_id: str | None,
) -> bool:
    """Close a cancellation race instead of reopening the chunk for retry."""
    try:
        result = await fetch_chunk_rendition_video_data(chunk_id)
    except PermanentJobError:
        return False
    if not result:
        return False
    video_id = str(result["video_id"])
    if not await cancellation_requested(video_id):
        return False

    cleanup_chunk_directory(chunk_attempt_output_dir(chunk_id, worker_id or "unknown"))
    await cancel_and_settle_chunk(
        chunk_id=chunk_id,
        video_id=video_id,
        rendition_id=str(result["rendition_id"]),
        resolution=str(result["resolution"]),
        chunk_index=int(result["chunk_index"]),
        worker_id=worker_id or "",
    )
    return True


async def mark_chunk_failed_terminal(
    chunk_id: str,
    error_message: str,
    worker_id: str | None,
) -> bool:
    """Atomically begin and, when possible, settle pipeline failure."""
    try:
        result = await fetch_chunk_rendition_video_data(chunk_id)
    except PermanentJobError:
        return False
    if not result:
        return False

    video_id = str(result["video_id"])
    if worker_id is None:
        return False
    initiation, _ = await propagate_video_failure(
        video_id=video_id,
        failed_chunk_id=chunk_id,
        error_message=error_message,
        worker_id=worker_id,
    )

    if initiation.chunk_transitioned:
        await publish_chunk_status_event(
            chunk_id=chunk_id,
            status="FAILED",
            video_id=video_id,
            rendition_id=str(result["rendition_id"]),
            resolution=str(result["resolution"]),
            chunk_index=int(result["chunk_index"]),
            worker_id=worker_id,
            error_msg=error_message,
        )

    return initiation.status in {"FAILING", "FAILED"}


async def main_worker(
    chunk_id: str,
    cancel_event: asyncio.Event,
    active_job: dict,
    shutdown_event: asyncio.Event | None = None,
):
    """
    This is the main worker function that will be called by the worker process.
    It will fetch chunk data, generate presigned URL, transcode with FFmpeg, and upload to S3.
    """
    worker_id = (
        f"{socket.gethostname()[:60]}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
    )[:100]
    active_job["worker_id"] = worker_id
    result = await fetch_chunk_rendition_video_data(chunk_id)
    if not result:
        raise PermanentJobError(
            f"Chunk/Rendition/Video data not found for chunk_id={chunk_id}"
        )

    video_id = str(result["video_id"])
    active_job["video_id"] = video_id
    rendition_id = str(result["rendition_id"])
    resolution = str(result["resolution"])
    chunk_index = int(result["chunk_index"])
    source_frame_rate = float(result["source_frame_rate"] or 30.0)
    heartbeat_stop_event = asyncio.Event()
    lease_lost_event = asyncio.Event()
    heartbeat_task: asyncio.Task | None = None

    try:
        if shutdown_event is not None and shutdown_event.is_set():
            raise WorkerShutdownError("Worker shutdown requested before chunk claim")
        async with AsyncSessionLocal() as db:
            claimed = await chunk_repository.claim_for_processing(
                db=db,
                chunk_id=uuid.UUID(chunk_id),
                worker_id=worker_id,
                lease_duration_seconds=settings.TRANSCODE_LEASE_DURATION_SECONDS,
            )

        if not claimed:
            logger.info(f"Chunk={chunk_id} was not claimable by worker={worker_id}.")
            # Cancellation may have changed this queued chunk to CANCELLED
            # before the worker received it. Re-run the shared, idempotent
            # settlement so the last ineligible Kafka job can complete
            # CANCELLING -> CANCELLED once no active chunks remain.
            if await cancellation_requested(video_id):
                async with AsyncSessionLocal() as db:
                    await settle_stopped_video(db, uuid.UUID(video_id))
                return
            async with AsyncSessionLocal() as db:
                still_processing = await chunk_repository.is_processing(
                    db,
                    uuid.UUID(chunk_id),
                )
            if still_processing:
                raise ChunkLeaseBusyError(
                    f"Chunk {chunk_id} is owned by another active lease"
                )
            return

        heartbeat_task = asyncio.create_task(
            maintain_chunk_lease(
                chunk_id=chunk_id,
                worker_id=worker_id,
                stop_event=heartbeat_stop_event,
                lease_lost_event=lease_lost_event,
            )
        )

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
        # Failures from this point belong to a durably claimed attempt.
        presigned_url = s3_service.generate_presigned_get_url(
            s3_key=result["s3_key"],
            expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
            response_filename=result["original_filename"],
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
            lease_lost_event=lease_lost_event,
            shutdown_event=shutdown_event,
        )

        logger.info(f"Transcoded chunk to local directory: {output_dir}")

        if lease_lost_event.is_set() or not await owns_active_chunk_lease(
            chunk_id,
            worker_id,
        ):
            raise LeaseLostError(f"Chunk lease lost before upload: {chunk_id}")

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
            lease_lost_event=lease_lost_event,
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
            raise LeaseLostError(
                f"Worker {worker_id} no longer owns chunk {chunk_id} at DONE"
            )
    except TranscodeCancelled:
        logger.info(f"Chunk {chunk_id} was cancelled while transcoding")

        # Remove partial HLS files generated before FFmpeg was stopped.
        cleanup_chunk_directory(chunk_attempt_output_dir(chunk_id, worker_id))
        await cancel_and_settle_chunk(
            chunk_id=chunk_id,
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )
        return

    except Exception:
        cleanup_chunk_directory(chunk_attempt_output_dir(chunk_id, worker_id))
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
        raise

    finally:
        await stop_chunk_heartbeat(heartbeat_task, heartbeat_stop_event)

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
