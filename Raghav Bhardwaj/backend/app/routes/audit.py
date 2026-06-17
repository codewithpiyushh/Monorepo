from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import AuditLogsPage
from ..services import audit_service
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN
from ..models.models import UserSession, UserActivityLog

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


# ---------------------------------------------------------------------------
# Audit log endpoints — ADMIN ONLY
# Auditor role has been removed. Only Admin can access the audit trail,
# which ensures proper segregation of duties for SOX compliance.
# ---------------------------------------------------------------------------

@router.get("", response_model=AuditLogsPage)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    logs, total = audit_service.get_logs(
        db,
        page=page,
        page_size=page_size,
        action_type=action_type,
        entity_type=entity_type,
    )
    return AuditLogsPage(logs=logs, total=total, page=page, page_size=page_size)


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    rows = db.query(UserSession).order_by(UserSession.login_at.desc()).limit(500).all()
    return rows


@router.get("/activities")
def list_activities(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    rows = db.query(UserActivityLog).order_by(UserActivityLog.created_at.desc()).limit(1000).all()
    return rows
