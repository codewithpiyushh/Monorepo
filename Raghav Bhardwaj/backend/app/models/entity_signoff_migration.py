import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CREATE_ENTITY_SIGNOFFS_SQL = """
CREATE TABLE IF NOT EXISTS entity_signoffs (
    id                  INTEGER       NOT NULL AUTO_INCREMENT,
    project_id          INTEGER       NOT NULL,
    entity_name         VARCHAR(100)  NOT NULL,
    region              VARCHAR(50)   NULL,
    period_key          VARCHAR(30)   NOT NULL,
    signoff_status      VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
    signed_off_by       INTEGER       NULL,
    signed_off_at       DATETIME      NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_entity_signoff_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_entity_signoff_user    FOREIGN KEY (signed_off_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def migrate(engine: Engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text(CREATE_ENTITY_SIGNOFFS_SQL))
            logger.info("[entity_signoff_migration] entity_signoffs table ready")
        except Exception as e:
            logger.error(f"[entity_signoff_migration] Failed: {e}")
            raise
