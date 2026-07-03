"""
Auto-Certification Engine Migration
Creates `auto_cert_rules` table.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_AUTO_CERT_RULES_SQL = """
CREATE TABLE IF NOT EXISTS auto_cert_rules (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    max_variance        DOUBLE        NOT NULL DEFAULT 0.0,
    allow_exceptions    TINYINT(1)    NOT NULL DEFAULT 0,
    allowed_risk_levels VARCHAR(100)  NOT NULL DEFAULT 'LOW,MEDIUM',
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_by          INTEGER       NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_auto_cert_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_auto_cert_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_AUTO_CERT_RULES_SQL))
            logger.info("[auto_cert_migration] auto_cert_rules table ready")
        except Exception as e:
            logger.error(f"[auto_cert_migration] Failed: {e}")
            raise
