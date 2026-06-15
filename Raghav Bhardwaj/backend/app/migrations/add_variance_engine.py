"""Add variance snapshot storage and explanation columns."""

from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "variance_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("reconciliation_profiles.id"), nullable=False),
        sa.Column("period_key", sa.String(length=30), nullable=False),
        sa.Column("raw_variance", sa.Float(), nullable=True),
        sa.Column("explained_variance", sa.Float(), nullable=True),
        sa.Column("unexplained_variance", sa.Float(), nullable=True),
        sa.Column("flux_amount", sa.Float(), nullable=True),
        sa.Column("flux_percentage", sa.Float(), nullable=True),
        sa.Column("risk_score_at_snapshot", sa.Float(), nullable=True),
        sa.Column("variance_classification", sa.String(length=30), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_variance_snapshot_profile", "variance_snapshots", ["profile_id"])
    op.create_index("ix_variance_snapshot_period", "variance_snapshots", ["period_key"])
    op.create_index("ix_variance_snapshot_profile_period", "variance_snapshots", ["profile_id", "period_key"])

    columns = [
        ("variance_severity_classification", sa.String(length=30)),
        ("root_cause_category", sa.String(length=40)),
        ("variance_explanation", sa.Text()),
        ("resolution_target_date", sa.Date()),
        ("resolution_status", sa.String(length=20)),
        ("explained_variance", sa.Float()),
        ("unexplained_variance", sa.Float()),
        ("flux_amount", sa.Float()),
        ("flux_percentage", sa.Float()),
    ]
    for name, coltype in columns:
        op.add_column("reconciliation_balances", sa.Column(name, coltype, nullable=True))


def downgrade():
    for name in [
        "variance_severity_classification",
        "root_cause_category",
        "variance_explanation",
        "resolution_target_date",
        "resolution_status",
        "explained_variance",
        "unexplained_variance",
        "flux_amount",
        "flux_percentage",
    ]:
        op.drop_column("reconciliation_balances", name)

    op.drop_index("ix_variance_snapshot_profile_period", table_name="variance_snapshots")
    op.drop_index("ix_variance_snapshot_period", table_name="variance_snapshots")
    op.drop_index("ix_variance_snapshot_profile", table_name="variance_snapshots")
    op.drop_table("variance_snapshots")
