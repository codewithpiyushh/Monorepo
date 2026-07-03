"""
Phase 3 — Full Transaction Matching
Migration: adds columns to match_groups for workflow (confirm/reject/notes/manual).
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
    return int(row) > 0


def _index_exists(conn, index_name: str, table: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND INDEX_NAME = '{index_name}'"
    )).scalar()
    return int(row) > 0


def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            # ── match_groups extra workflow columns ────────────────────
            additions = [
                ("review_status",  "VARCHAR(30)  NULL DEFAULT 'PENDING'"),
                ("notes",          "TEXT         NULL"),
                ("confirmed_by",   "INTEGER      NULL"),
                ("confirmed_at",   "DATETIME     NULL"),
                ("rejected_by",    "INTEGER      NULL"),
                ("rejected_at",    "DATETIME     NULL"),
                ("rejected_reason","TEXT         NULL"),
                ("is_manual",      "TINYINT(1)   NOT NULL DEFAULT 0"),
                ("manual_by",      "INTEGER      NULL"),
                ("source_side",    "TEXT         NULL"),   # JSON: list of record IDs on GL side
                ("target_side",    "TEXT         NULL"),   # JSON: list of record IDs on Bank side
                ("updated_at",     "DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            ]
            for col, defn in additions:
                if not _col_exists(conn, "match_groups", col):
                    conn.execute(text(
                        f"ALTER TABLE match_groups ADD COLUMN {col} {defn}"
                    ))
                    logger.info(f"[matching_migration] Added match_groups.{col}")

            # Index on review_status for quick dashboard queries
            if not _index_exists(conn, "ix_mg_review_status", "match_groups"):
                conn.execute(text(
                    "CREATE INDEX ix_mg_review_status ON match_groups (review_status)"
                ))

            # ── match_group_items: add side flag (SOURCE / TARGET) ──
            if not _col_exists(conn, "match_group_items", "side"):
                conn.execute(text(
                    "ALTER TABLE match_group_items ADD COLUMN side VARCHAR(10) NULL"
                ))
                logger.info("[matching_migration] Added match_group_items.side")

            logger.info("[matching_migration] Done")
        except Exception as e:
            logger.error(f"[matching_migration] Failed: {e}")
            raise
