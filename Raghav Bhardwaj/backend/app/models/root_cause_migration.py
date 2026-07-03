"""
Root Cause Taxonomy Migration
Adds structured root_cause, severity, carry_forward, and reopened_count
columns to exception_queue_records.

Run via app startup lifespan (called in main.py).
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _col_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'"
    )).scalar()
    return int(row or 0) > 0


def _index_exists(conn, index_name: str, table: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND INDEX_NAME = '{index_name}'"
    )).scalar()
    return int(row or 0) > 0


def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            t = "exception_queue_records"

            # 1. root_cause — full taxonomy (replaces coarse classification)
            if not _col_exists(conn, t, "root_cause"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN root_cause VARCHAR(60) NULL"
                ))
                logger.info("[rc_migration] Added root_cause column")

            # 2. root_cause_detail — free-text explanation of root cause
            if not _col_exists(conn, t, "root_cause_detail"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN root_cause_detail TEXT NULL"
                ))
                logger.info("[rc_migration] Added root_cause_detail column")

            # 3. severity — CRITICAL / HIGH / MEDIUM / LOW
            if not _col_exists(conn, t, "severity"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN severity VARCHAR(20) NULL DEFAULT 'MEDIUM'"
                ))
                logger.info("[rc_migration] Added severity column")

            # 4. carry_forward_period — e.g. '2026-05' when the exception rolled from prior period
            if not _col_exists(conn, t, "carry_forward_period"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN carry_forward_period VARCHAR(10) NULL"
                ))
                logger.info("[rc_migration] Added carry_forward_period column")

            # 5. reopened_count — how many times this exception was reopened
            if not _col_exists(conn, t, "reopened_count"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN reopened_count INT NOT NULL DEFAULT 0"
                ))
                logger.info("[rc_migration] Added reopened_count column")

            # 6. resolved_by — who resolved it
            if not _col_exists(conn, t, "resolved_by"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN resolved_by INT NULL"
                ))
                logger.info("[rc_migration] Added resolved_by column")

            # 7. assigned_at — timestamp when assigned
            if not _col_exists(conn, t, "assigned_at"):
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN assigned_at DATETIME NULL"
                ))
                logger.info("[rc_migration] Added assigned_at column")

            # Indexes
            if not _index_exists(conn, "ix_exc_root_cause", t):
                conn.execute(text(f"CREATE INDEX ix_exc_root_cause ON {t} (root_cause)"))
            if not _index_exists(conn, "ix_exc_severity", t):
                conn.execute(text(f"CREATE INDEX ix_exc_severity ON {t} (severity)"))
            if not _index_exists(conn, "ix_exc_carry_forward", t):
                conn.execute(text(f"CREATE INDEX ix_exc_carry_forward ON {t} (carry_forward_period)"))

            logger.info("[rc_migration] Root cause taxonomy migration complete")

        except Exception as e:
            logger.error(f"[rc_migration] Failed: {e}")
            raise
