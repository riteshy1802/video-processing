import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class CreateVideoRequest(BaseModel):
    filename: str = Field(..., min_length=1, description="Original filename of the video asset")
    content_type: str = Field(..., description="Video MIME content-type, e.g. video/mp4")
    file_size_bytes: int = Field(..., gt=0, description="Video file size in bytes")

class CreateVideoResponse(BaseModel):
    video_id: uuid.UUID
    upload_url: str
    s3_key: str
    expires_in: int

class CompleteUploadResponse(BaseModel):
    video_id: uuid.UUID
    status: str
    uploaded_at: datetime

class VideoResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    file_size_bytes: int
    status: str
    s3_key: str
    created_at: datetime
    uploaded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class VideoDetailResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    file_size_bytes: int
    status: str
    s3_key: str
    original_url: str
    created_at: datetime
    uploaded_at: Optional[datetime] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    duration_seconds: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
