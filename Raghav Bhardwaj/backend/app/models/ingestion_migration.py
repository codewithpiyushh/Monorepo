"""
API Data Ingestion Migration
Creates `ingestion_jobs` table to track API push events.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_INGESTION_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    dataset_type        VARCHAR(20)   NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    records_received    INTEGER       NOT NULL DEFAULT 0,
    records_inserted    INTEGER       NOT NULL DEFAULT 0,
    records_failed      INTEGER       NOT NULL DEFAULT 0,
    error_message       TEXT          NULL,
    started_at          DATETIME      NULL,
    completed_at        DATETIME      NULL,
    created_by          INTEGER       NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ingestion_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_ingestion_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def _index_exists(conn, index_name: str, table: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() "
        f"AND TABLE_NAME = '{table}' AND INDEX_NAME = '{index_name}'"
    )).scalar()
    return int(row or 0) > 0

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_INGESTION_JOBS_SQL))
            logger.info("[ingestion_migration] ingestion_jobs table ready")

            if not _index_exists(conn, "ix_ingestion_jobs_status", "ingestion_jobs"):
                conn.execute(text("CREATE INDEX ix_ingestion_jobs_status ON ingestion_jobs (status)"))
            
            logger.info("[ingestion_migration] Ingestion Migration complete")
        except Exception as e:
            logger.error(f"[ingestion_migration] Failed: {e}")
            raise
