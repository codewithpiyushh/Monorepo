import json
import hashlib
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from ..models.models import AuditLog


def log_action(
    db: Session,
    action_type: str,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    previous = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    previous_hash = previous.entry_hash if previous else None
    payload = json.dumps(
        {
            "user_id": user_id,
            "action_type": action_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": metadata or {},
            "ip_address": ip_address,
            "timestamp": datetime.utcnow().isoformat(),
            "previous_hash": previous_hash,
        },
        sort_keys=True,
    )
    entry_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    log = AuditLog(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata) if metadata else None,
        ip_address=ip_address,
        previous_hash=previous_hash,
        entry_hash=entry_hash,
        timestamp=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_logs(
    db: Session,
    page: int = 1,
    page_size: int = 50,
    action_type: Optional[str] = None,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
):
    query = db.query(AuditLog)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    total = query.count()
    logs = (
        query.order_by(AuditLog.timestamp.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Enrich with username
    result = []
    for log in logs:
        log_dict = {
            "id": log.id,
            "user_id": log.user_id,
            "action_type": log.action_type,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "metadata_json": log.metadata_json,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp,
            "username": log.user.username if log.user else "system",
        }
        result.append(log_dict)

    return result, total
