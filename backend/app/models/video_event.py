import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.video import Video

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class VideoEvent(Base):
    __tablename__ = "video_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rendition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("renditions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    chunk_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Use JSONB on PostgreSQL fallback to standard JSON
    event_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"), nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    # Relationships
    video: Mapped["Video"] = relationship("Video", back_populates="events")

    def __repr__(self) -> str:
        return f"<VideoEvent(id={self.id}, video_id={self.video_id}, type='{self.event_type}')>"
