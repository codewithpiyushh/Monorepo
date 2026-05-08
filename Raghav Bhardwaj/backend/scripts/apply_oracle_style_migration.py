from pathlib import Path
from sqlalchemy import text

from app.database import engine


def main():
    migration_path = Path(__file__).resolve().parents[1] / "migrations" / "2026_05_07_oracle_style_workflow_indexes.sql"
    sql = migration_path.read_text(encoding="utf-8")

    statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip() and not stmt.strip().startswith("--")]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    print(f"Applied migration: {migration_path.name}")


if __name__ == "__main__":
    main()
