"""
Phase 1 — Supporting Items Management
Migration: creates the `supporting_items` table
================================================
Run once:
    python -m app.models.supporting_items_migration
Or call migrate(engine) from startup after init_db().
"""
import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS supporting_items (
    id                          INTEGER       NOT NULL AUTO_INCREMENT,
    balance_id                  INTEGER       NOT NULL,
    profile_id                  INTEGER,
    item_type                   VARCHAR(40)   NOT NULL,
    impact_direction            VARCHAR(10)   NOT NULL,
    materiality_classification  VARCHAR(20)   NOT NULL DEFAULT 'IMMATERIAL',
    amount                      DOUBLE        NOT NULL,
    description                 TEXT          NOT NULL,
    attachment_id               INTEGER,
    exception_id                INTEGER,
    workflow_state_snapshot     VARCHAR(30),
    balance_status_snapshot     VARCHAR(30),
    is_resolved                 TINYINT(1)    NOT NULL DEFAULT 0,
    resolved_by                 INTEGER,
    resolved_at                 DATETIME,
    resolution_comment          TEXT,
    carry_forward_enabled       TINYINT(1)    NOT NULL DEFAULT 1,
    source_item_id              INTEGER,
    created_by                  INTEGER,
    created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

# MySQL: CREATE INDEX does not support IF NOT EXISTS — use information_schema guard
CREATE_INDEXES_SQL = [("ix_si_balance_id", "supporting_items", "balance_id"), ("ix_si_profile_id", "profile_id"), ("ix_si_exception_id", "exception_id"), ("ix_si_is_resolved", "is_resolved"), ("ix_si_item_type", "item_type"), ("ix_si_materiality", "materiality_classification")]


def _create_index_if_missing(conn, index_name: str, table: str, column: str) -> None:
    """MySQL-safe index creation — checks information_schema before issuing DDL."""
    from sqlalchemy import text as _text
    row = conn.execute(_text(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE table_schema = DATABASE() AND table_name = :t AND index_name = :i"
    ), {"t": table, "i": index_name}).scalar()
    if not row:
        conn.execute(_text(f"CREATE INDEX {index_name} ON {table} ({column})"))


def migrate(engine: Engine) -> None:
    """Idempotently create the supporting_items table and indexes."""
    insp = inspect(engine)
    if "supporting_items" in insp.get_table_names():
        logger.info("Table 'supporting_items' already exists — skipping creation.")
    else:
        with engine.begin() as conn:
            logger.info("Creating table 'supporting_items'…")
            conn.execute(text(CREATE_TABLE_SQL))
            for idx_name, tbl, col in CREATE_INDEXES_SQL:
                _create_index_if_missing(conn, idx_name, tbl, col)
        logger.info("supporting_items table created successfully.")



if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Done.")
