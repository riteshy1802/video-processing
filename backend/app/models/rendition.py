import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.video import Video
    from app.models.chunk import Chunk

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Rendition(Base):
    __tablename__ = "renditions"
    __table_args__ = (
        UniqueConstraint("video_id", "resolution", name="uq_video_id_resolution"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resolution: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="PENDING", index=True
    )
    s3_prefix: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    playlist_s3_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_time_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    # Relationships
    video: Mapped["Video"] = relationship("Video", back_populates="renditions")
    chunks: Mapped[List["Chunk"]] = relationship(
        "Chunk", back_populates="rendition", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Rendition(id={self.id}, video_id={self.video_id}, resolution={self.resolution}p, status='{self.status}')>"
