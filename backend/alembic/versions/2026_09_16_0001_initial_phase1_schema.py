"""initial phase 1 schema

Revision ID: 2026_09_16_0001
Revises: 
Create Date: 2026-09-16 19:16:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2026_09_16_0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create videos table
    op.create_table(
        'videos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('s3_bucket', sa.String(length=255), nullable=False),
        sa.Column('s3_key', sa.String(length=512), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('source_width', sa.Integer(), nullable=True),
        sa.Column('source_height', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('failed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_videos_s3_key'), 'videos', ['s3_key'], unique=True)
    op.create_index(op.f('ix_videos_status'), 'videos', ['status'], unique=False)

    # 2. Create renditions table
    op.create_table(
        'renditions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('video_id', sa.UUID(), nullable=False),
        sa.Column('resolution', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('s3_prefix', sa.String(length=512), nullable=True),
        sa.Column('playlist_s3_key', sa.String(length=512), nullable=True),
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_time_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('video_id', 'resolution', name='uq_video_id_resolution')
    )
    op.create_index(op.f('ix_renditions_status'), 'renditions', ['status'], unique=False)
    op.create_index(op.f('ix_renditions_video_id'), 'renditions', ['video_id'], unique=False)

    # 3. Create chunks table
    op.create_table(
        'chunks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('rendition_id', sa.UUID(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('start_seconds', sa.Float(), nullable=False),
        sa.Column('end_seconds', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('attempt_count', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.String(length=100), nullable=True),
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_time_seconds', sa.Float(), nullable=True),
        sa.Column('temporary_s3_prefix', sa.String(length=512), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['rendition_id'], ['renditions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rendition_id', 'chunk_index', name='uq_rendition_id_chunk_index')
    )
    op.create_index(op.f('ix_chunks_rendition_id'), 'chunks', ['rendition_id'], unique=False)
    op.create_index(op.f('ix_chunks_status'), 'chunks', ['status'], unique=False)

    # 4. Create video_events table
    op.create_table(
        'video_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('video_id', sa.UUID(), nullable=False),
        sa.Column('rendition_id', sa.UUID(), nullable=True),
        sa.Column('chunk_id', sa.UUID(), nullable=True),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('event_metadata', postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), 'sqlite'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['chunk_id'], ['chunks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['rendition_id'], ['renditions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_video_events_event_type'), 'video_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_video_events_video_id'), 'video_events', ['video_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_video_events_video_id'), table_name='video_events')
    op.drop_index(op.f('ix_video_events_event_type'), table_name='video_events')
    op.drop_table('video_events')

    op.drop_index(op.f('ix_chunks_status'), table_name='chunks')
    op.drop_index(op.f('ix_chunks_rendition_id'), table_name='chunks')
    op.drop_table('chunks')

    op.drop_index(op.f('ix_renditions_video_id'), table_name='renditions')
    op.drop_index(op.f('ix_renditions_status'), table_name='renditions')
    op.drop_table('renditions')

    op.drop_index(op.f('ix_videos_status'), table_name='videos')
    op.drop_index(op.f('ix_videos_s3_key'), table_name='videos')
    op.drop_table('videos')
