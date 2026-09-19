import uuid
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.video import Video
from app.schemas.video import (
    CreateVideoRequest,
    CreateVideoResponse,
    CompleteUploadResponse,
    RenameVideoRequest,
    RenameVideoResponse,
    VideoResponse,
    VideoDetailResponse,
)
from app.services.s3 import s3_service
from app.services.thumbnail_service import (
    build_thumbnail_url,
    schedule_automatic_thumbnail,
)
from app.repositories.video_repository import video_repository
from planner.producer import get_planner_producer, publish_planning_job

logger = logging.getLogger("video_service")


def build_master_playlist_url(video_id: uuid.UUID | str) -> Optional[str]:
    """
    Centralized helper to construct the master.m3u8 playback URL.
    Uses settings.CLOUDFRONT_DOMAIN if configured (e.g. 'd123456.cloudfront.net').
    Falls back to presigned S3 GET URL if CLOUDFRONT_DOMAIN is not set.
    """
    s3_key = f"videos/{video_id}/processed/master.m3u8"
    domain = settings.CLOUDFRONT_DOMAIN

    if domain and domain.strip():
        clean_domain = domain.strip()
        if not clean_domain.startswith("http://") and not clean_domain.startswith(
            "https://"
        ):
            clean_domain = f"https://{clean_domain}"
        clean_domain = clean_domain.rstrip("/")
        return f"{clean_domain}/{s3_key}"

    # Fallback to S3 presigned GET URL if CloudFront is not configured
    try:
        return s3_service.generate_presigned_get_url(
            s3_key=s3_key,
            expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        )
    except Exception:
        return f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"


class VideoService:
    async def create_video(
        self, db: AsyncSession, req: CreateVideoRequest
    ) -> CreateVideoResponse:
        """Validates payload, creates video record with PENDING_UPLOAD, and returns S3 presigned PUT URL."""
        # 1. Content type validation
        if (
            not req.content_type.startswith("video/")
            and req.content_type not in settings.ALLOWED_CONTENT_TYPES
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported content type '{req.content_type}'. Must be a valid video MIME type.",
            )

        # 2. File size validation
        if req.file_size_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum allowed limit of {max_mb} MB.",
            )

        # 3. Generate UUID and deterministic S3 key
        video_id = uuid.uuid4()
        s3_key = s3_service.get_deterministic_s3_key(str(video_id), req.filename)

        # 4. Insert Video DB record
        video = Video(
            id=video_id,
            original_filename=req.filename,
            content_type=req.content_type,
            file_size_bytes=req.file_size_bytes,
            source_width=req.source_width,
            source_height=req.source_height,
            duration_seconds=req.duration_seconds,
            s3_bucket=s3_service.bucket,
            s3_key=s3_key,
            status="PENDING_UPLOAD",
            created_at=datetime.now(timezone.utc),
        )
        created_video = await video_repository.create_video(db, video)

        # 5. Audit event
        await video_repository.log_event(
            db=db,
            video_id=created_video.id,
            event_type="VIDEO_CREATED",
            message=f"Video record created for {req.filename} ({req.file_size_bytes} bytes).",
            event_metadata={
                "filename": req.filename,
                "size": req.file_size_bytes,
                "content_type": req.content_type,
            },
        )

        # 6. Generate presigned PUT URL for browser direct S3 upload
        upload_url = s3_service.generate_presigned_put_url(
            s3_key=s3_key,
            content_type=req.content_type,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        )

        return CreateVideoResponse(
            video_id=created_video.id,
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        )

    async def complete_upload(
        self, db: AsyncSession, video_id: uuid.UUID
    ) -> CompleteUploadResponse:
        """Verifies S3 object existence via HeadObject, marks video as UPLOADED, and publishes Kafka planning job."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        # Perform S3 HeadObject verification - NEVER trust the frontend blindly
        s3_meta = s3_service.verify_object_exists(video.s3_key)
        if not s3_meta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="S3 verification failed: Video file object was not found in S3 bucket. Upload may have failed or been aborted.",
            )

        now = datetime.now(timezone.utc)
        updated_video = await video_repository.update_status(
            db=db,
            video=video,
            status="UPLOADED",
            uploaded_at=now,
            processing_started_at=now,
        )

        # Audit event
        await video_repository.log_event(
            db=db,
            video_id=updated_video.id,
            event_type="UPLOAD_COMPLETED",
            message=f"Direct S3 upload verified successfully. Size: {s3_meta.get('content_length')} bytes.",
            event_metadata=s3_meta,
        )

        # Publish planning job to Kafka topic `planner.jobs`
        try:
            producer = get_planner_producer()
            if producer:
                publish_planning_job(producer=producer, video_id=str(updated_video.id))
                producer.flush()
                await video_repository.log_event(
                    db=db,
                    video_id=updated_video.id,
                    event_type="PLANNING_JOB_SUBMITTED",
                    message=f"Published planning job to Kafka topic '{settings.KAFKA_PLANNER_TOPIC}'.",
                )
                logger.info(
                    f"Published planning job for video_id={updated_video.id} to Kafka topic '{settings.KAFKA_PLANNER_TOPIC}'"
                )
        except Exception as e:
            logger.warning(
                f"Could not publish planning job for video {updated_video.id} to Kafka: {e}"
            )

        # This starts an independent async task on the FastAPI event loop and
        # returns immediately. It is auxiliary: all thumbnail errors are logged
        # inside the task and cannot change the upload/transcoding result.
        if updated_video.duration_seconds is not None:
            schedule_automatic_thumbnail(
                updated_video.id,
                updated_video.s3_key,
                updated_video.duration_seconds,
            )
        else:
            logger.warning(
                "Skipping automatic thumbnail for video %s because duration is unavailable",
                updated_video.id,
            )

        return CompleteUploadResponse(
            video_id=updated_video.id,
            status=updated_video.status,
            uploaded_at=updated_video.uploaded_at or now,
        )

    async def list_videos(
        self,
        db: AsyncSession,
        limit: int = 100,
        offset: int = 0,
    ) -> List[VideoResponse]:
        """Lists uploaded video assets with playback URLs and rendition metadata."""
        videos = await video_repository.list_videos(db, limit=limit, offset=offset)
        result = []
        for v in videos:
            is_ready = (v.status or "").upper() == "READY"
            master_url = build_master_playlist_url(v.id) if is_ready else None
            renditions_list = getattr(v, "renditions", []) or []
            res = VideoResponse(
                id=v.id,
                original_filename=v.original_filename,
                content_type=v.content_type,
                file_size_bytes=v.file_size_bytes,
                status=v.status,
                s3_key=v.s3_key,
                created_at=v.created_at,
                uploaded_at=v.uploaded_at,
                source_width=v.source_width,
                source_height=v.source_height,
                duration_seconds=v.duration_seconds,
                source_frame_rate=v.source_frame_rate,
                playback_url=master_url,
                master_playlist_url=master_url,
                thumbnail_url=build_thumbnail_url(v.id, v.thumbnail_version),
                thumbnail_version=v.thumbnail_version,
                renditions=renditions_list,
            )
            result.append(res)
        return result

    async def get_video_detail(
        self, db: AsyncSession, video_id: uuid.UUID
    ) -> VideoDetailResponse:
        """Returns video details with CloudFront/presigned playback URLs and renditions."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        # Generate temporary presigned GET URL for viewing original asset
        presigned_get_url = s3_service.generate_presigned_get_url(
            s3_key=video.s3_key,
            expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
            response_filename=video.original_filename,
        )

        is_ready = (video.status or "").upper() == "READY"
        master_url = build_master_playlist_url(video.id) if is_ready else None
        playback_url = master_url if is_ready else presigned_get_url
        renditions_list = getattr(video, "renditions", []) or []

        return VideoDetailResponse(
            id=video.id,
            original_filename=video.original_filename,
            content_type=video.content_type,
            file_size_bytes=video.file_size_bytes,
            status=video.status,
            s3_key=video.s3_key,
            original_url=presigned_get_url,
            playback_url=playback_url,
            master_playlist_url=master_url,
            thumbnail_url=build_thumbnail_url(video.id, video.thumbnail_version),
            thumbnail_version=video.thumbnail_version,
            created_at=video.created_at,
            uploaded_at=video.uploaded_at,
            source_width=video.source_width,
            source_height=video.source_height,
            duration_seconds=video.duration_seconds,
            source_frame_rate=video.source_frame_rate,
            renditions=renditions_list,
        )

    async def rename_video(
        self, db: AsyncSession, video_id: uuid.UUID, req: RenameVideoRequest
    ) -> RenameVideoResponse:
        """Renames the PostgreSQL display filename while preserving its extension and S3 key."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        _, extension = os.path.splitext(video.original_filename)
        renamed_filename = f"{req.name}{extension}"
        if len(renamed_filename) > 255:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Video name is too long. Maximum length is {255 - len(extension)} characters before the extension.",
            )

        if renamed_filename != video.original_filename:
            video = await video_repository.update_filename(
                db=db,
                video=video,
                filename=renamed_filename,
            )

        return RenameVideoResponse(
            id=video.id,
            original_filename=video.original_filename,
        )

    async def delete_video(self, db: AsyncSession, video_id: uuid.UUID) -> None:
        """Deletes original S3 object and cascades DB records cleanly."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        # Delete S3 Object
        s3_deleted = s3_service.delete_object(video.s3_key)
        if not s3_deleted:
            # Log warning but continue DB cascade cleanup so records don't get stuck
            print(f"Warning: S3 deletion returned false for key {video.s3_key}")

        # Delete DB records (cascades renditions, chunks, events)
        await video_repository.delete_video(db, video)


video_service = VideoService()
