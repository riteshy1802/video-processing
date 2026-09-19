"""Persist the latest structured FFmpeg progress for each chunk."""

from alembic import op
import sqlalchemy as sa


revision = "2026_09_19_0003"
down_revision = "2026_09_19_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("source_frame_rate", sa.Float(), nullable=True),
    )
    op.add_column(
        "chunks",
        sa.Column("ffmpeg_progress", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chunks", "ffmpeg_progress")
    op.drop_column("videos", "source_frame_rate")
