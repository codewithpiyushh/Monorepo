import json
import uuid
from datetime import datetime
from sqlalchemy.orm import Session

from ..models.models import UserSession, UserActivityLog


def start_session(db: Session, user_id: int, ip_address: str | None, user_agent: str | None):
    token_id = uuid.uuid4().hex
    session = UserSession(
        user_id=user_id,
        token_id=token_id,
        ip_address=ip_address,
        user_agent=user_agent,
        login_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def end_session(db: Session, token_id: str):
    session = db.query(UserSession).filter(UserSession.token_id == token_id, UserSession.is_active == True).first()
    if not session:
        return None
    session.is_active = False
    session.logout_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


def log_activity(
    db: Session,
    *,
    user_id: int | None,
    session_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    ip_address: str | None = None,
    metadata: dict | None = None,
):
    row = UserActivityLog(
        user_id=user_id,
        session_id=session_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip_address=ip_address,
        metadata_json=json.dumps(metadata or {}),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
