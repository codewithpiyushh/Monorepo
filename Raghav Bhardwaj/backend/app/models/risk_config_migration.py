"""
Risk Configuration Migration
Creates `risk_configs` table.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_RISK_CONFIGS_SQL = """
CREATE TABLE IF NOT EXISTS risk_configs (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    aging_weight        DOUBLE        NOT NULL DEFAULT 0.33,
    materiality_weight  DOUBLE        NOT NULL DEFAULT 0.33,
    account_type_weight DOUBLE        NOT NULL DEFAULT 0.34,
    created_by          INTEGER       NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_risk_config_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_risk_config_user    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_RISK_CONFIGS_SQL))
            logger.info("[risk_config_migration] risk_configs table ready")
        except Exception as e:
            logger.error(f"[risk_config_migration] Failed: {e}")
            raise
