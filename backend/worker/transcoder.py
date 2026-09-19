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

logger = logging.getLogger("transcoder")


def _as_int(value: str | None) -> int | None:
    try:
        return int(value) if value is not None and value != "N/A" else None
    except ValueError:
        return None


def _as_float(value: str | None) -> float | None:
    try:
        return float(value) if value is not None and value != "N/A" else None
    except ValueError:
        return None


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


async def upload_hls_chunks(local_directory: Path, s3_prefix: str) -> int:
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
        s3_key = f"{prefix}{file_path.name}"

        success = s3_service.upload_file(
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
        line_bytes = await process.stdout.readline()
        if not line_bytes:
            break
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
                        ffmpeg_progress={
                            "frame": _as_int(ffmpeg_values.get("frame")),
                            "fps": _as_float(ffmpeg_values.get("fps")),
                            "time": ffmpeg_values.get("out_time"),
                            "speed": ffmpeg_values.get("speed"),
                            "bitrate": ffmpeg_values.get("bitrate"),
                            "total_size": _as_int(ffmpeg_values.get("total_size")),
                            "dup_frames": _as_int(ffmpeg_values.get("dup_frames")),
                            "drop_frames": _as_int(ffmpeg_values.get("drop_frames")),
                            "progress": value,
                        },
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


async def update_chunk_status(
    chunk_id: str,
    status: str,
    video_id: str | None = None,
    rendition_id: str | None = None,
    resolution: str | None = None,
    chunk_index: int | None = None,
    worker_id: str | None = None,
    error_msg: str | None = None,
):
    chunk_uuid = uuid.UUID(chunk_id)
    async with AsyncSessionLocal() as db:
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
            chunk.status = "DONE"
            chunk.progress_percent = 100.0
            chunk.completed_at = now
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        elif status == "FAILED":
            chunk.status = "FAILED"
            chunk.completed_at = now
            chunk.error_message = error_msg
        else:
            raise ValueError(f"Invalid chunk status: {status}")
        await db.commit()
        logger.info(f"Chunk {chunk_id} marked {status}")

    if video_id and rendition_id and resolution is not None and chunk_index is not None:
        event_type = (
            "chunk.started"
            if status == "PROCESSING"
            else "chunk.completed"
            if status == "DONE"
            else "chunk.failed"
        )
        progress_val = (
            0.0 if status == "PROCESSING" else 100.0 if status == "DONE" else 0.0
        )
        payload = {
            "type": event_type,
            "video_id": video_id,
            "rendition_id": rendition_id,
            "chunk_id": chunk_id,
            "chunk_index": chunk_index,
            "resolution": resolution,
            "worker_id": worker_id or socket.gethostname(),
            "status": status,
            "progress": progress_val,
            "message": (
                "Worker started FFmpeg for this chunk"
                if status == "PROCESSING"
                else "Chunk transcoding and upload completed"
                if status == "DONE"
                else "Chunk transcoding failed"
            ),
        }
        if error_msg:
            payload["error"] = error_msg
        await publish_event_async(video_id, payload)


async def record_chunk_progress(
    *,
    chunk_id: str,
    video_id: str,
    rendition_id: str,
    resolution: str,
    chunk_index: int,
    worker_id: str,
    progress: float,
    ffmpeg_progress: dict | None = None,
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
        if ffmpeg_progress:
            chunk.ffmpeg_progress = ffmpeg_progress
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
            "ffmpeg": ffmpeg_progress,
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


async def main_worker(chunk_id: str):
    """
    This is the main worker function that will be called by the worker process.
    It will fetch chunk data, generate presigned URL, transcode with FFmpeg, and upload to S3.
    """
    result = await fetch_chunk_rendition_video_data(chunk_id)
    if not result:
        logger.warning(f"No database records found for chunk_id: {chunk_id}")
        return

    video_id = str(result["video_id"])
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
        await update_chunk_status(
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
        )

        logger.info(f"Transcoded chunk to local directory: {output_dir}")

        # Upload HLS chunk files to S3 prefix
        uploaded_count = await upload_hls_chunks(
            local_directory=output_dir, s3_prefix=result["temporary_s3_prefix"]
        )

        await update_chunk_status(
            chunk_id=chunk_id,
            status="DONE",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
        )
    except Exception as e:
        await update_chunk_status(
            chunk_id=chunk_id,
            status="FAILED",
            video_id=video_id,
            rendition_id=rendition_id,
            resolution=resolution,
            chunk_index=chunk_index,
            worker_id=worker_id,
            error_msg=str(e),
        )
        raise

    # Check if all the chunks have been covered or not for this Rendition before going with playlist assembly
    all_chunks_covered_for_this_rendition = await check_rendition_ready(
        rendition_id=result["rendition_id"]
    )

    if all_chunks_covered_for_this_rendition:
        publish_finalize_jobs_for_each_rendition(rendition_id)

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
