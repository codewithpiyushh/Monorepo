"""
Phase 2 — Enterprise Workflow Migration
=========================================
Adds to reconciliation_profiles:
  - approval_chain_json     TEXT   — structured multi-level chain
  - chain_locked            BOOLEAN DEFAULT 0  — immutable mid-workflow

Adds to reconciliation_balances:
  - current_approval_step_index  INTEGER DEFAULT 0
  - parallel_approvals_json      TEXT    — tracks who approved in PARALLEL tier
  - approved_at                  DATETIME
  - step_due_at                  DATETIME

Adds to users (delegation support):
  - delegate_user_id             INTEGER FK → users.id
  - delegation_start_date        DATETIME
  - delegation_end_date          DATETIME

Run once:
    python -m app.models.phase2_workflow_migration
"""
import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_PROFILE_COLS = [
    ("approval_chain_json", "TEXT",    None),
    ("chain_locked",        "BOOLEAN", "DEFAULT 0"),
]

_BALANCE_COLS = [
    ("current_approval_step_index", "INTEGER",  "DEFAULT 0"),
    ("parallel_approvals_json",     "TEXT",     "DEFAULT '[]'"),
    ("approved_at",                 "DATETIME", None),
    ("step_due_at",                 "DATETIME", None),
    ("auto_certified",              "BOOLEAN",  "DEFAULT 0"),
]

_USER_COLS = [("delegate_user_id", "INTEGER", None), ("delegation_start_date", "DATETIME", ("delegation_end_date"]


def _add_columns(conn, table: str, columns: list, existing: set) -> None:
    for col_name, col_type, col_default in columns:
        if col_name in existing:
            logger.debug("Column '%s.%s' already exists — skipping", table, col_name)
            continue
        ddl = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
        if col_default:
            ddl += f" {col_default}"
        logger.info("Adding %s.%s", table, col_name)
        conn.execute(text(ddl))


def migrate(engine: Engine) -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    with engine.begin() as conn:
        if "reconciliation_profiles" in tables:
            existing = {c["name"] for c in insp.get_columns("reconciliation_profiles")}
            _add_columns(conn, "reconciliation_profiles", _PROFILE_COLS, existing)

        if "reconciliation_balances" in tables:
            existing = {c["name"] for c in insp.get_columns("reconciliation_balances")}
            _add_columns(conn, "reconciliation_balances", _BALANCE_COLS, existing)

        if "users" in tables:
            existing = {c["name"] for c in insp.get_columns("users")}
            _add_columns(conn, "users", _USER_COLS, existing)

    logger.info("Phase 2 workflow migration complete.")


if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Done.")
