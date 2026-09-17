import uuid
import logging
import asyncio
import shutil
from pathlib import Path
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.models import Chunk, Rendition, Video
from app.services.s3 import s3_service
from app.config import settings
from datetime import datetime, timezone
from finalizer.rendition_finalizer import check_rendition_ready
from worker.producer import publish_finalize_jobs_for_each_rendition

logger = logging.getLogger("transcoder")


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
                Video.s3_key,
                Video.original_filename,
                Rendition.resolution,
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
    resolution: str,
    start_seconds: float,
    end_seconds: float,
):
    duration = end_seconds - start_seconds
    output_dir = Path(f"/tmp/video-transcoder/{chunk_id}")
    output_dir.mkdir(parents=True, exist_ok=True)
    playlist = output_dir / "index.m3u8"
    segment_pattern = output_dir / "segment_%03d.ts"
    # output_file = output_dir / "output.mp4"
    command = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start_seconds),
        "-i",
        input_url,
        "-t",
        str(duration),
        "-vf",
        f"scale=-2:{resolution}",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
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

    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        error = stderr.decode(errors="replace")
        logger.error(f"FFmpeg failed for chunk {chunk_id}:\n{error}")
        raise RuntimeError(f"FFmpeg exited with code {process.returncode}")

    logger.info(f"FFmpeg completed chunk={chunk_id}: {playlist}")

    return output_dir


async def update_chunk_status(chunk_id: str, status: str):
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
        elif status == "DONE":
            chunk.status = "DONE"
            chunk.completed_at = now
            if chunk.processing_started_at:
                chunk.processing_time_seconds = (
                    now - chunk.processing_started_at
                ).total_seconds()
        elif status == "FAILED":
            chunk.status = "FAILED"
            chunk.completed_at = now
        else:
            raise ValueError(f"Invalid chunk status: {status}")
        await db.commit()
        logger.info(f"Chunk {chunk_id} marked {status}")


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

    # Generate the S3 pre-signed url
    presigned_url = s3_service.generate_presigned_get_url(
        s3_key=result["s3_key"],
        expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        response_filename=result["original_filename"],
    )
    await update_chunk_status(chunk_id, "PROCESSING")
    output_dir = await transcode_chunk(
        input_url=presigned_url,
        chunk_id=str(result["id"]),
        resolution=result["resolution"],
        start_seconds=result["start_seconds"],
        end_seconds=result["end_seconds"],
    )

    logger.info(f"Transcoded chunk to local directory: {output_dir}")

    # Upload HLS chunk files to S3 prefix
    uploaded_count = await upload_hls_chunks(
        local_directory=output_dir, s3_prefix=result["temporary_s3_prefix"]
    )

    await update_chunk_status(chunk_id, "DONE")

    # Check if all the chunks have been covered or not for this Rendition before going with playlist assembly
    all_chunks_covered_for_this_rendition = await check_rendition_ready(
        rendition_id=result["rendition_id"]
    )

    rendition_id = result["rendition_id"]

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
