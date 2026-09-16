import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, BigInteger, Integer, Float, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.rendition import Rendition
    from app.models.video_event import VideoEvent


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(
        String(512), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="PENDING_UPLOAD", index=True
    )

    source_width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    uploaded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    renditions: Mapped[List["Rendition"]] = relationship(
        "Rendition", back_populates="video", cascade="all, delete-orphan"
    )
    events: Mapped[List["VideoEvent"]] = relationship(
        "VideoEvent", back_populates="video", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Video(id={self.id}, filename='{self.original_filename}', status='{self.status}')>"
