"""
Phase 2 Chunk 3 — Financial Close Calendar
Migration: creates close_periods and close_period_tasks tables,
and adds close_period_id column to reconciliation_balances.

Run once:
    python -m app.models.close_calendar_migration
Or call migrate(engine) from startup after init_db().
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_CLOSE_PERIODS_SQL = """
CREATE TABLE IF NOT EXISTS close_periods (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    period_name         VARCHAR(100)  NOT NULL,
    period_key          VARCHAR(30)   NOT NULL,
    start_date          VARCHAR(30)   NOT NULL,
    due_date            VARCHAR(30)   NOT NULL,
    close_status        VARCHAR(30)   NOT NULL DEFAULT 'OPEN',
    total_profiles      INTEGER       NOT NULL DEFAULT 0,
    completed_profiles  INTEGER       NOT NULL DEFAULT 0,
    certified_profiles  INTEGER       NOT NULL DEFAULT 0,
    closed_by           INTEGER,
    closed_at           DATETIME,
    is_demo_data        TINYINT(1)    NOT NULL DEFAULT 0,
    created_by          INTEGER,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_close_periods_period_key (period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

CREATE_CLOSE_PERIOD_TASKS_SQL = """
CREATE TABLE IF NOT EXISTS close_period_tasks (
    id                    INTEGER       NOT NULL AUTO_INCREMENT,
    close_period_id       INTEGER       NOT NULL,
    profile_id            INTEGER       NOT NULL,
    balance_id            INTEGER,
    assigned_owner_id     INTEGER,
    target_due_date       VARCHAR(30),
    task_status           VARCHAR(30)   NOT NULL DEFAULT 'NOT_STARTED',
    completion_percentage DOUBLE        NOT NULL DEFAULT 0.0,
    is_demo_data          TINYINT(1)    NOT NULL DEFAULT 0,
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_cpt_close_period FOREIGN KEY (close_period_id) REFERENCES close_periods (id),
    CONSTRAINT fk_cpt_profile      FOREIGN KEY (profile_id)      REFERENCES reconciliation_profiles (id),
    CONSTRAINT fk_cpt_balance      FOREIGN KEY (balance_id)      REFERENCES reconciliation_balances (id),
    CONSTRAINT fk_cpt_owner        FOREIGN KEY (assigned_owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


def _index_exists(conn, index_name: str, table: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND INDEX_NAME = '{index_name}'"
    )).scalar()
    return int(row) > 0


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'"
    )).scalar()
    return int(row) > 0


def _create_index(conn, index_name: str, table: str, columns: str, unique: bool = False) -> None:
    if not _index_exists(conn, index_name, table):
        unique_kw = "UNIQUE " if unique else ""
        conn.execute(text(f"CREATE {unique_kw}INDEX {index_name} ON {table} ({columns})"))
        logger.info(f"[close_calendar_migration] Created index {index_name}")


def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            # 1. close_periods table
            conn.execute(text(CREATE_CLOSE_PERIODS_SQL))
            logger.info("[close_calendar_migration] close_periods table ready")

            # 2. Indexes on close_periods
            _create_index(conn, "ix_close_periods_close_status", "close_periods", "close_status")
            _create_index(conn, "ix_close_periods_is_demo_data", "close_periods", "is_demo_data")

            # 3. close_period_tasks table
            conn.execute(text(CREATE_CLOSE_PERIOD_TASKS_SQL))
            logger.info("[close_calendar_migration] close_period_tasks table ready")

            # 4. Indexes on close_period_tasks
            _create_index(conn, "ix_cpt_close_period_id",   "close_period_tasks", "close_period_id")
            _create_index(conn, "ix_cpt_profile_id",        "close_period_tasks", "profile_id")
            _create_index(conn, "ix_cpt_assigned_owner_id", "close_period_tasks", "assigned_owner_id")
            _create_index(conn, "ix_cpt_task_status",       "close_period_tasks", "task_status")
            _create_index(conn, "ix_cpt_is_demo_data",      "close_period_tasks", "is_demo_data")
            _create_index(conn, "ix_cpt_period_status",     "close_period_tasks", "close_period_id, task_status")

            # 5. Add close_period_id to reconciliation_balances (nullable FK)
            if not _column_exists(conn, "reconciliation_balances", "close_period_id"):
                conn.execute(text(
                    "ALTER TABLE reconciliation_balances "
                    "ADD COLUMN close_period_id INTEGER NULL, "
                    "ADD CONSTRAINT fk_rb_close_period "
                    "FOREIGN KEY (close_period_id) REFERENCES close_periods (id)"
                ))
                _create_index(conn, "ix_rb_close_period_id", "reconciliation_balances", "close_period_id")
                logger.info("[close_calendar_migration] close_period_id column added to reconciliation_balances")
            else:
                logger.info("[close_calendar_migration] close_period_id already exists on reconciliation_balances")

        except Exception as e:
            logger.error(f"[close_calendar_migration] Migration failed: {e}")
            raise


if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Done.")
