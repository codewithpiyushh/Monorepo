"""
backend/app/routes/balances.py

FastAPI router for the Balance Reconciliation Engine.
Mounted at /api/v1/balances in main.py.

RBAC:
  Preparer  → Create / Edit / Delete(DRAFT) / Submit
  Reviewer  → (list/view only — approve is Approver role per SOD)
  Approver  → Approve / Reject
  Certifier → Certify
  Admin     → All actions
  Auditor   → Read-only
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..services import balance_service
from ..services.balance_schemas import (
    BalanceCreate,
    BalanceUpdate,
    BalanceActionRequest,
    BalanceOut,
    BalanceListPage,
    BalanceDashboard,
    BalanceHistoryOut,
)

router = APIRouter(prefix="/api/v1/balances", tags=["balance-reconciliation"])


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=BalanceDashboard)
def balance_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """Summary KPI widgets for the Balance Reconciliation workspace."""
    # Auditor and admin see all; others see their assigned records
    scoped_user_id = (
        None
        if (current_user.role or "").lower() in {"admin", "auditor"}
        else current_user.id
    )
    return balance_service.get_balance_dashboard(db, user_id=scoped_user_id)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=BalanceListPage)
def list_balances(
    profile_id:          Optional[int]  = Query(None),
    period_key:          Optional[str]  = Query(None),
    status:              Optional[str]  = Query(None, description="Single or comma-separated: DRAFT,UNDER_REVIEW"),
    assigned_user_id:    Optional[int]  = Query(None),
    risk_classification: Optional[str]  = Query(None, description="LOW|MEDIUM|HIGH|CRITICAL"),
    page:                int            = Query(1, ge=1),
    page_size:           int            = Query(50, ge=1, le=200),
    sort_by:             str            = Query("created_at"),
    sort_desc:           bool           = Query(True),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """
    Paginated, filterable list of balance reconciliation records.
    Preparers automatically scoped to their own assigned records.
    """
    # Role-based scoping: preparer sees only their own
    effective_assigned = assigned_user_id
    if (current_user.role or "").lower() == PREPARER and assigned_user_id is None:
        effective_assigned = current_user.id

    items, total = balance_service.list_balances(
        db,
        profile_id          = profile_id,
        period_key          = period_key,
        status              = status,
        assigned_user_id    = effective_assigned,
        risk_classification = risk_classification,
        page                = page,
        page_size           = page_size,
        sort_by             = sort_by,
        sort_desc           = sort_desc,
    )
    return BalanceListPage(items=items, total=total, page=page, page_size=page_size)


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{balance_id}", response_model=BalanceOut)
def get_balance(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    return balance_service.get_balance(db, balance_id)


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/{balance_id}/history", response_model=list[BalanceHistoryOut])
def get_balance_history(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    return balance_service.get_balance_history(db, balance_id)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=BalanceOut, status_code=201)
def create_balance(
    payload: BalanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return balance_service.create_balance(
        db,
        profile_id     = payload.profile_id,
        period_key     = payload.period_key,
        source_balance = payload.source_balance,
        target_balance = payload.target_balance,
        comments       = payload.comments,
        actor_id       = current_user.id,
    )


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{balance_id}", response_model=BalanceOut)
def update_balance(
    balance_id: int,
    payload: BalanceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return balance_service.update_balance(
        db,
        balance_id     = balance_id,
        source_balance = payload.source_balance,
        target_balance = payload.target_balance,
        comments       = payload.comments,
        actor_id       = current_user.id,
    )


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{balance_id}", status_code=204)
def delete_balance(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    balance_service.delete_balance(db, balance_id, actor_id=current_user.id)


# ── Submit ────────────────────────────────────────────────────────────────────

@router.post("/{balance_id}/submit", response_model=BalanceOut)
def submit_balance(
    balance_id: int,
    payload: BalanceActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return balance_service.submit_balance(
        db, balance_id,
        comments = payload.comments,
        actor_id = current_user.id,
    )


# ── Approve ───────────────────────────────────────────────────────────────────

@router.post("/{balance_id}/approve", response_model=BalanceOut)
def approve_balance(
    balance_id: int,
    payload: BalanceActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER])),
):
    return balance_service.approve_balance(
        db, balance_id,
        comments = payload.comments,
        actor_id = current_user.id,
    )


# ── Reject ────────────────────────────────────────────────────────────────────

@router.post("/{balance_id}/reject", response_model=BalanceOut)
def reject_balance(
    balance_id: int,
    payload: BalanceActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER])),
):
    return balance_service.reject_balance(
        db, balance_id,
        comments   = payload.comments,
        actor_id   = current_user.id,
        actor_role = current_user.role,
    )


# ── Certify ───────────────────────────────────────────────────────────────────

@router.post("/{balance_id}/certify", response_model=BalanceOut)
def certify_balance(
    balance_id: int,
    payload: BalanceActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, CERTIFIER])),
):
    return balance_service.certify_balance(
        db, balance_id,
        comments = payload.comments,
        actor_id = current_user.id,
    )
