import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable
from .core.config import settings
from .core.config import resolve_sqlite_database_path

engine_kwargs = {}
database_url = settings.DATABASE_URL
sqlite_path = None

# SQLite-specific settings
if database_url.startswith("sqlite"):
    sqlite_path = resolve_sqlite_database_path(database_url)
    if sqlite_path is None:
        raise ValueError(f"Could not resolve SQLite database path from {database_url!r}")

# MySQL-specific optimizations
elif database_url.startswith("mysql"):
    engine_kwargs = {
        "pool_pre_ping": True,     # avoids stale connections
        "pool_size": 10,           # connection pool size
        "max_overflow": 20         # extra connections
    }

if sqlite_path is not None:
    engine = create_engine(
        "sqlite+pysqlite://",
        creator=lambda: sqlite3.connect(str(sqlite_path), check_same_thread=False),
        **engine_kwargs,
    )
else:
    engine = create_engine(
        database_url,
        **engine_kwargs
    )

# Enable WAL mode for SQLite (better concurrency)
if database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            # WAL is a best-effort optimization; some Windows paths/filesystems
            # reject it even though the database itself is readable/writable.
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:
            pass
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from .models import models  # registers models
    if database_url.startswith("sqlite"):
        with engine.begin() as conn:
            for table in Base.metadata.sorted_tables:
                conn.execute(CreateTable(table, if_not_exists=True))
    else:
        Base.metadata.create_all(bind=engine)
