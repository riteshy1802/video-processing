"""Add minimal durable thumbnail state to videos."""

from alembic import op
import sqlalchemy as sa


revision = "2026_09_19_0004"
down_revision = "2026_09_19_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column(
            "thumbnail_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "videos",
        sa.Column("thumbnail_source", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("videos", "thumbnail_source")
    op.drop_column("videos", "thumbnail_version")
