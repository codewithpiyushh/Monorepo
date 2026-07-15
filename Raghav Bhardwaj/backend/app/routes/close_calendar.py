"""
backend/app/routes/close_calendar.py

Financial Close Calendar API — Phase 2, Chunk 3.
Mounted at /api/v1/close-calendar in main.py.

This is a NEW, separate API surface from your existing
/api/enterprise/close-calendar endpoints (which manage the per-profile
financial_close_calendar / CloseTask checklist rows). This router operates
on the new period-level ClosePeriod / ClosePeriodTask tables — see the
naming note in close_calendar_model_addition.py for the full rationale.

── RBAC mapping note ───────────────────────────────────────────────────
The spec calls for "Controllers/Admins → close oversight" and
"CFO → enterprise view" as permission tiers. Your system has six roles
(admin, preparer, reviewer, approver, certifier, auditor) — there is no
literal Controller or CFO role. This router maps:
    Controllers/Admins  → ADMIN          (create periods, close periods)
    CFO enterprise view → AUDITOR        (read-only across all periods)
    Preparers           → assigned tasks only (filtered by assigned_owner_id)
    Reviewers           → review queue (tasks in UNDER_REVIEW for their profiles)
If you later add dedicated Controller/CFO roles, swap the role_required()
lists below accordingly — nothing else needs to change.
─────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..services import close_calendar_service as svc
from ..services.close_calendar_schemas import (
    ClosePeriodListResponse,
    ClosePeriodCreateRequest,
    ClosePeriodCreateResponse,
    ClosePeriodTaskListResponse,
    TaskStatusUpdateRequest,
    ClosePeriodDashboardResponse,
    CloseReadinessResponse,
    ClosePeriodActionResponse,
)

router = APIRouter(prefix="/api/v1/close-calendar", tags=["close-calendar"])

ALL_ROLES = [ADMIN, PREPARER, APPROVER, CERTIFIER]
OVERSIGHT_ROLES = [ADMIN]


@router.get("/periods", response_model=ClosePeriodListResponse)
def get_periods(db: Session = Depends(get_db), current_user=Depends(role_required(ALL_ROLES))):
    """All close periods with live progress metrics. Visible to every role
    (preparers see read-only summaries; task-level filtering happens on the
    /tasks endpoint, not here)."""
    return svc.list_close_periods(db)


@router.get("/{period_id}/dashboard", response_model=ClosePeriodDashboardResponse)
def get_dashboard(period_id: int, db: Session = Depends(get_db),
                   current_user=Depends(role_required(ALL_ROLES))):
    try:
        return svc.get_period_dashboard(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{period_id}/tasks", response_model=ClosePeriodTaskListResponse)
def get_period_tasks(
    period_id: int,
    my_tasks_only: bool = Query(False, description="Preparers: filter to tasks assigned to me"),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(ALL_ROLES)),
):
    """Task drilldown grid. Preparers calling with my_tasks_only=true (or
    whose role is 'preparer') only ever see their own assigned tasks."""
    role = getattr(current_user, "role", "").lower()
    owner_id = current_user.id if (my_tasks_only or role == "preparer") else None
    return svc.list_period_tasks(db, period_id, owner_id=owner_id)


@router.patch("/tasks/{task_id}/status")
def patch_task_status(
    task_id: int,
    payload: TaskStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(ALL_ROLES)),
):
    """Update a task's status / completion %. Restricted to the assigned
    owner or an admin (enforced in the service layer)."""
    try:
        task = svc.update_task_status(
            db, task_id, payload.task_status, payload.completion_percentage, current_user
        )
        return {
            "id": task.id, "task_status": task.task_status,
            "completion_percentage": task.completion_percentage,
        }
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/create-period", response_model=ClosePeriodCreateResponse)
def create_period(
    payload: ClosePeriodCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(OVERSIGHT_ROLES)),
):
    """Admin/Controller only. Creates the period and auto-generates one
    ClosePeriodTask per active reconciliation profile (optionally scoped to
    a single project_id)."""
    try:
        return svc.create_close_period(db, payload, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{period_id}/validate-close", response_model=CloseReadinessResponse)
def validate_close(period_id: int, db: Session = Depends(get_db),
                    current_user=Depends(role_required(ALL_ROLES))):
    """Preview the full Close Readiness Validation without attempting to
    close — lets reviewers/admins see every blocker before the official
    PATCH /close attempt."""
    try:
        return svc.validate_close_readiness(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/{period_id}/close", response_model=ClosePeriodActionResponse)
def close_period(
    period_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(OVERSIGHT_ROLES)),
):
    """Admin/Controller only. Runs Close Readiness Validation and only
    transitions the period to CLOSED if every check passes. Returns 409
    with the full blocker list if validation fails."""
    try:
        return svc.close_period(db, period_id, current_user)
    except PermissionError as exc:
        # Validation failed — surface the detailed blocker list, not just a message
        validation = svc.validate_close_readiness(db, period_id)
        raise HTTPException(status_code=409, detail={
            "message": str(exc),
            "blockers": [b.model_dump() for b in validation["blockers"]],
        })
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
