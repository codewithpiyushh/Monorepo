"""
Evidence Retention Migration
Creates `retention_policies` and `archival_jobs` tables.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_RETENTION_POLICIES_SQL = """
CREATE TABLE IF NOT EXISTS retention_policies (
    id                    INTEGER       NOT NULL AUTO_INCREMENT,
    project_id            INTEGER       NOT NULL,
    doc_type              VARCHAR(50)   NOT NULL,
    retention_period_days INTEGER       NOT NULL,
    cold_storage_days     INTEGER       NULL,
    is_active             TINYINT(1)    NOT NULL DEFAULT 1,
    created_by            INTEGER       NULL,
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retention_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_retention_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

CREATE_ARCHIVAL_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS archival_jobs (
    id               INTEGER       NOT NULL AUTO_INCREMENT,
    project_id       INTEGER       NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    docs_archived    INTEGER       NOT NULL DEFAULT 0,
    started_at       DATETIME      NULL,
    completed_at     DATETIME      NULL,
    created_by       INTEGER       NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_archival_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_archival_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_RETENTION_POLICIES_SQL))
            logger.info("[evidence_retention_migration] retention_policies table ready")
            
            conn.execute(text(CREATE_ARCHIVAL_JOBS_SQL))
            logger.info("[evidence_retention_migration] archival_jobs table ready")
        except Exception as e:
            logger.error(f"[evidence_retention_migration] Failed: {e}")
            raise
