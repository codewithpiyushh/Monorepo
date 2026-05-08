from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .core.config import settings

connect_args = {}
engine_kwargs = {}

# SQLite-specific settings
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# MySQL-specific optimizations
elif settings.DATABASE_URL.startswith("mysql"):
    engine_kwargs = {
        "pool_pre_ping": True,     # avoids stale connections
        "pool_size": 10,           # connection pool size
        "max_overflow": 20         # extra connections
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs
)

# Enable WAL mode for SQLite (better concurrency)
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
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
    Base.metadata.create_all(bind=engine)