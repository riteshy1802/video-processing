import uuid
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
    VideoResponse,
    VideoDetailResponse,
)
from app.services.s3 import s3_service
from app.repositories.video_repository import video_repository

class VideoService:
    async def create_video(self, db: AsyncSession, req: CreateVideoRequest) -> CreateVideoResponse:
        """Validates payload, creates video record with PENDING_UPLOAD, and returns S3 presigned PUT URL."""
        # 1. Content type validation
        if not req.content_type.startswith("video/") and req.content_type not in settings.ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported content type '{req.content_type}'. Must be a valid video MIME type."
            )

        # 2. File size validation
        if req.file_size_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum allowed limit of {max_mb} MB."
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
            event_metadata={"filename": req.filename, "size": req.file_size_bytes, "content_type": req.content_type}
        )

        # 6. Generate presigned PUT URL for browser direct S3 upload
        upload_url = s3_service.generate_presigned_put_url(
            s3_key=s3_key,
            content_type=req.content_type,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS
        )

        return CreateVideoResponse(
            video_id=created_video.id,
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS
        )

    async def complete_upload(self, db: AsyncSession, video_id: uuid.UUID) -> CompleteUploadResponse:
        """Verifies S3 object existence via HeadObject and marks video as UPLOADED."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found."
            )

        # Perform S3 HeadObject verification - NEVER trust the frontend blindly
        s3_meta = s3_service.verify_object_exists(video.s3_key)
        if not s3_meta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="S3 verification failed: Video file object was not found in S3 bucket. Upload may have failed or been aborted."
            )

        now = datetime.now(timezone.utc)
        updated_video = await video_repository.update_status(
            db=db,
            video=video,
            status="UPLOADED",
            uploaded_at=now
        )

        # Audit event
        await video_repository.log_event(
            db=db,
            video_id=updated_video.id,
            event_type="UPLOAD_COMPLETED",
            message=f"Direct S3 upload verified successfully. Size: {s3_meta.get('content_length')} bytes.",
            event_metadata=s3_meta
        )

        return CompleteUploadResponse(
            video_id=updated_video.id,
            status=updated_video.status,
            uploaded_at=updated_video.uploaded_at or now
        )

    async def list_videos(self, db: AsyncSession) -> List[VideoResponse]:
        """Lists uploaded video assets."""
        videos = await video_repository.list_videos(db)
        return [VideoResponse.model_validate(v) for v in videos]

    async def get_video_detail(self, db: AsyncSession, video_id: uuid.UUID) -> VideoDetailResponse:
        """Returns video details with short-lived presigned GET URL for original video playback."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found."
            )

        # Generate temporary presigned GET URL for viewing original asset
        presigned_get_url = s3_service.generate_presigned_get_url(
            s3_key=video.s3_key,
            expires_in=settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
            response_filename=video.original_filename
        )

        return VideoDetailResponse(
            id=video.id,
            original_filename=video.original_filename,
            content_type=video.content_type,
            file_size_bytes=video.file_size_bytes,
            status=video.status,
            s3_key=video.s3_key,
            original_url=presigned_get_url,
            created_at=video.created_at,
            uploaded_at=video.uploaded_at,
            source_width=video.source_width,
            source_height=video.source_height,
            duration_seconds=video.duration_seconds
        )

    async def delete_video(self, db: AsyncSession, video_id: uuid.UUID) -> None:
        """Deletes original S3 object and cascades DB records cleanly."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found."
            )

        # Delete S3 Object
        s3_deleted = s3_service.delete_object(video.s3_key)
        if not s3_deleted:
            # Log warning but continue DB cascade cleanup so records don't get stuck
            print(f"Warning: S3 deletion returned false for key {video.s3_key}")

        # Delete DB records (cascades renditions, chunks, events)
        await video_repository.delete_video(db, video)

video_service = VideoService()
