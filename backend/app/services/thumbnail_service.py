import asyncio
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.video import Video
from app.repositories.video_repository import video_repository
from app.schemas.video import (
    CompleteThumbnailUploadResponse,
    CreateThumbnailUploadRequest,
    CreateThumbnailUploadResponse,
)
from app.services.redis_publisher import publish_event_sync
from app.services.s3 import s3_service

logger = logging.getLogger("thumbnail_service")

THUMBNAIL_S3_KEY = "videos/{video_id}/thumbnail/thumbnail.webp"
CUSTOM_UPLOAD_S3_KEY = "videos/{video_id}/thumbnail/custom-upload"
_background_tasks: set[asyncio.Task] = set()


def automatic_thumbnail_timestamp(duration_seconds: float) -> float:
    return min(10.0, max(0.0, duration_seconds) * 0.5)


def build_thumbnail_url(
    video_id: uuid.UUID | str, thumbnail_version: int
) -> Optional[str]:
    """Return a cache-busted CloudFront thumbnail URL when one is available."""
    if thumbnail_version <= 0:
        return None

    s3_key = THUMBNAIL_S3_KEY.format(video_id=video_id)
    domain = settings.CLOUDFRONT_DOMAIN
    if domain and domain.strip():
        clean_domain = domain.strip()
        if not clean_domain.startswith(("http://", "https://")):
            clean_domain = f"https://{clean_domain}"
        return f"{clean_domain.rstrip('/')}/{s3_key}?v={thumbnail_version}"

    # A fresh signed URL already changes whenever the API response is rebuilt,
    # so adding an unsigned query value (which can invalidate the signature) is
    # unnecessary for the local/non-CloudFront fallback.
    return s3_service.generate_presigned_get_url(
        s3_key=s3_key,
        expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
    )


async def _extract_single_frame(
    source_url: str,
    timestamp: float,
    output_path: Path,
) -> None:
    # The seek is intentionally after -i. For remote WebM sources this reads and
    # decodes only the early prefix (at most ten seconds), avoiding slow random
    # seeks into an object whose cue/index data may live near the end of the file.
    command = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-rw_timeout",
        "15000000",
        "-seekable",
        "0",
        "-i",
        source_url,
        "-ss",
        f"{timestamp:.3f}",
        "-frames:v",
        "1",
        "-an",
        "-c:v",
        "libwebp",
        "-preset",
        "picture",
        "-quality",
        "95",
        str(output_path),
    ]
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=settings.THUMBNAIL_FFMPEG_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        process.kill()
        await process.communicate()
        raise RuntimeError(
            f"FFmpeg thumbnail extraction timed out after "
            f"{settings.THUMBNAIL_FFMPEG_TIMEOUT_SECONDS}s"
        ) from exc

    if process.returncode != 0 or not output_path.is_file():
        detail = stderr.decode(errors="replace").strip()[-1500:]
        raise RuntimeError(f"FFmpeg thumbnail extraction failed: {detail}")


async def _publish_thumbnail_ready(video_id: uuid.UUID, version: int) -> None:
    await asyncio.to_thread(
        publish_event_sync,
        video_id,
        {
            "type": "thumbnail.ready",
            "video_id": str(video_id),
            "thumbnail_version": version,
            "thumbnail_url": build_thumbnail_url(video_id, version),
        },
    )


async def generate_automatic_thumbnail(
    video_id: uuid.UUID,
    source_s3_key: str,
    duration_seconds: float,
) -> None:
    """Generate one auxiliary thumbnail; failures never escape this task."""
    try:
        async with AsyncSessionLocal() as db:
            video = await video_repository.get_by_id(db, video_id)
            if not video or video.thumbnail_version > 0:
                return

        timestamp = automatic_thumbnail_timestamp(duration_seconds)
        source_url = s3_service.generate_presigned_get_url(
            s3_key=source_s3_key,
            expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        )

        with tempfile.TemporaryDirectory(prefix=f"thumbnail_{video_id}_") as temp_dir:
            output_path = Path(temp_dir) / "thumbnail.webp"
            logger.info(
                "Extracting one automatic thumbnail for video %s at %.3fs",
                video_id,
                timestamp,
            )
            await _extract_single_frame(source_url, timestamp, output_path)

            # Lock the video row across the final upload and version update. A
            # simultaneous custom confirmation takes the same lock, guaranteeing
            # that the custom image is the final writer even across API workers.
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Video).where(Video.id == video_id).with_for_update()
                )
                video = result.scalar_one_or_none()
                if not video or video.thumbnail_version > 0:
                    await db.rollback()
                    return

                uploaded = await asyncio.to_thread(
                    s3_service.upload_file,
                    str(output_path),
                    THUMBNAIL_S3_KEY.format(video_id=video_id),
                    "image/webp",
                    {"CacheControl": "public, max-age=31536000, immutable"},
                )
                if not uploaded:
                    raise RuntimeError("Could not upload automatic thumbnail to S3")

                video.thumbnail_source = "AUTO"
                video.thumbnail_version = (video.thumbnail_version or 0) + 1
                await db.commit()
                version = video.thumbnail_version

        await _publish_thumbnail_ready(video_id, version)
        logger.info(
            "Automatic thumbnail ready for video %s (version=%s)",
            video_id,
            version,
        )
    except Exception:
        logger.exception(
            "Automatic thumbnail generation failed for video %s; transcoding will continue",
            video_id,
        )


def schedule_automatic_thumbnail(
    video_id: uuid.UUID,
    source_s3_key: str,
    duration_seconds: float,
) -> None:
    """Keep a strong reference to the non-blocking auxiliary thumbnail task."""
    task = asyncio.create_task(
        generate_automatic_thumbnail(video_id, source_s3_key, duration_seconds),
        name=f"automatic-thumbnail-{video_id}",
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _validate_custom_thumbnail(source_path: Path) -> None:
    """Validate image contents without resizing, rotating, or re-encoding them."""
    try:
        with Image.open(source_path) as uploaded:
            uploaded.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded thumbnail is not a valid JPEG, PNG, or WebP image.",
        ) from exc


class ThumbnailService:
    async def create_custom_upload(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
        request: CreateThumbnailUploadRequest,
    ) -> CreateThumbnailUploadResponse:
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video asset not found.")
        if request.content_type not in settings.ALLOWED_THUMBNAIL_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thumbnail must be a JPEG, PNG, or WebP image.",
            )
        if request.file_size_bytes > settings.MAX_THUMBNAIL_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_THUMBNAIL_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Thumbnail exceeds the {max_mb} MB size limit.",
            )

        upload_url = s3_service.generate_presigned_put_url(
            s3_key=CUSTOM_UPLOAD_S3_KEY.format(video_id=video_id),
            content_type=request.content_type,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        )
        return CreateThumbnailUploadResponse(
            upload_url=upload_url,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        )

    async def complete_custom_upload(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> CompleteThumbnailUploadResponse:
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video asset not found.")

        staging_key = CUSTOM_UPLOAD_S3_KEY.format(video_id=video_id)
        metadata = await asyncio.to_thread(s3_service.verify_object_exists, staging_key)
        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The thumbnail upload was not found in S3.",
            )
        if (
            metadata.get("content_type") or ""
        ) not in settings.ALLOWED_THUMBNAIL_CONTENT_TYPES:
            await asyncio.to_thread(s3_service.delete_object, staging_key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded object has an unsupported image content type.",
            )
        if (
            metadata.get("content_length") or 0
        ) > settings.MAX_THUMBNAIL_UPLOAD_SIZE_BYTES:
            await asyncio.to_thread(s3_service.delete_object, staging_key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded thumbnail exceeds the configured size limit.",
            )

        try:
            with tempfile.TemporaryDirectory(
                prefix=f"custom_thumbnail_{video_id}_"
            ) as temp_dir:
                source_path = Path(temp_dir) / "upload"
                downloaded = await asyncio.to_thread(
                    s3_service.download_file, staging_key, str(source_path)
                )
                if not downloaded:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Could not retrieve the uploaded thumbnail from S3.",
                    )
                await asyncio.to_thread(_validate_custom_thumbnail, source_path)

                # End the initial read transaction, then serialize the final S3
                # write with automatic generation using a PostgreSQL row lock.
                await db.rollback()
                result = await db.execute(
                    select(Video).where(Video.id == video_id).with_for_update()
                )
                video = result.scalar_one_or_none()
                if not video:
                    raise HTTPException(
                        status_code=404, detail="Video asset not found."
                    )

                copied = await asyncio.to_thread(
                    s3_service.copy_object,
                    staging_key,
                    THUMBNAIL_S3_KEY.format(video_id=video_id),
                    metadata["content_type"],
                    "public, max-age=31536000, immutable",
                )
                if not copied:
                    await db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Could not store the custom thumbnail.",
                    )

                video.thumbnail_source = "CUSTOM"
                video.thumbnail_version = (video.thumbnail_version or 0) + 1
                await db.commit()
                version = video.thumbnail_version
        finally:
            await asyncio.to_thread(s3_service.delete_object, staging_key)

        thumbnail_url = build_thumbnail_url(video_id, version)
        if thumbnail_url is None:
            raise HTTPException(status_code=500, detail="Thumbnail URL is unavailable.")

        await _publish_thumbnail_ready(video_id, version)
        return CompleteThumbnailUploadResponse(
            thumbnail_url=thumbnail_url,
            thumbnail_version=version,
        )


thumbnail_service = ThumbnailService()
