"""Persist the latest worker-reported chunk progress for SSE snapshots."""

from alembic import op
import sqlalchemy as sa


revision = "2026_09_19_0002"
down_revision = "2405d7b24395"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chunks",
        sa.Column(
            "progress_percent",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
    )
    # Normalize legacy terminal values to the single video/rendition terminal
    # status used by the finalizer and SSE contract.
    op.execute("UPDATE videos SET status = 'READY' WHERE status = 'COMPLETED'")
    op.execute("UPDATE renditions SET status = 'READY' WHERE status = 'COMPLETED'")


def downgrade() -> None:
    op.drop_column("chunks", "progress_percent")
