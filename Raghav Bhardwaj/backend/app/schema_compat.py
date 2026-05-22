from sqlalchemy import inspect, text

from .database import engine


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    cols = inspector.get_columns(table_name)
    return any(col.get("name") == column_name for col in cols)


def apply_compat_patches() -> None:
    """
    Apply minimal backward-compatible schema changes for existing DBs.
    This avoids runtime failures when code expects columns added after the
    original table creation and no full migration framework is in place.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    patch_map: dict[str, list[tuple[str, str]]] = {
        "audit_logs": [
            ("previous_hash", "VARCHAR(128) NULL"),
            ("entry_hash", "VARCHAR(128) NULL"),
        ],
        "exception_queue_records": [
            ("classification", "VARCHAR(40) NULL"),
            ("resolution_notes", "TEXT NULL"),
            ("escalated_at", "DATETIME NULL"),
            ("resolved_at", "DATETIME NULL"),
        ],
        "reconciliation_profiles": [
            ("assigned_approver", "INT NULL"),
            ("assigned_certifier", "INT NULL"),
            ("risk_classification", "VARCHAR(20) NULL"),
            ("due_days", "INT NULL"),
            ("lifecycle_state", "VARCHAR(30) NULL"),
        ],
    }

    statements: list[str] = []
    for table_name, columns in patch_map.items():
        if table_name not in tables:
            continue
        for col_name, ddl in columns:
            if not _column_exists(inspector, table_name, col_name):
                statements.append(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {ddl}")

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
