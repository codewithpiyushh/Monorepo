from sqlalchemy import inspect, text
from .database import engine

def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    try:
        cols = inspector.get_columns(table_name)
        return any(col.get("name") == column_name for col in cols)
    except:
        return False

def apply_compat_patches() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    is_mysql = "mysql" in engine.url.drivername

    # Define all required schema patches
    patch_map = {
        "projects": [("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0")],
        "reconciliation_attachments": [("profile_id", "INT NULL")],
        "match_groups": [
            ("execution_id", "INTEGER NULL"),
        ],
        "exception_queue_records": [
            ("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0"),
            ("classification", "VARCHAR(40) NULL")
        ],
        "reconciliation_profiles": [
            ("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0"),
            ("approval_chain_json", "TEXT NULL"),
            ("materiality_limit", "FLOAT DEFAULT 0")
        ],
        "reconciliation_balances": [
            ("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0"),
            ("unexplained_variance", "FLOAT NULL")
        ],
        "certification_workflows": [("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0")],
        "ui_notifications": [("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0")],
        "variance_snapshots": [("is_demo_data", "BOOLEAN NOT NULL DEFAULT 0")]
    }

    with engine.begin() as conn:
        for table, columns in patch_map.items():
            if table in tables:
                for col_name, ddl in columns:
                    if not _column_exists(inspector, table, col_name):
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {ddl}"))

    # Create missing variance_snapshots table
    if "variance_snapshots" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS variance_snapshots (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    profile_id INTEGER NOT NULL,
                    period_key VARCHAR(30) NOT NULL,
                    raw_variance FLOAT,
                    explained_variance FLOAT,
                    unexplained_variance FLOAT,
                    flux_amount FLOAT,
                    is_demo_data BOOLEAN NOT NULL DEFAULT 0
                )
            """))