"""add risk_score and risk_scored_at to reconciliation_profiles

Revision ID: a1b2c3d4e5f6
Revises: (set this to your latest revision id)
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = None   # ← replace with your current head revision id
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'reconciliation_profiles',
        sa.Column('risk_score', sa.Float(), nullable=True, server_default=None),
    )
    op.add_column(
        'reconciliation_profiles',
        sa.Column('risk_scored_at', sa.DateTime(), nullable=True),
    )
    # Index so the dashboard stale-check query (ORDER BY risk_score DESC) is fast
    op.create_index(
        'ix_reconciliation_profiles_risk_score',
        'reconciliation_profiles',
        ['risk_score'],
    )


def downgrade():
    op.drop_index('ix_reconciliation_profiles_risk_score', table_name='reconciliation_profiles')
    op.drop_column('reconciliation_profiles', 'risk_scored_at')
    op.drop_column('reconciliation_profiles', 'risk_score')
