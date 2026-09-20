import uuid
from typing import List
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.video import (
    CreateVideoRequest,
    CreateVideoResponse,
    CompleteUploadResponse,
    RenameVideoRequest,
    RenameVideoResponse,
    CreateThumbnailUploadRequest,
    CreateThumbnailUploadResponse,
    CompleteThumbnailUploadResponse,
    VideoResponse,
    VideoDetailResponse,
)
from app.services.video_service import video_service
from app.services.thumbnail_service import thumbnail_service
from typing import Optional

router = APIRouter(prefix="/api/videos", tags=["Videos"])


@router.post(
    "",
    response_model=CreateVideoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate Video Asset Upload",
    description="Registers video metadata, returns a short-lived S3 presigned PUT URL for direct browser upload.",
)
async def create_video(
    req: CreateVideoRequest, db: AsyncSession = Depends(get_db)
) -> CreateVideoResponse:
    return await video_service.create_video(db, req)


@router.post(
    "/{video_id}/complete",
    response_model=CompleteUploadResponse,
    summary="Verify & Finalize Direct S3 Upload",
    description="Validates object existence in S3 using HeadObject and transitions status to UPLOADED.",
)
async def complete_upload(
    video_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> CompleteUploadResponse:
    return await video_service.complete_upload(db, video_id)


@router.post(
    "/{video_id}/cancel",
    status_code=status.HTTP_200_OK,
    summary="Cancel Video Asset Processing",
    description="Cancel ongoing processing for a video.",
)
async def cancel_video_processing(
    video_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    current_status = await video_service.cancel_video_processing(db, video_id)
    return {
        "message": "Video processing cancellation requested successfully.",
        "status": current_status,
    }


@router.post(
    "/{video_id}/resume",
    status_code=status.HTTP_200_OK,
    summary="Resume Cancelled Video Processing",
    description="Resumes only unfinished work for a fully cancelled video.",
)
async def resume_video_processing(
    video_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    result = await video_service.resume_video_processing(db, video_id)
    return {
        "message": "Video processing resumed successfully.",
        **result,
    }


@router.get(
    "",
    response_model=List[VideoResponse],
    summary="List Video Assets",
    description="Returns a bounded page of video assets in reverse chronological order.",
)
async def list_videos(
    response: Response,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> List[VideoResponse]:
    videos = await video_service.list_videos(db, limit=limit + 1, offset=offset, search=search)
    page = videos[:limit]
    response.headers["X-Has-More"] = str(len(videos) > limit).lower()
    response.headers["X-Next-Offset"] = str(offset + len(page))
    return page


@router.get(
    "/{video_id}",
    response_model=VideoDetailResponse,
    summary="Get Video Asset Details",
    description="Returns video asset metadata with a short-lived presigned GET URL for playback/viewing.",
)
async def get_video(
    video_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> VideoDetailResponse:
    return await video_service.get_video_detail(db, video_id)


@router.patch(
    "/{video_id}/name",
    response_model=RenameVideoResponse,
    summary="Rename Video Asset",
    description="Updates only the PostgreSQL filename while preserving the original file extension and S3 object key.",
)
async def rename_video(
    video_id: uuid.UUID,
    req: RenameVideoRequest,
    db: AsyncSession = Depends(get_db),
) -> RenameVideoResponse:
    return await video_service.rename_video(db, video_id, req)


@router.post(
    "/{video_id}/thumbnail/upload",
    response_model=CreateThumbnailUploadResponse,
    summary="Initiate Custom Thumbnail Upload",
    description="Returns a presigned S3 PUT URL for a bounded JPEG, PNG, or WebP upload.",
)
async def create_thumbnail_upload(
    video_id: uuid.UUID,
    req: CreateThumbnailUploadRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateThumbnailUploadResponse:
    return await thumbnail_service.create_custom_upload(db, video_id, req)


@router.post(
    "/{video_id}/thumbnail/complete",
    response_model=CompleteThumbnailUploadResponse,
    summary="Verify and Apply Custom Thumbnail",
    description="Verifies the direct S3 upload, normalizes it to WebP, and replaces the final thumbnail.",
)
async def complete_thumbnail_upload(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CompleteThumbnailUploadResponse:
    return await thumbnail_service.complete_custom_upload(db, video_id)


@router.delete(
    "/{video_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Video Asset",
    description="Deletes every S3 object under the video's prefix and removes its video, rendition, chunk, event, and outbox records.",
)
async def delete_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await video_service.delete_video(db, video_id)
    return None
