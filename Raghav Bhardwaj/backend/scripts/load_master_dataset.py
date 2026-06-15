"""
DRMS Master Dataset Loader
==========================
Reads seed_master_dataset.sql and executes it against the configured
database (SQLite for dev, MySQL for staging/prod).

Usage:
    # From the backend/ directory with the venv active:
    python scripts/load_master_dataset.py

Options:
    --db-url    Override DATABASE_URL from .env
    --dry-run   Parse SQL and echo statements without executing
    --reset     DROP + recreate all tables before seeding (uses init_db())

Requirements: pip install sqlalchemy python-dotenv
"""
import sys
# Force UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import argparse
import os
import re
from pathlib import Path

# ── Bootstrap backend package path ──────────────────────────────────────────
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env")

from sqlalchemy import create_engine, text

SQL_FILE = Path(__file__).resolve().parent / "seed_master_dataset.sql"


def get_engine(db_url: str | None = None):
    url = db_url or os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_ROOT}/drms_dev.db")
    print(f"[LOADER] Connecting to: {url}")
    return create_engine(url, echo=False)


def split_statements_raw(sql: str) -> list[str]:
    """
    Split SQL into individual executable statements using raw string splitting.
    No escaping needed — raw DBAPI cursor is used for execution, which does NOT
    interpret :param or %(param)s placeholders inside JSON string literals.
    """
    # Remove block comments
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    raw = [s.strip() for s in sql.split(";")]
    statements = []
    for stmt in raw:
        lines = []
        for line in stmt.splitlines():
            stripped = line.split("--")[0].strip()
            if stripped:
                lines.append(stripped)
        clean = " ".join(lines).strip()
        if clean and len(clean) > 3:
            statements.append(clean)
    return statements


def run(db_url: str | None = None, dry_run: bool = False, reset: bool = False):
    engine = get_engine(db_url)
    is_sqlite = "sqlite" in engine.url.drivername
    is_mysql  = "mysql"  in engine.url.drivername

    if reset:
        print("[LOADER] --reset flag: rebuilding schema ...")
        from app.database import init_db, Base
        if is_mysql:
            with engine.begin() as conn:
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            Base.metadata.drop_all(bind=engine)
            with engine.begin() as conn:
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        else:
            Base.metadata.drop_all(bind=engine)
        init_db()
        print("[LOADER] Schema rebuilt.")

    sql_text = SQL_FILE.read_text(encoding="utf-8")
    statements = split_statements_raw(sql_text)

    print(f"[LOADER] Found {len(statements)} SQL statements to execute.")

    if dry_run:
        print("[LOADER] --dry-run mode: printing statements only.\n")
        for i, stmt in enumerate(statements, 1):
            preview = stmt[:120].replace("\n", " ")
            print(f"  [{i:03d}] {preview} ...")
        return

    executed = 0
    errors   = 0

    # Use raw DBAPI cursor — bypasses SQLAlchemy's :bind_param / %(param)s parsing
    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        if is_sqlite:
            cursor.execute("PRAGMA foreign_keys = OFF")
        elif is_mysql:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")

        for i, stmt in enumerate(statements, 1):
            upper = stmt.upper().lstrip()
            if upper.startswith("PRAGMA") or upper.startswith("SET FOREIGN_KEY"):
                continue
            try:
                cursor.execute(stmt)
                executed += 1
                if executed % 50 == 0:
                    print(f"  ... {executed} statements executed ...")
            except Exception as exc:
                errors += 1
                short = stmt[:120].replace("\n", " ")
                print(f"[ERROR] Statement {i}: {exc}")
                print(f"        SQL: {short}")

        if is_sqlite:
            cursor.execute("PRAGMA foreign_keys = ON")
        elif is_mysql:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

        raw_conn.commit()
    finally:
        raw_conn.close()

    print(f"\n[LOADER] Done. {executed} statements executed, {errors} errors.")

    # ── Print a quick record count summary ─────────────────────────────────
    tables = [
        "users", "projects", "reconciliation_profiles",
        "financial_close_calendar", "certification_workflows",
        "reconciliation_records", "match_groups", "exception_queue_records",
        "audit_logs", "reconciliation_attachments", "journal_adjustments",
        "ui_notifications", "close_tasks", "job_metrics",
    ]
    print("\n[LOADER] Record counts:")
    with engine.connect() as conn:
        for table in tables:
            try:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                print(f"  {table:<40} {count:>6} rows")
            except Exception:
                print(f"  {table:<40} (table not found)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load DRMS master test dataset")
    parser.add_argument("--db-url",  default=None, help="Override DATABASE_URL")
    parser.add_argument("--dry-run", action="store_true", help="Print statements without executing")
    parser.add_argument("--reset",   action="store_true", help="Drop and recreate schema first")
    args = parser.parse_args()

    run(db_url=args.db_url, dry_run=args.dry_run, reset=args.reset)
