"""
backend/app/routes/aging.py

FastAPI router for the Exception Aging Analysis Engine.
Mounted at /api/v1/exceptions in main.py (alongside existing exception routes).

All existing exception endpoints remain untouched — these are additive.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..services import aging_service
from ..services.aging_schemas import (
    AgingSummaryResponse,
    AgingDetailsResponse,
    AgingTrendRow,
    EscalationResult,
    SnapshotResult,
)

router = APIRouter(tags=["aging-analysis"])

# ── Summary — four bucket KPIs ────────────────────────────────────────────────

@router.get("/aging-summary", response_model=AgingSummaryResponse)
def aging_summary(
    profile_id:          Optional[int]  = Query(None),
    owner_id:            Optional[int]  = Query(None),
    status:              Optional[str]  = Query(None),
    risk_classification: Optional[str]  = Query(None, description="LOW|MEDIUM|HIGH|CRITICAL"),
    date_from:           Optional[date] = Query(None),
    date_to:             Optional[date] = Query(None),
    include_resolved:    bool           = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """
    Four-bucket aging KPI summary.
    Preparers are automatically scoped to their own assigned exceptions.
    """
    return aging_service.get_aging_summary(
        db,
        profile_id          = profile_id,
        owner_id            = owner_id,
        status_filter       = status,
        risk_classification = risk_classification,
        date_from           = date_from,
        date_to             = date_to,
        include_resolved    = include_resolved,
        current_user        = current_user,
    )


# ── Details — filterable exception list with aging metadata ───────────────────

@router.get("/aging-details", response_model=AgingDetailsResponse)
def aging_details(
    bucket:              Optional[str]  = Query(None, description="CURRENT|WARNING|BREACH|CRITICAL"),
    profile_id:          Optional[int]  = Query(None),
    owner_id:            Optional[int]  = Query(None),
    status:              Optional[str]  = Query(None),
    risk_classification: Optional[str]  = Query(None),
    date_from:           Optional[date] = Query(None),
    date_to:             Optional[date] = Query(None),
    include_resolved:    bool           = Query(False),
    page:                int            = Query(1, ge=1),
    page_size:           int            = Query(50, ge=1, le=200),
    sort_by:             str            = Query("age_days"),
    sort_desc:           bool           = Query(True),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """
    Paginated exception list with age_days, bucket, bucket_color, and profile context.
    Clicking a KPI card in the UI calls this with ?bucket=WARNING etc.
    """
    return aging_service.get_aging_details(
        db,
        bucket              = bucket,
        profile_id          = profile_id,
        owner_id            = owner_id,
        status_filter       = status,
        risk_classification = risk_classification,
        date_from           = date_from,
        date_to             = date_to,
        include_resolved    = include_resolved,
        page                = page,
        page_size           = page_size,
        sort_by             = sort_by,
        sort_desc           = sort_desc,
        current_user        = current_user,
    )


# ── Trend — month-over-month bucket movement ──────────────────────────────────

@router.get("/aging-trend", response_model=list[AgingTrendRow])
def aging_trend(
    profile_id: Optional[int] = Query(None),
    months:     int            = Query(6, ge=2, le=24),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """
    Month-over-month aging trend. Uses snapshots for historical periods,
    live data for the current period.
    """
    return aging_service.get_aging_trend(db, profile_id=profile_id, months=months, current_user=current_user)


# ── Escalation trigger — can be called manually or by scheduler ───────────────

@router.post("/aging-escalate", response_model=EscalationResult)
def run_escalations(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    """
    Manually trigger the escalation engine.
    Also runs automatically via the APScheduler daily job.
    Admin only.
    """
    return aging_service.run_escalations(db, actor_id=current_user.id)


# ── Snapshot writer — called by scheduler monthly ─────────────────────────────

@router.post("/aging-snapshot", response_model=SnapshotResult)
def write_snapshot(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    """
    Write monthly aging snapshot for trend reporting.
    Idempotent — skips if current period already snapshotted.
    Admin only.
    """
    return aging_service.write_monthly_snapshot(db, actor_id=current_user.id)
