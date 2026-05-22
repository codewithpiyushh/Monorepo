from __future__ import annotations

import os
import sys
from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateTable

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models.models import Base


def _column_ddl(column) -> str:
    col_type = column.type.compile(dialect=engine.dialect)
    nullable = 'NULL' if column.nullable else 'NOT NULL'

    default_sql = ''
    if column.server_default is not None and getattr(column.server_default, 'arg', None) is not None:
        default_sql = f" DEFAULT {column.server_default.arg}"

    if (not column.nullable) and (not default_sql):
        # Safe fallback for live DBs with existing rows.
        nullable = 'NULL'

    return f"`{column.name}` {col_type} {nullable}{default_sql}"


def sync_schema(dry_run: bool = False) -> None:
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    model_tables = Base.metadata.tables

    stmts: list[str] = []

    # Create missing tables from model definitions.
    for table_name, table in model_tables.items():
        if table_name not in db_tables:
            create_sql = str(CreateTable(table).compile(dialect=engine.dialect)).strip().rstrip(';')
            stmts.append(create_sql)

    # Add missing columns for existing tables.
    for table_name, table in model_tables.items():
        if table_name not in db_tables:
            continue
        db_cols = {c['name'] for c in inspector.get_columns(table_name)}
        for column in table.columns:
            if column.name in db_cols:
                continue
            if column.primary_key:
                # Skip PK backfills in sync script.
                continue
            ddl = _column_ddl(column)
            stmts.append(f"ALTER TABLE `{table_name}` ADD COLUMN {ddl}")

    if not stmts:
        print('Schema already in sync.')
        return

    print('Planned statements:')
    for s in stmts:
        print(f" - {s}")

    if dry_run:
        print('Dry run only. No changes applied.')
        return

    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))

    print(f'Applied {len(stmts)} schema change(s).')


if __name__ == '__main__':
    sync_schema(dry_run=False)
