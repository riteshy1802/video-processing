import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator


class CreateVideoRequest(BaseModel):
    filename: str = Field(
        ..., min_length=1, description="Original filename of the video asset"
    )
    content_type: str = Field(
        ..., description="Video MIME content-type, e.g. video/mp4"
    )
    file_size_bytes: int = Field(..., gt=0, description="Video file size in bytes")
    source_width: Optional[int] = Field(
        default=None, description="Source video width in pixels"
    )
    source_height: Optional[int] = Field(
        default=None, description="Source video height in pixels"
    )
    duration_seconds: Optional[float] = Field(
        default=None, description="Source video duration in seconds"
    )


class CreateVideoResponse(BaseModel):
    video_id: uuid.UUID
    upload_url: str
    s3_key: str
    expires_in: int


class CompleteUploadResponse(BaseModel):
    video_id: uuid.UUID
    status: str
    uploaded_at: datetime


class RenameVideoRequest(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="New display filename without the file extension",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Video name cannot be empty")
        if any(character in value for character in ("/", "\\", "\x00")):
            raise ValueError("Video name cannot contain path separators")
        if any(ord(character) < 32 for character in value):
            raise ValueError("Video name cannot contain control characters")
        return value


class RenameVideoResponse(BaseModel):
    id: uuid.UUID
    original_filename: str


class CreateThumbnailUploadRequest(BaseModel):
    content_type: str = Field(..., description="JPEG, PNG, or WebP MIME type")
    file_size_bytes: int = Field(..., gt=0)


class CreateThumbnailUploadResponse(BaseModel):
    upload_url: str
    expires_in: int


class CompleteThumbnailUploadResponse(BaseModel):
    thumbnail_url: str
    thumbnail_version: int


class RenditionResponse(BaseModel):
    id: uuid.UUID
    resolution: int
    status: str
    s3_prefix: Optional[str] = None
    playlist_s3_key: Optional[str] = None
    processing_time_seconds: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class VideoResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    file_size_bytes: int
    status: str
    s3_key: str
    created_at: datetime
    uploaded_at: Optional[datetime] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    duration_seconds: Optional[float] = None
    source_frame_rate: Optional[float] = None
    playback_url: Optional[str] = None
    master_playlist_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_version: int = 0
    error_message: Optional[str] = None
    renditions: List[RenditionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class VideoDetailResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    file_size_bytes: int
    status: str
    s3_key: str
    original_url: str
    playback_url: Optional[str] = None
    master_playlist_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_version: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    uploaded_at: Optional[datetime] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    duration_seconds: Optional[float] = None
    source_frame_rate: Optional[float] = None
    renditions: List[RenditionResponse] = []

    model_config = ConfigDict(from_attributes=True)
