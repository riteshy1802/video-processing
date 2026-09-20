"""Add ownership lease expiry to transcode chunks."""

from alembic import op
import sqlalchemy as sa


revision = "2026_09_20_0005"
down_revision = "2026_09_19_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chunks",
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_chunks_lease_expires_at"),
        "chunks",
        ["lease_expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_chunks_lease_expires_at"), table_name="chunks")
    op.drop_column("chunks", "lease_expires_at")
