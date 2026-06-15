"""
backend/app/migrations/add_aging_tables.py

Revision ID : c3d4e5f6a7b8
Revises     : b2c3d4e5f6a7   ← balance reconciliation migration
Create Date : 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision      = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on    = None


def upgrade():
    # ── exception_aging_snapshots ─────────────────────────────────────────
    op.create_table(
        "exception_aging_snapshots",
        sa.Column("id",                  sa.Integer(),    primary_key=True),
        sa.Column("exception_id",        sa.Integer(),    sa.ForeignKey("exception_queue_records.id"), nullable=False),
        sa.Column("profile_id",          sa.Integer(),    nullable=True),
        sa.Column("snapshot_period",     sa.String(8),    nullable=False),
        sa.Column("age_days",            sa.Integer(),    nullable=False),
        sa.Column("bucket",              sa.String(10),   nullable=False),
        sa.Column("exception_amount",    sa.Float(),      nullable=True),
        sa.Column("status",              sa.String(30),   nullable=True),
        sa.Column("risk_classification", sa.String(20),   nullable=True),
        sa.Column("created_at",          sa.DateTime(),   server_default=sa.func.now()),
    )
    op.create_index("ix_aging_snapshot_exception", "exception_aging_snapshots", ["exception_id"])
    op.create_index("ix_aging_snapshot_period",    "exception_aging_snapshots", ["snapshot_period"])
    op.create_index("ix_aging_snapshot_bucket",    "exception_aging_snapshots", ["bucket"])
    op.create_index("ix_aging_snapshot_profile",   "exception_aging_snapshots", ["profile_id"])

    # ── exception_escalation_logs ─────────────────────────────────────────
    op.create_table(
        "exception_escalation_logs",
        sa.Column("id",                sa.Integer(),   primary_key=True),
        sa.Column("exception_id",      sa.Integer(),   sa.ForeignKey("exception_queue_records.id"), nullable=False),
        sa.Column("escalation_level",  sa.String(20),  nullable=False),
        sa.Column("age_days",          sa.Integer(),   nullable=False),
        sa.Column("notified_user_id",  sa.Integer(),   sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notified_role",     sa.String(30),  nullable=True),
        sa.Column("escalated_at",      sa.DateTime(),  server_default=sa.func.now()),
        sa.Column("notification_sent", sa.Boolean(),   server_default="0"),
    )
    op.create_index("ix_escalation_log_exception",    "exception_escalation_logs", ["exception_id"])
    op.create_index("ix_escalation_log_level",        "exception_escalation_logs", ["escalation_level"])
    op.create_index("ix_escalation_log_escalated_at", "exception_escalation_logs", ["escalated_at"])


def downgrade():
    op.drop_index("ix_escalation_log_escalated_at", table_name="exception_escalation_logs")
    op.drop_index("ix_escalation_log_level",        table_name="exception_escalation_logs")
    op.drop_index("ix_escalation_log_exception",    table_name="exception_escalation_logs")
    op.drop_table("exception_escalation_logs")

    op.drop_index("ix_aging_snapshot_profile",   table_name="exception_aging_snapshots")
    op.drop_index("ix_aging_snapshot_bucket",    table_name="exception_aging_snapshots")
    op.drop_index("ix_aging_snapshot_period",    table_name="exception_aging_snapshots")
    op.drop_index("ix_aging_snapshot_exception", table_name="exception_aging_snapshots")
    op.drop_table("exception_aging_snapshots")
