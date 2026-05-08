from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import AuditLogsPage
from ..services import audit_service
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


@router.get("", response_model=AuditLogsPage)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    logs, total = audit_service.get_logs(
        db,
        page=page,
        page_size=page_size,
        action_type=action_type,
        entity_type=entity_type,
    )
    return AuditLogsPage(logs=logs, total=total, page=page, page_size=page_size)
