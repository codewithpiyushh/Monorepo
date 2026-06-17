"""
Phase 1 — Reconciliation Lifecycle State Machine
Migration: adds lifecycle columns to reconciliation_balances
============================================================
New columns:
  Workflow Ownership
    current_owner_id        INTEGER  FK → users.id
    current_owner_role      VARCHAR(30)
    assigned_at             DATETIME

  SLA / Due Dates
    submitted_at            DATETIME
    review_due_date         DATETIME
    approval_due_date       DATETIME
    certification_due_date  DATETIME

  Audit Comments
    submit_comment          TEXT
    approval_comment        TEXT
    certification_comment   TEXT
    rejection_comment       TEXT

  Immutability Lock
    is_certified_locked     BOOLEAN  DEFAULT FALSE
    override_log            TEXT     (JSON array of admin overrides)

  Phase 3 hook
    journal_adjustment_pending  BOOLEAN  DEFAULT FALSE

Run once:
    python -m app.models.lifecycle_migration
Or call migrate(engine) from app startup.
"""
import json
import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_NEW_COLUMNS = [# Ownership
    ("current_owner_id", "INTEGER", None), ("current_owner_role", "VARCHAR(30)", ("assigned_at", "DATETIME", # SLA
    ("submitted_at", ("review_due_date", ("approval_due_date", ("certification_due_date", # Comments
    ("submit_comment", "TEXT", ("approval_comment", ("certification_comment", ("rejection_comment", # Immutability lock
    ("is_certified_locked", "BOOLEAN", "DEFAULT 0"), ("override_log", # Phase 3 Journal Adjustment hook
    ("journal_adjustment_pending"]


def migrate(engine: Engine) -> None:
    """Idempotently add all lifecycle columns to reconciliation_balances."""
    insp = inspect(engine)

    # Check the table exists (user built it in balance engine phase)
    tables = insp.get_table_names()
    if "reconciliation_balances" not in tables:
        logger.warning(
            "Table 'reconciliation_balances' does not exist yet. "
            "Run the balance engine migration first."
        )
        return

    existing = {col["name"] for col in insp.get_columns("reconciliation_balances")}

    with engine.begin() as conn:
        for col_name, col_type, col_default in _NEW_COLUMNS:
            if col_name in existing:
                logger.debug("Column '%s' already exists — skipping", col_name)
                continue
            ddl = f"ALTER TABLE reconciliation_balances ADD COLUMN {col_name} {col_type}"
            if col_default:
                ddl += f" {col_default}"
            logger.info("Adding column: %s", col_name)
            conn.execute(text(ddl))

    logger.info("Lifecycle migration on reconciliation_balances complete.")


if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Done.")
