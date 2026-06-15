"""
backend/app/migrations/add_demo_data_flag.py

Revision ID : e5f6a7b8c9d0
Revises     : d4e5f6a7b8c9   ← variance engine migration
Create Date : 2026-06-13

Adds is_demo_data = Boolean NOT NULL DEFAULT 0 to all major tables.
Existing rows safely default to False (not demo data).
"""

from alembic import op
import sqlalchemy as sa

revision      = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on    = None

# Tables that need the flag + optional index name
TARGETS = [
    ("projects",                       "ix_projects_demo"),
    ("reconciliation_profiles",        "ix_recon_profiles_demo"),
    ("reconciliation_balances",        "ix_recon_balances_demo"),
    ("exception_queue_records",        "ix_exception_queue_demo"),
    ("certification_workflows",        "ix_cert_workflows_demo"),
    ("certification_workflow_history", None),          # history table — no index needed
    ("ui_notifications",               "ix_ui_notif_demo"),
    ("variance_snapshots",             None),
    ("supporting_items",               "ix_supporting_items_demo"),
]


def upgrade():
    for table, idx_name in TARGETS:
        try:
            op.add_column(
                table,
                sa.Column(
                    "is_demo_data",
                    sa.Boolean(),
                    nullable=False,
                    server_default="0",   # SQLite + MySQL both accept "0" for FALSE
                ),
            )
            if idx_name:
                op.create_index(idx_name, table, ["is_demo_data"])
        except Exception as e:
            # Column may already exist on some deployments — skip gracefully
            print(f"[demo_flag migration] Skipping {table}: {e}")


def downgrade():
    for table, idx_name in TARGETS:
        try:
            if idx_name:
                op.drop_index(idx_name, table_name=table)
            op.drop_column(table, "is_demo_data")
        except Exception as e:
            print(f"[demo_flag migration] Downgrade skip {table}: {e}")
