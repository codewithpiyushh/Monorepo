"""
backend/app/models/sla_monitoring_migration.py

Idempotent migration for the SLA Monitoring & Escalation Engine.
Follows the same migrate(engine) entrypoint convention as
supporting_items_migration.py and comment_threads_migration.py.

Uses SQLAlchemy's Table.create(bind=engine, checkfirst=True) for the two
new tables (portable across MySQL/SQLite), then applies the one-column
Close Calendar config extension via a guarded ALTER TABLE.
"""

from __future__ import annotations

import logging
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

log = logging.getLogger("drms.migrations.sla_monitoring")


def migrate(engine) -> None:
    """
    Call this once during app startup (main.py lifespan), after
    close_calendar_migration.migrate(engine).
    """
    from ..models.models import SLAPolicy, SLAViolation

    SLAPolicy.__table__.create(bind=engine, checkfirst=True)
    SLAViolation.__table__.create(bind=engine, checkfirst=True)
    log.info("[sla_monitoring_migration] sla_policies / sla_violations ensured.")

    _add_close_period_threshold_column(engine)


def _add_close_period_threshold_column(engine) -> None:
    """
    Adds overdue_certification_threshold to close_periods if the table
    exists and the column is missing. Safe to call on every startup.
    """
    try:
        with engine.connect() as conn:
            dialect = engine.dialect.name

            if dialect == "sqlite":
                cols = conn.execute(text("PRAGMA table_info(close_periods)")).fetchall()
                existing = {c[1] for c in cols}
                if not existing:
                    return  # table doesn't exist yet
                if "overdue_certification_threshold" not in existing:
                    conn.execute(text(
                        "ALTER TABLE close_periods "
                        "ADD COLUMN overdue_certification_threshold INTEGER NOT NULL DEFAULT 5"
                    ))
                    conn.commit()
                    log.info("[sla_monitoring_migration] Added overdue_certification_threshold (sqlite).")

            else:  # mysql / mariadb
                exists_table = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.tables "
                    "WHERE table_schema = DATABASE() AND table_name = 'close_periods'"
                )).scalar()
                if not exists_table:
                    return
                exists_col = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() AND table_name = 'close_periods' "
                    "AND column_name = 'overdue_certification_threshold'"
                )).scalar()
                if not exists_col:
                    conn.execute(text(
                        "ALTER TABLE close_periods "
                        "ADD COLUMN overdue_certification_threshold INT NOT NULL DEFAULT 5"
                    ))
                    conn.commit()
                    log.info("[sla_monitoring_migration] Added overdue_certification_threshold (mysql).")

    except (OperationalError, ProgrammingError) as e:
        log.warning(f"[sla_monitoring_migration] threshold column patch skipped (non-fatal): {e}")
