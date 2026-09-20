import asyncio
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
from app.repositories.chunk_repository import chunk_repository
from app.repositories.rendition_repository import rendition_repository
from app.repositories.outbox_repository import outbox_repository
from app.services.outbox_service import (
    enqueue_planner_job,
    enqueue_rendition_finalizer_job,
    enqueue_transcode_job,
    enqueue_video_finalizer_job,
)
from app.services.redis_publisher import (
    publish_event_async,
    publish_video_cancel,
)
from app.services.cancellation_service import settle_video_cancellation

logger = logging.getLogger("video_service")

AVI_CONTENT_TYPES = {
    "video/avi",
    "video/x-msvideo",
    "video/msvideo",
    "application/x-troff-msvideo",
}


def _is_avi(filename: str, content_type: str) -> bool:
    normalized_type = content_type.partition(";")[0].strip().lower()
    return filename.strip().lower().endswith(".avi") or normalized_type in AVI_CONTENT_TYPES


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
        normalized_content_type = req.content_type.partition(";")[0].strip().lower()
        allowed_content_types = {
            content_type.lower() for content_type in settings.ALLOWED_CONTENT_TYPES
        }
        if (
            _is_avi(req.filename, normalized_content_type)
            or normalized_content_type not in allowed_content_types
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unsupported content type or video format for '{req.filename}' "
                    f"({req.content_type}). Allowed formats are MP4, MOV, MKV, WebM, M4V, and MPEG."
                ),
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
        """Verify S3, mark the upload complete, and queue planning atomically."""
        video = await video_repository.get_by_id_for_update(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        now = datetime.now(timezone.utc)
        if video.status != "PENDING_UPLOAD":
            # Repeated completion calls must never move an active/terminal
            # pipeline backwards. UPLOADED can safely reassert a missing
            # planner outbox record; later states already consumed that work.
            if video.status == "UPLOADED":
                await enqueue_planner_job(db, video.id)
                await db.commit()
            else:
                await db.rollback()
            return CompleteUploadResponse(
                video_id=video.id,
                status=video.status,
                uploaded_at=video.uploaded_at or now,
            )

        # Perform S3 HeadObject verification - NEVER trust the frontend blindly
        s3_meta = s3_service.verify_object_exists(video.s3_key)
        if not s3_meta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="S3 verification failed: Video file object was not found in S3 bucket. Upload may have failed or been aborted.",
            )

        uploaded_content_type = str(s3_meta.get("content_type") or video.content_type)
        normalized_uploaded_type = uploaded_content_type.partition(";")[0].strip().lower()
        allowed_content_types = {
            content_type.lower() for content_type in settings.ALLOWED_CONTENT_TYPES
        }
        if (
            _is_avi(video.original_filename, normalized_uploaded_type)
            or normalized_uploaded_type not in allowed_content_types
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded object has unsupported video content type '{uploaded_content_type}'.",
            )

        updated_video = await video_repository.update_status(
            db=db,
            video=video,
            status="UPLOADED",
            uploaded_at=now,
            processing_started_at=now,
            commit=False,
        )

        # Audit event
        await video_repository.log_event(
            db=db,
            video_id=updated_video.id,
            event_type="UPLOAD_COMPLETED",
            message=f"Direct S3 upload verified successfully. Size: {s3_meta.get('content_length')} bytes.",
            event_metadata=s3_meta,
            commit=False,
        )
        await enqueue_planner_job(db, updated_video.id)
        await video_repository.log_event(
            db=db,
            video_id=updated_video.id,
            event_type="PLANNING_JOB_QUEUED",
            message=(
                f"Queued planning job transactionally for Kafka topic "
                f"'{settings.KAFKA_PLANNER_TOPIC}'."
            ),
            commit=False,
        )
        await db.commit()

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
        search: Optional[str] = None,
    ) -> List[VideoResponse]:
        """Lists uploaded video assets with playback URLs and rendition metadata."""
        videos = await video_repository.list_videos(db, limit=limit, offset=offset, search=search)
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
                error_message=v.error_message,
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
            error_message=video.error_message,
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
        """Delete all S3 assets and all durable records belonging to a video."""
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        # Release the read transaction before the potentially slow S3 operation.
        # All source, thumbnail, chunk, rendition and playlist objects use this
        # deterministic prefix.
        await db.rollback()
        video_prefix = f"videos/{video_id}"
        try:
            await asyncio.to_thread(s3_service.delete_prefix, video_prefix)
        except Exception as exc:
            logger.exception(
                "Refusing to delete database records after S3 cleanup failed for video %s",
                video_id,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not remove all stored video files. The video record was preserved so deletion can be retried.",
            ) from exc

        # Re-read after S3 I/O. A duplicate delete is successful once another
        # request has already removed the durable record.
        video = await video_repository.get_by_id(db, video_id)
        if not video:
            await db.rollback()
            return

        # Outbox records have no FK to videos. Remove them explicitly before the
        # video delete cascades through renditions, chunks and video events.
        await outbox_repository.delete_for_video(db, video_id)
        await video_repository.delete_video(db, video)

    async def cancel_video_processing(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> str:
        current_status = await video_repository.get_status_for_update(db, video_id)
        if current_status is None:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        if current_status == "CANCELLED":
            await db.rollback()
            return current_status

        if current_status == "CANCELLING":
            await db.rollback()
            return (await settle_video_cancellation(db, video_id)).status

        if current_status not in {"UPLOADED", "PROCESSING", "FINALIZING"}:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Video processing cannot be cancelled from status {current_status}.",
            )

        await video_repository.mark_cancelling(db, video_id)
        await chunk_repository.cancel_pending_chunks(db, video_id)
        await rendition_repository.mark_unfinished_as_cancelling(db, video_id)

        await db.commit()

        # Broadcast immediately after the durable intent is committed. This
        # also interrupts an active planner/FFprobe when no chunks exist yet.
        await publish_event_async(
            video_id,
            {
                "type": "video.cancelling",
                "video_id": str(video_id),
                "status": "CANCELLING",
                "message": "Stopping video processing...",
            },
        )
        published = await publish_video_cancel(video_id)
        if not published:
            logger.warning(
                "Failed to publish cancellation signal for video=%s; "
                "durable PostgreSQL guards remain active.",
                video_id,
            )

        settlement = await settle_video_cancellation(db, video_id)
        if settlement.status != "CANCELLING":
            return settlement.status
        return "CANCELLING"

    async def resume_video_processing(
        self,
        db: AsyncSession,
        video_id: uuid.UUID,
    ) -> dict:
        current_status = await video_repository.get_status_for_update(db, video_id)
        if current_status is None:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video asset with ID '{video_id}' not found.",
            )

        # A duplicate request after a graph-based resume is already active.
        if current_status == "PROCESSING":
            await db.rollback()
            return {"status": "PROCESSING", "resumed": False, "chunk_ids": []}

        # A duplicate pre-planning resume has already performed the only
        # allowed CANCELLED -> UPLOADED transition. Do not enqueue it twice.
        if current_status == "UPLOADED":
            await db.rollback()
            return {"status": "UPLOADED", "resumed": False, "chunk_ids": []}

        if current_status != "CANCELLED":
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Video processing cannot be resumed from status {current_status}.",
            )

        renditions = await rendition_repository.get_by_video_id(db, video_id)
        planner_required = not renditions
        chunk_ids: list[uuid.UUID] = []
        rendition_finalize_ids: list[uuid.UUID] = []
        video_finalize_required = False
        resumed = True

        if planner_required:
            resumed = await video_repository.resume_cancelled_for_planning(db, video_id)
            if resumed:
                await enqueue_planner_job(db, video_id)
            await db.commit()
        else:
            unfinished_ids = [
                rendition.id for rendition in renditions if rendition.status != "READY"
            ]

            # Preserve DONE chunks. Only CANCELLED chunks are reset, while any
            # already-PENDING resumable chunks join the same transcode frontier.
            await chunk_repository.resume_cancelled_chunks(db, unfinished_ids)
            invalid_rendition_ids: list[uuid.UUID] = []
            for rendition_id in unfinished_ids:
                pending_ids = await chunk_repository.get_pending_ids_for_renditions(
                    db, [rendition_id]
                )
                if pending_ids:
                    chunk_ids.extend(pending_ids)
                elif await chunk_repository.are_all_chunks_completed(db, rendition_id):
                    rendition_finalize_ids.append(rendition_id)
                else:
                    invalid_rendition_ids.append(rendition_id)

            if invalid_rendition_ids:
                await db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Cancelled video contains non-resumable incomplete rendition "
                        f"state for: {', '.join(str(item) for item in invalid_rendition_ids)}"
                    ),
                )

            await rendition_repository.resume_cancelled(db, video_id)
            resumed = await video_repository.resume_cancelled(db, video_id)
            video_finalize_required = not unfinished_ids
            if resumed:
                for chunk_id in chunk_ids:
                    await enqueue_transcode_job(db, chunk_id)
                for rendition_id in rendition_finalize_ids:
                    await enqueue_rendition_finalizer_job(db, rendition_id)
                if video_finalize_required:
                    await enqueue_video_finalizer_job(db, video_id)
            await db.commit()

        resume_stage = (
            "PLANNER"
            if planner_required
            else "VIDEO_FINALIZER"
            if video_finalize_required
            else "MIXED"
            if chunk_ids and rendition_finalize_ids
            else "TRANSCODE"
            if chunk_ids
            else "RENDITION_FINALIZER"
        )

        if not resumed:
            return {
                "status": "UPLOADED" if planner_required else "PROCESSING",
                "resumed": False,
                "chunk_ids": [],
            }

        await publish_event_async(
            video_id,
            {
                "type": "video.resumed",
                "video_id": str(video_id),
                "status": "UPLOADED" if planner_required else "PROCESSING",
                "resume_stage": resume_stage,
                "resumed_chunk_ids": [str(chunk_id) for chunk_id in chunk_ids],
                "resumed_rendition_ids": [
                    str(rendition_id) for rendition_id in rendition_finalize_ids
                ],
                "message": "Video processing resumed",
            },
        )
        return {
            "status": "UPLOADED" if planner_required else "PROCESSING",
            "resumed": resumed,
            "chunk_ids": [str(chunk_id) for chunk_id in chunk_ids],
            "rendition_ids": [
                str(rendition_id) for rendition_id in rendition_finalize_ids
            ],
            "resume_stage": resume_stage,
        }


video_service = VideoService()
