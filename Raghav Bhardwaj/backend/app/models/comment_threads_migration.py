"""
Phase 2 — In-Context Comment Threads Migration
================================================
Creates three tables:
  reconciliation_comments  — immutable thread entries (NO updated_at/deleted_at)
  comment_mentions         — normalized @mention records
  comment_reads            — read-receipt tracking per user

SOX COMPLIANCE NOTE:
  reconciliation_comments intentionally has NO updated_at or deleted_at columns.
  Once a row is inserted it is permanent and unmodifiable. This is enforced both
  here at the schema level and at the API layer (no PATCH/DELETE endpoints exist).

Run once:
    python -m app.models.comment_threads_migration
"""
import logging
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_TABLES = {
    "reconciliation_comments": """
        CREATE TABLE IF NOT EXISTS reconciliation_comments (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            balance_id          INTEGER NOT NULL
                                    REFERENCES reconciliation_balances(id)
                                    ON DELETE CASCADE,
            user_id             INTEGER
                                    REFERENCES users(id)
                                    ON DELETE SET NULL,
            parent_comment_id   INTEGER
                                    REFERENCES reconciliation_comments(id)
                                    ON DELETE SET NULL,
            content             TEXT    NOT NULL,
            comment_type        VARCHAR(20) NOT NULL DEFAULT 'DISCUSSION'
                                    CHECK (comment_type IN (
                                        'DISCUSSION', 'QUESTION', 'RESPONSE',
                                        'SYSTEM_EVENT', 'AUDITOR_NOTE'
                                    )),
            is_system_generated BOOLEAN NOT NULL DEFAULT 0,
            attachment_id       INTEGER
                                    REFERENCES reconciliation_attachments(id)
                                    ON DELETE SET NULL,
            -- NO updated_at — immutable by design (SOX compliance)
            -- NO deleted_at — comments cannot be deleted
            created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """,
    "comment_mentions": """
        CREATE TABLE IF NOT EXISTS comment_mentions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id  INTEGER NOT NULL
                            REFERENCES reconciliation_comments(id)
                            ON DELETE CASCADE,
            user_id     INTEGER NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """,
    "comment_reads": """
        CREATE TABLE IF NOT EXISTS comment_reads (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id  INTEGER NOT NULL
                            REFERENCES reconciliation_comments(id)
                            ON DELETE CASCADE,
            user_id     INTEGER NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,
            read_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (comment_id, user_id)
        );
    """,
}

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_rc_balance_id     ON reconciliation_comments (balance_id);",
    "CREATE INDEX IF NOT EXISTS ix_rc_user_id        ON reconciliation_comments (user_id);",
    "CREATE INDEX IF NOT EXISTS ix_rc_parent         ON reconciliation_comments (parent_comment_id);",
    "CREATE INDEX IF NOT EXISTS ix_rc_type           ON reconciliation_comments (comment_type);",
    "CREATE INDEX IF NOT EXISTS ix_rc_created        ON reconciliation_comments (created_at);",
    "CREATE INDEX IF NOT EXISTS ix_cm_comment_id     ON comment_mentions (comment_id);",
    "CREATE INDEX IF NOT EXISTS ix_cm_user_id        ON comment_mentions (user_id);",
    "CREATE INDEX IF NOT EXISTS ix_cr_comment_id     ON comment_reads (comment_id);",
    "CREATE INDEX IF NOT EXISTS ix_cr_user_id        ON comment_reads (user_id);",
]


def migrate(engine):
    is_mysql = "mysql" in engine.url.drivername
    
    # 1. Define SQL dialect-specifically
    if is_mysql:
        # MySQL Syntax
        ddl = """
        CREATE TABLE IF NOT EXISTS comment_mentions (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            comment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (comment_id) REFERENCES reconciliation_comments(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    else:
        # SQLite Syntax
        ddl = """
        CREATE TABLE IF NOT EXISTS comment_mentions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL REFERENCES reconciliation_comments(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """

    with engine.begin() as conn:
        print("INFO: Creating table 'comment_mentions'...")
        conn.execute(text(ddl))
        print("✅ Successfully created 'comment_mentions'.")

if __name__ == "__main__":
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    from app.database import engine as _engine
    logging.basicConfig(level=logging.INFO)
    migrate(_engine)
    print("Done.")
