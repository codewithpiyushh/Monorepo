"""
backend/app/migrations/add_reconciliation_balances.py

Alembic migration — adds reconciliation_balances and
reconciliation_balance_history tables.

Revision ID : b2c3d4e5f6a7
Revises     : a1b2c3d4e5f6   ← the risk_score migration
Create Date : 2026-06-10
"""

from alembic import op
import sqlalchemy as sa

revision    = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"   # chains after the risk_score migration
branch_labels = None
depends_on    = None


def upgrade():
    # ── reconciliation_balances ───────────────────────────────────────────
    op.create_table(
        "reconciliation_balances",
        sa.Column("id",                  sa.Integer(),     primary_key=True),
        sa.Column("profile_id",          sa.Integer(),     sa.ForeignKey("reconciliation_profiles.id"), nullable=False),
        sa.Column("period_key",          sa.String(30),    nullable=False),
        sa.Column("source_balance",      sa.Float(),       nullable=False, server_default="0"),
        sa.Column("target_balance",      sa.Float(),       nullable=False, server_default="0"),
        sa.Column("variance_amount",     sa.Float(),       nullable=True),
        sa.Column("variance_percentage", sa.Float(),       nullable=True),
        sa.Column("threshold_amount",    sa.Float(),       nullable=False, server_default="0"),
        sa.Column("materiality_limit",   sa.Float(),       nullable=False, server_default="0"),
        sa.Column("status",              sa.String(30),    nullable=False, server_default="DRAFT"),
        sa.Column("comments",            sa.Text(),        nullable=True),
        sa.Column("submitted_at",        sa.DateTime(),    nullable=True),
        sa.Column("reviewed_at",         sa.DateTime(),    nullable=True),
        sa.Column("approved_at",         sa.DateTime(),    nullable=True),
        sa.Column("certified_at",        sa.DateTime(),    nullable=True),
        sa.Column("preparer_id",         sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewer_id",         sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approver_id",         sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("certifier_id",        sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by",          sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by",          sa.Integer(),     sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at",          sa.DateTime(),    server_default=sa.func.now()),
        sa.Column("updated_at",          sa.DateTime(),    server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_index("ix_recon_balances_profile_period",  "reconciliation_balances", ["profile_id", "period_key"])
    op.create_index("ix_recon_balances_status",          "reconciliation_balances", ["status"])
    op.create_index("ix_recon_balances_created_at",      "reconciliation_balances", ["created_at"])
    op.create_index("uq_recon_balances_profile_period",  "reconciliation_balances", ["profile_id", "period_key"], unique=True)

    # ── reconciliation_balance_history ────────────────────────────────────
    op.create_table(
        "reconciliation_balance_history",
        sa.Column("id",              sa.Integer(),  primary_key=True),
        sa.Column("balance_id",      sa.Integer(),  sa.ForeignKey("reconciliation_balances.id"), nullable=False),
        sa.Column("actor_id",        sa.Integer(),  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_role",      sa.String(30), nullable=True),
        sa.Column("action",          sa.String(40), nullable=False),
        sa.Column("from_status",     sa.String(30), nullable=True),
        sa.Column("to_status",       sa.String(30), nullable=True),
        sa.Column("source_balance",  sa.Float(),    nullable=True),
        sa.Column("target_balance",  sa.Float(),    nullable=True),
        sa.Column("variance_amount", sa.Float(),    nullable=True),
        sa.Column("comments",        sa.Text(),     nullable=True),
        sa.Column("created_at",      sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index("ix_recon_balance_history_balance_id", "reconciliation_balance_history", ["balance_id"])


def downgrade():
    op.drop_index("ix_recon_balance_history_balance_id", table_name="reconciliation_balance_history")
    op.drop_table("reconciliation_balance_history")

    op.drop_index("uq_recon_balances_profile_period",  table_name="reconciliation_balances")
    op.drop_index("ix_recon_balances_created_at",      table_name="reconciliation_balances")
    op.drop_index("ix_recon_balances_status",          table_name="reconciliation_balances")
    op.drop_index("ix_recon_balances_profile_period",  table_name="reconciliation_balances")
    op.drop_table("reconciliation_balances")
