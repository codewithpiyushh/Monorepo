"""
Compliance Policy Migration
Creates `compliance_policies` table.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_COMPLIANCE_POLICIES_SQL = """
CREATE TABLE IF NOT EXISTS compliance_policies (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    control_name        VARCHAR(100)  NOT NULL,
    category            VARCHAR(50)   NOT NULL,
    violation_threshold INTEGER       NOT NULL DEFAULT 0,
    current_violations  INTEGER       NOT NULL DEFAULT 0,
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_by          INTEGER       NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_compliance_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_compliance_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_COMPLIANCE_POLICIES_SQL))
            logger.info("[compliance_policy_migration] compliance_policies table ready")
        except Exception as e:
            logger.error(f"[compliance_policy_migration] Failed: {e}")
            raise
