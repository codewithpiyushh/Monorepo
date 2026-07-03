"""
backend/app/services/demo_manager.py

Demo Data Governance — single entry point called from main.py on startup.

Two modes controlled by settings.DEMO_MODE:

  DEMO_MODE = True
    1. Purge all records where is_demo_data = True (in safe FK order)
    2. Re-seed the 10-project Enterprise Demo Matrix with is_demo_data = True
    → Guarantees a pristine demo environment on every server restart.

  DEMO_MODE = False  (production default)
    1. Purge any lingering is_demo_data = True records
    2. Exit — real user data is never touched
    → Switching from demo to production mode auto-cleans the database.

FK-safe delete order (children before parents):
  certification_workflow_history
  ui_notifications
  variance_snapshots
  supporting_items (if table exists)
  exception_queue_records         ← via match_groups → reconciliation_profiles
  reconciliation_balances
  certification_workflows
  reconciliation_profiles         ← parent of many tables
  projects                        ← cascades datasets/mappings/rules/executions
"""

from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.config import settings

log = logging.getLogger("drms.demo_manager")

# ── FK-safe purge order ───────────────────────────────────────────────────────

# Each entry: (table_name, has_is_demo_data_col)
# Tables without the column are skipped silently.
PURGE_ORDER = [
    "exception_escalation_logs",
    "exception_aging_snapshots",
    "reconciliation_balance_history",
    "certification_workflow_history",
    "ui_notifications",
    "variance_snapshots",
    "supporting_items",
    "exception_queue_records",
    "close_period_tasks",        # NEW — references close_periods + reconciliation_balances
    "reconciliation_comments",
    "reconciliation_attachments",
    "reconciliation_records",
    "match_group_items",
    "match_groups",
    "journal_adjustment_history",
    "journal_adjustments",
    "reconciliation_balances",
    "close_periods",             # NEW — referenced by close_period_tasks + reconciliation_balances
    "certification_workflows",
    "close_tasks",
    "financial_close_calendar",
    "reconciliation_rule_definitions",
    "reconciliation_snapshots",
    "reconciliation_archives",
    "reconciliation_ownership",
    "reconciliation_profiles", # Parent of balances/workflows/etc
    "ingestion_batches",
    "projects",              # Root Parent
]
# Tables where we purge via JOIN through reconciliation_profiles
# because the table itself doesn't have is_demo_data but its profile parent does.
PROFILE_CHILD_TABLES = {
    "match_groups",
    "reconciliation_records",
    "reconciliation_attachments",
    "reconciliation_ownership",
    "reconciliation_comments",
    "reconciliation_snapshots",
    "reconciliation_archives",
    "close_tasks",
    "financial_close_calendar",
    "reconciliation_rule_definitions",
    "journal_adjustments",
    "sla_violations",   # references sla_policies — purge before sla_policies
    "sla_policies",     # profile_id FK to reconciliation_profiles
}


def _table_exists(db: Session, table_name: str) -> bool:
    try:
        db.execute(text(f"SELECT 1 FROM {table_name} LIMIT 1"))
        return True
    except Exception:
        return False


def _col_exists(db: Session, table_name: str, col_name: str) -> bool:
    try:
        db.execute(text(f"SELECT {col_name} FROM {table_name} LIMIT 1"))
        return True
    except Exception:
        return False


def _purge_demo_records(db: Session) -> dict:
    counts = {}
    try:
        # Disable FK checks to allow bulk deletion in any order
        db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        
        for table in PURGE_ORDER:
            if not _table_exists(db, table): continue

            if table in PROFILE_CHILD_TABLES:
                result = db.execute(text(f"DELETE FROM {table} WHERE profile_id IN (SELECT id FROM reconciliation_profiles WHERE is_demo_data = 1)"))
            elif _col_exists(db, table, "is_demo_data"):
                result = db.execute(text(f"DELETE FROM {table} WHERE is_demo_data = 1"))
            else:
                continue

            rows = result.rowcount if hasattr(result, "rowcount") else 0
            if rows:
                counts[table] = rows
                log.info(f"[demo purge] {table}: deleted {rows} demo rows")

        db.commit()
    except Exception as e:
        log.warning(f"[demo purge] Error during purge: {e}")
        db.rollback()
    finally:
        # ALWAYS re-enable FK checks!
        db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        db.commit()
        
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_demo_startup(db: Session) -> None:
    """
    Called from main.py lifespan on startup.
    Reads settings.DEMO_MODE and branches accordingly.
    """
    if settings.DEMO_MODE:
        log.info("=== DEMO MODE ACTIVE — purging old demo data and re-seeding ===")
        purge_counts = _purge_demo_records(db)
        total_purged = sum(purge_counts.values())
        log.info(f"[demo purge] Total rows purged: {total_purged}")

        log.info("[demo seed] Seeding 10-project Enterprise Demo Matrix…")
        try:
            from ..services.demo_seed import seed_enterprise_demo_matrix, seed_close_periods_demo
            seed_enterprise_demo_matrix(db)
            log.info("[demo seed] ✅ Demo matrix seeded successfully.")

            log.info("[demo seed] Seeding demo close periods…")
            seed_close_periods_demo(db)
            log.info("[demo seed] ✅ Close periods seeded successfully.")

            log.info("[demo seed] Seeding SLA policies and running initial scan…")
            try:
                from ..services.demo_seed import seed_sla_demo
                seed_sla_demo(db)
            except Exception as e:
                log.warning(f"[demo seed] SLA seed skipped (non-fatal): {e}")
        except Exception as e:
            log.error(f"[demo seed] ❌ Seed failed: {e}", exc_info=True)

    else:
        log.info("=== PRODUCTION MODE — purging any lingering demo data ===")
        purge_counts = _purge_demo_records(db)
        total_purged = sum(purge_counts.values())
        if total_purged:
            log.info(f"[demo purge] Cleaned {total_purged} demo rows from production database.")
        else:
            log.info("[demo purge] Database is clean — no demo records found.")
        log.info("=== Production startup complete. ===")
