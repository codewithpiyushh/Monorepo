from typing import List, Optional
from fastapi import APIRouter, Depends, BackgroundTasks, Request
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..schemas.schemas import ExecutionOut, ResultsPage
from ..services import execution_service, audit_service
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, PREPARER
from ..models.models import User

router = APIRouter(prefix="/api/projects/{project_id}/executions", tags=["executions"])


def _run_in_background(execution_id: int, project_id: int):
    """Background task: uses its own DB session."""
    db = SessionLocal()
    try:
        execution_service.run_reconciliation(execution_id, project_id, db)
    finally:
        db.close()


@router.post("", response_model=ExecutionOut, status_code=202)
def trigger_execution(
    project_id: int,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    assigned_to = current_user.id
    if (current_user.role or "").lower() != PREPARER:
        preferred_preparer = (
            db.query(User)
            .filter(User.username == PREPARER, User.role == PREPARER, User.is_active == True)
            .first()
        )
        preparer_user = preferred_preparer or (
            db.query(User)
            .filter(User.role == PREPARER, User.is_active == True)
            .order_by(User.id.asc())
            .first()
        )
        if preparer_user:
            assigned_to = preparer_user.id
    execution = execution_service.create_execution(db, project_id, assigned_to=assigned_to)
    background_tasks.add_task(_run_in_background, execution.id, project_id)
    audit_service.log_action(
        db, "EXECUTION_STARTED", user_id=current_user.id,
        entity_type="execution", entity_id=execution.id,
        metadata={"project_id": project_id},
        ip_address=request.client.host if request.client else None,
    )
    return execution


@router.get("", response_model=List[ExecutionOut])
def list_executions(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN, APPROVER])),
):
    return execution_service.get_executions(db, project_id)


@router.get("/{execution_id}", response_model=ExecutionOut)
def get_execution(
    project_id: int,
    execution_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN, APPROVER])),
):
    return execution_service.get_execution(db, execution_id, project_id)


@router.get("/{execution_id}/results", response_model=ResultsPage)
def get_results(
    project_id: int,
    execution_id: int,
    match_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN, APPROVER])),
):
    execution = execution_service.get_execution(db, execution_id, project_id)
    units, total = execution_service.get_results_grouped(
        db, execution_id, project_id, match_status, page, page_size
    )
    import json
    stats = json.loads(execution.stats) if execution.stats else None
    return ResultsPage(
        results=[],
        units=units,
        total=total,
        page=page,
        page_size=page_size,
        stats=stats,
    )


# ─── Promote execution → enterprise profile ───────────────────────────────────
from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional

class PromotePayload(_BaseModel):
    recon_type: _Optional[str] = "BANK_RECONCILIATION"
    risk_classification: _Optional[str] = "MEDIUM"
    preparer_id: _Optional[int] = None
    reviewer_id: _Optional[int] = None
    approver_id: _Optional[int] = None
    certifier_id: _Optional[int] = None


@router.post("/{execution_id}/promote", status_code=200)
def promote_execution(
    project_id: int,
    execution_id: int,
    payload: PromotePayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    """
    Promote a completed execution into the enterprise reconciliation layer.
    Creates: ReconciliationProfile, ReconciliationRecords, MatchGroups,
             ExceptionQueueRecords, CertificationWorkflow, FinancialCloseCalendar.
    """
    result = execution_service.promote_execution_to_profile(
        db=db,
        execution_id=execution_id,
        project_id=project_id,
        actor_id=current_user.id,
        recon_type=payload.recon_type or "BANK_RECONCILIATION",
        risk_classification=payload.risk_classification or "MEDIUM",
        preparer_id=payload.preparer_id,
        reviewer_id=payload.reviewer_id,
        approver_id=payload.approver_id,
        certifier_id=payload.certifier_id,
    )
    audit_service.log_action(
        db, "EXECUTION_PROMOTED",
        user_id=current_user.id,
        entity_type="execution",
        entity_id=execution_id,
        metadata=result,
        ip_address=request.client.host if request.client else None,
    )
    return result
