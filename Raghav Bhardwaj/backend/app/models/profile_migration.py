"""
Phase 1 — ReconciliationProfile schema additions
================================================
The existing `reconciliation_profiles` table already exists.
This module defines the NEW columns that need to be added and
provides a safe migrate() helper you can call once on startup
(or run as a standalone script).

NEW COLUMNS added to ReconciliationProfile:
  - account_number  VARCHAR(50)  UNIQUE  NULLABLE
  - auto_certify    BOOLEAN      DEFAULT FALSE
  - status          VARCHAR(20)  DEFAULT 'ACTIVE'

These complement the existing risk_classification / lifecycle_state /
active columns so the profile has a single, explicit status field
as required by the Phase 1 spec, while preserving backward compat.

Usage (one-time migration):
    python -m app.models.profile_migration

Or call migrate(engine) from your app startup after init_db().
"""
import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Column definitions — (column_name, DDL_type, DDL_default)
_NEW_COLUMNS = [
    ("account_number", "VARCHAR(50)",  None),
    ("auto_certify",   "BOOLEAN",      "DEFAULT FALSE"),
    ("status",         "VARCHAR(20)",  "DEFAULT 'ACTIVE'"),
]


def migrate(engine: Engine) -> None:
    """
    Idempotently add the three new Phase-1 columns to reconciliation_profiles.
    Safe to call on every startup — checks column existence first.
    """
    insp = inspect(engine)
    existing = {col["name"] for col in insp.get_columns("reconciliation_profiles")}

    with engine.begin() as conn:
        for col_name, col_type, col_default in _NEW_COLUMNS:
            if col_name in existing:
                logger.debug("Column '%s' already exists — skipping", col_name)
                continue

            ddl = f"ALTER TABLE reconciliation_profiles ADD COLUMN {col_name} {col_type}"
            if col_default:
                ddl += f" {col_default}"

            logger.info("Adding column: %s", col_name)
            conn.execute(text(ddl))

        # Add unique index on account_number if it doesn't exist yet
        indexes = {idx["name"] for idx in insp.get_indexes("reconciliation_profiles")}
        if "ix_recon_profiles_account_number" not in indexes:
            try:
                dialect = engine.dialect.name  # 'mysql', 'sqlite', 'postgresql', etc.
                if dialect == "sqlite":
                    conn.execute(text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_recon_profiles_account_number "
                        "ON reconciliation_profiles (account_number) "
                        "WHERE account_number IS NOT NULL"
                    ))
                else:
                    # MySQL / PostgreSQL: no IF NOT EXISTS on CREATE INDEX, no partial WHERE on MySQL
                    conn.execute(text(
                        "CREATE UNIQUE INDEX ix_recon_profiles_account_number "
                        "ON reconciliation_profiles (account_number)"
                    ))
                logger.info("Created unique index on account_number")
            except Exception as exc:
                logger.warning("Could not create unique index (may already exist): %s", exc)

    logger.info("ReconciliationProfile migration complete")


if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Migration complete.")
