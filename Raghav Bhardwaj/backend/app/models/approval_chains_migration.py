"""
Approval Chains Migration
Creates `approval_rules` table.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_APPROVAL_RULES_SQL = """
CREATE TABLE IF NOT EXISTS approval_rules (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    condition_field     VARCHAR(50)   NOT NULL,
    condition_operator  VARCHAR(20)   NOT NULL,
    condition_value     VARCHAR(255)  NOT NULL,
    action              VARCHAR(50)   NOT NULL,
    target_role         VARCHAR(50)   NULL,
    is_active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_by          INTEGER       NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_approval_rules_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_approval_rules_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_APPROVAL_RULES_SQL))
            logger.info("[approval_chains_migration] approval_rules table ready")
        except Exception as e:
            logger.error(f"[approval_chains_migration] Failed: {e}")
            raise
