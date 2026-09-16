import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.video import (
    CreateVideoRequest,
    CreateVideoResponse,
    CompleteUploadResponse,
    VideoResponse,
    VideoDetailResponse,
)
from app.services.video_service import video_service

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


@router.get(
    "",
    response_model=List[VideoResponse],
    summary="List Video Assets",
    description="Returns all uploaded video assets in reverse chronological order.",
)
async def list_videos(db: AsyncSession = Depends(get_db)) -> List[VideoResponse]:
    return await video_service.list_videos(db)


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


@router.delete(
    "/{video_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Video Asset",
    description="Deletes the original S3 object and removes database records and linked cascades.",
)
async def delete_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await video_service.delete_video(db, video_id)
    return None
