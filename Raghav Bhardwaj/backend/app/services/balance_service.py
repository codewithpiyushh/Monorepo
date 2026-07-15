"""
backend/app/services/balance_service.py

Balance Reconciliation Engine — service layer.

Implements:
  - Variance calculation (absolute + percentage, divide-by-zero safe)
  - Auto-status determination against profile thresholds
  - Full state machine: DRAFT → UNDER_REVIEW → APPROVED → CERTIFIED
  - SOD enforcement reusing existing certification workflow patterns
  - Audit logging via existing audit_service
  - Risk score triggers via existing risk_scoring_engine
  - Notifications via existing UINotification model
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import (
    ReconciliationBalance,
    ReconciliationBalanceHistory,
    ReconciliationProfile,
    UINotification,
)
from ..services import audit_service


# ── Valid statuses ────────────────────────────────────────────────────────────
DRAFT            = "DRAFT"
BALANCED         = "BALANCED"
WITHIN_THRESHOLD = "WITHIN_THRESHOLD"
OUT_OF_BALANCE   = "OUT_OF_BALANCE"
UNDER_REVIEW     = "UNDER_REVIEW"
APPROVED         = "APPROVED"
CERTIFIED        = "CERTIFIED"
REJECTED         = "REJECTED"

EDITABLE_STATUSES  = {DRAFT, REJECTED}
SUBMITTABLE        = {DRAFT, REJECTED, BALANCED, WITHIN_THRESHOLD, OUT_OF_BALANCE}


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _compute_variance(source: float, target: float) -> tuple[float, float]:
    """
    Returns (variance_amount, variance_percentage).
    Guarded against divide-by-zero on source_balance == 0.
    """
    variance_amount = abs(source - target)
    if source != 0:
        variance_percentage = (variance_amount / abs(source)) * 100
    else:
        variance_percentage = 0.0
    return round(variance_amount, 4), round(variance_percentage, 4)


def _determine_balance_status(
    variance_amount: float,
    threshold_amount: float,
) -> str:
    """
    Determines the computed balance status from variance.
    Separate from workflow statuses (UNDER_REVIEW, APPROVED, etc.).
    """
    if variance_amount == 0:
        return BALANCED
    if variance_amount <= threshold_amount:
        return WITHIN_THRESHOLD
    return OUT_OF_BALANCE


def _append_history(
    db: Session,
    balance_id: int,
    actor_id: Optional[int],
    actor_role: Optional[str],
    action: str,
    from_status: Optional[str],
    to_status: Optional[str],
    source_balance: Optional[float],
    target_balance: Optional[float],
    variance_amount: Optional[float],
    comments: Optional[str],
) -> None:
    db.add(ReconciliationBalanceHistory(
        balance_id      = balance_id,
        actor_id        = actor_id,
        actor_role      = actor_role,
        action          = action,
        from_status     = from_status,
        to_status       = to_status,
        source_balance  = source_balance,
        target_balance  = target_balance,
        variance_amount = variance_amount,
        comments        = comments,
        created_at      = datetime.utcnow(),
    ))


def _notify(
    db: Session,
    user_id: Optional[int],
    notification_type: str,
    title: str,
    message: str,
    action_url: Optional[str] = None,
) -> None:
    """Push a UINotification to the existing notification center."""
    if not user_id:
        return
    db.add(UINotification(
        user_id           = user_id,
        notification_type = notification_type,
        title             = title,
        message           = message,
        icon_type         = "info",
        action_url        = action_url,
        is_read           = False,
        created_at        = datetime.utcnow(),
    ))


def _trigger_risk_rescore(db: Session, profile_id: int) -> None:
    """Fire-and-forget risk rescore — never raises, logs errors silently."""
    try:
        from ..services.risk_scoring_engine import score_profile
        score_profile(db, profile_id, persist=True)
    except Exception:
        pass


def _get_balance_or_404(db: Session, balance_id: int) -> ReconciliationBalance:
    balance = db.query(ReconciliationBalance).filter(
        ReconciliationBalance.id == balance_id
    ).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Reconciliation balance not found")
    return balance


def _get_profile_or_404(db: Session, profile_id: int) -> ReconciliationProfile:
    profile = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.id == profile_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Reconciliation profile not found")
    return profile


# ─────────────────────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────────────────────

def create_balance(
    db: Session,
    profile_id: int,
    period_key: str,
    source_balance: float,
    target_balance: float,
    comments: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    """
    Create a new balance reconciliation record for a profile + period.
    - Inherits threshold_amount and materiality_limit from the profile.
    - Inherits workflow ownership (preparer/reviewer/approver/certifier).
    - Enforces one record per profile per period (unique constraint).
    - Immediately calculates variance and status.
    """
    profile = _get_profile_or_404(db, profile_id)

    # Enforce uniqueness at service level for clear error messages
    existing = db.query(ReconciliationBalance).filter(
        ReconciliationBalance.profile_id == profile_id,
        ReconciliationBalance.period_key == period_key,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A balance record already exists for profile {profile_id} / period {period_key}. "
                   f"Use PATCH /api/v1/balances/{existing.id} to update it."
        )

    variance_amount, variance_percentage = _compute_variance(source_balance, target_balance)
    computed_status = _determine_balance_status(
        variance_amount, float(profile.tolerance_threshold or 0)
    )

    balance = ReconciliationBalance(
        profile_id          = profile_id,
        period_key          = period_key,
        source_balance      = source_balance,
        target_balance      = target_balance,
        variance_amount     = variance_amount,
        variance_percentage = variance_percentage,
        threshold_amount    = float(profile.tolerance_threshold or 0),
        materiality_limit   = float(profile.materiality_limit or 0),
        status              = computed_status,
        comments            = comments,
        # Inherit ownership
        preparer_id         = profile.assigned_preparer,
        reviewer_id         = profile.assigned_reviewer,
        approver_id         = profile.assigned_approver,
        certifier_id        = profile.assigned_certifier,
        created_by          = actor_id,
        updated_by          = actor_id,
        created_at          = datetime.utcnow(),
        updated_at          = datetime.utcnow(),
    )
    db.add(balance)
    db.flush()

    _append_history(
        db, balance.id, actor_id, "preparer", "CREATE",
        None, computed_status,
        source_balance, target_balance, variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_CREATED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={
            "profile_id": profile_id,
            "period_key": period_key,
            "variance_amount": variance_amount,
            "status": computed_status,
        },
    )

    db.commit()
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, balance.id, actor_id=actor_id, persist=True)
    except Exception:
        pass
    db.refresh(balance)

    # Notify preparer if someone else created it (e.g. admin)
    if actor_id and actor_id != balance.preparer_id:
        _notify(
            db, balance.preparer_id,
            "workflow",
            "Balance Reconciliation Assigned",
            f"A balance reconciliation for period {period_key} has been created and assigned to you.",
            action_url=f"/balance-reconciliation/{balance.id}",
        )
        db.commit()

    return balance


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE (preparer only, editable statuses)
# ─────────────────────────────────────────────────────────────────────────────

def update_balance(
    db: Session,
    balance_id: int,
    source_balance: Optional[float],
    target_balance: Optional[float],
    comments: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    """
    Update balances and/or comments.
    Recalculates variance and resets computed status automatically.
    Only allowed in DRAFT, REJECTED states.
    """
    balance = _get_balance_or_404(db, balance_id)

    if balance.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Balance cannot be edited in '{balance.status}' status. "
                   f"Editable states: {sorted(EDITABLE_STATUSES)}"
        )

    previous_status = balance.status
    new_source = source_balance if source_balance is not None else balance.source_balance
    new_target = target_balance if target_balance is not None else balance.target_balance

    variance_amount, variance_percentage = _compute_variance(new_source, new_target)
    computed_status = _determine_balance_status(variance_amount, balance.threshold_amount)

    balance.source_balance      = new_source
    balance.target_balance      = new_target
    balance.variance_amount     = variance_amount
    balance.variance_percentage = variance_percentage
    balance.status              = computed_status
    balance.updated_by          = actor_id
    balance.updated_at          = datetime.utcnow()
    if comments is not None:
        balance.comments = comments

    _append_history(
        db, balance.id, actor_id, "preparer", "UPDATE",
        previous_status, computed_status,
        new_source, new_target, variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_UPDATED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={
            "variance_amount": variance_amount,
            "variance_percentage": variance_percentage,
            "new_status": computed_status,
        },
    )

    db.commit()
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, balance.id, actor_id=actor_id, persist=True)
    except Exception:
        pass
    db.refresh(balance)

    # Trigger risk rescore if variance exceeds materiality
    if variance_amount > balance.materiality_limit:
        _trigger_risk_rescore(db, balance.profile_id)

    return balance


# ─────────────────────────────────────────────────────────────────────────────
# DELETE (preparer, DRAFT only)
# ─────────────────────────────────────────────────────────────────────────────

def delete_balance(
    db: Session,
    balance_id: int,
    actor_id: Optional[int],
) -> dict:
    balance = _get_balance_or_404(db, balance_id)

    if balance.status != DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Only DRAFT records can be deleted. Current status: '{balance.status}'"
        )

    audit_service.log_action(
        db, "BALANCE_DELETED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance_id,
        metadata={"profile_id": balance.profile_id, "period_key": balance.period_key},
    )

    db.delete(balance)
    db.commit()
    return {"deleted": True, "balance_id": balance_id}


# ─────────────────────────────────────────────────────────────────────────────
# SUBMIT FOR REVIEW (preparer)
# ─────────────────────────────────────────────────────────────────────────────

def submit_balance(
    db: Session,
    balance_id: int,
    comments: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    balance = _get_balance_or_404(db, balance_id)

    if balance.status not in SUBMITTABLE:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit from '{balance.status}'. "
                   f"Allowed: {sorted(SUBMITTABLE)}"
        )

    try:
        from ..services.variance_service import check_explanation_required, refresh_balance_variance

        refresh_balance_variance(db, balance.id, actor_id=actor_id, persist=True)
        db.refresh(balance)
        if check_explanation_required(balance):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Submission blocked: this reconciliation is classified as "
                    f"'{balance.variance_severity_classification}' which requires a "
                    f"Root Cause Narrative before submission. "
                    f"Please complete PATCH /api/v1/balances/{balance.id}/explanation first."
                ),
            )
    except HTTPException:
        raise
    except Exception:
        pass

    # SOD: actor must be the assigned preparer (or admin bypasses via role check at route)
    if actor_id and balance.preparer_id and actor_id != balance.preparer_id:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned preparer can submit this balance reconciliation."
        )

    previous_status = balance.status
    balance.status       = UNDER_REVIEW
    balance.submitted_at = datetime.utcnow()
    balance.updated_by   = actor_id
    balance.updated_at   = datetime.utcnow()
    if comments:
        balance.comments = comments

    _append_history(
        db, balance.id, actor_id, "preparer", "SUBMIT",
        previous_status, UNDER_REVIEW,
        balance.source_balance, balance.target_balance,
        balance.variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_SUBMITTED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={"period_key": balance.period_key, "variance_amount": balance.variance_amount},
    )

    # Notify reviewer
    _notify(
        db, balance.reviewer_id,
        "workflow",
        "Balance Reconciliation Review Required",
        f"A balance reconciliation for period {balance.period_key} has been submitted for your review. "
        f"Variance: {balance.variance_amount:.2f}",
        action_url=f"/balance-reconciliation/{balance.id}",
    )

    db.commit()
    db.refresh(balance)
    return balance


# ─────────────────────────────────────────────────────────────────────────────
# APPROVE (approver)
# ─────────────────────────────────────────────────────────────────────────────

def approve_balance(
    db: Session,
    balance_id: int,
    comments: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    balance = _get_balance_or_404(db, balance_id)

    if balance.status != UNDER_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Balance must be UNDER_REVIEW to approve. Current: '{balance.status}'"
        )

    # SOD: approver must not be the same person who submitted (preparer)
    if actor_id and actor_id == balance.preparer_id:
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: the preparer cannot approve their own submission."
        )

    # SOD: approver must be the assigned approver (or admin)
    if actor_id and balance.approver_id and actor_id != balance.approver_id:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned approver can approve this balance reconciliation."
        )

    previous_status   = balance.status
    balance.status    = APPROVED
    balance.approved_at = datetime.utcnow()
    balance.updated_by  = actor_id
    balance.updated_at  = datetime.utcnow()
    if comments:
        balance.comments = comments

    _append_history(
        db, balance.id, actor_id, "approver", "APPROVE",
        previous_status, APPROVED,
        balance.source_balance, balance.target_balance,
        balance.variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_APPROVED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={"period_key": balance.period_key},
    )

    # Notify certifier
    _notify(
        db, balance.certifier_id,
        "workflow",
        "Balance Reconciliation Certification Required",
        f"A balance reconciliation for period {balance.period_key} has been approved and is ready for certification.",
        action_url=f"/balance-reconciliation/{balance.id}",
    )

    db.commit()
    db.refresh(balance)
    return balance


# ─────────────────────────────────────────────────────────────────────────────
# REJECT (reviewer or approver → returns to preparer)
# ─────────────────────────────────────────────────────────────────────────────

def reject_balance(
    db: Session,
    balance_id: int,
    comments: Optional[str],
    actor_id: Optional[int],
    actor_role: Optional[str],
) -> ReconciliationBalance:
    balance = _get_balance_or_404(db, balance_id)

    if balance.status not in {UNDER_REVIEW, APPROVED}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject from '{balance.status}'. Allowed: UNDER_REVIEW, APPROVED"
        )

    if not comments or not comments.strip():
        raise HTTPException(
            status_code=400,
            detail="Rejection reason (comments) is mandatory."
        )

    # SOD: submitter cannot reject their own submission
    if actor_id and actor_id == balance.preparer_id:
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: the preparer cannot reject their own submission."
        )

    previous_status = balance.status
    # Rejection resets to DRAFT + recomputes the balance status for the computed fields
    computed_status = _determine_balance_status(
        balance.variance_amount or 0, balance.threshold_amount
    )
    balance.status    = REJECTED
    balance.updated_by = actor_id
    balance.updated_at = datetime.utcnow()
    balance.comments   = comments

    _append_history(
        db, balance.id, actor_id, actor_role, "REJECT",
        previous_status, REJECTED,
        balance.source_balance, balance.target_balance,
        balance.variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_REJECTED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={"period_key": balance.period_key, "reason": comments},
    )

    # Return ownership to preparer — notify them
    _notify(
        db, balance.preparer_id,
        "workflow",
        "Balance Reconciliation Rejected",
        f"Your balance reconciliation for period {balance.period_key} was rejected. "
        f"Reason: {comments}",
        action_url=f"/balance-reconciliation/{balance.id}",
    )

    db.commit()
    db.refresh(balance)

    # Rejection triggers risk rescore
    _trigger_risk_rescore(db, balance.profile_id)

    return balance


# ─────────────────────────────────────────────────────────────────────────────
# CERTIFY (certifier)
# ─────────────────────────────────────────────────────────────────────────────

def certify_balance(
    db: Session,
    balance_id: int,
    comments: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    balance = _get_balance_or_404(db, balance_id)

    if balance.status != APPROVED:
        raise HTTPException(
            status_code=400,
            detail=f"Balance must be APPROVED before certification. Current: '{balance.status}'"
        )

    # SOD: certifier must be distinct from preparer, reviewer, approver
    if actor_id in {balance.preparer_id, balance.reviewer_id, balance.approver_id}:
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: certifier must be different from preparer, reviewer, and approver."
        )

    if actor_id and balance.certifier_id and actor_id != balance.certifier_id:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned certifier can certify this balance reconciliation."
        )

    previous_status     = balance.status
    balance.status      = CERTIFIED
    balance.certified_at = datetime.utcnow()
    balance.updated_by   = actor_id
    balance.updated_at   = datetime.utcnow()
    if comments:
        balance.comments = comments

    _append_history(
        db, balance.id, actor_id, "certifier", "CERTIFY",
        previous_status, CERTIFIED,
        balance.source_balance, balance.target_balance,
        balance.variance_amount, comments,
    )

    audit_service.log_action(
        db, "BALANCE_CERTIFIED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance.id,
        metadata={"period_key": balance.period_key},
    )

    db.commit()
    db.refresh(balance)
    return balance


# ─────────────────────────────────────────────────────────────────────────────
# GET / LIST
# ─────────────────────────────────────────────────────────────────────────────

def get_balance(db: Session, balance_id: int) -> ReconciliationBalance:
    return _get_balance_or_404(db, balance_id)


def get_balance_history(db: Session, balance_id: int) -> list:
    _get_balance_or_404(db, balance_id)   # 404 guard
    return (
        db.query(ReconciliationBalanceHistory)
        .filter(ReconciliationBalanceHistory.balance_id == balance_id)
        .order_by(ReconciliationBalanceHistory.created_at.asc())
        .all()
    )


def list_balances(
    db: Session,
    *,
    profile_id: Optional[int]   = None,
    period_key: Optional[str]   = None,
    status: Optional[str]       = None,
    assigned_user_id: Optional[int] = None,
    risk_classification: Optional[str] = None,
    page: int                   = 1,
    page_size: int              = 50,
    sort_by: str                = "created_at",
    sort_desc: bool             = True,
) -> tuple[list, int]:
    """
    Paginated list with filtering and sorting.
    Supports filters: profile_id, period_key, status, assigned_user_id,
    risk_classification (joined from profile).
    """
    from sqlalchemy import desc, asc

    q = db.query(ReconciliationBalance)

    if profile_id is not None:
        q = q.filter(ReconciliationBalance.profile_id == profile_id)

    if period_key:
        q = q.filter(ReconciliationBalance.period_key == period_key)

    if status:
        # Support comma-separated multi-status filter
        statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            q = q.filter(ReconciliationBalance.status == statuses[0])
        else:
            q = q.filter(ReconciliationBalance.status.in_(statuses))

    if assigned_user_id is not None:
        q = q.filter(
            (ReconciliationBalance.preparer_id == assigned_user_id) |
            (ReconciliationBalance.reviewer_id == assigned_user_id) |
            (ReconciliationBalance.approver_id == assigned_user_id) |
            (ReconciliationBalance.certifier_id == assigned_user_id)
        )

    if risk_classification:
        # Join to profile for risk filter
        q = q.join(
            ReconciliationProfile,
            ReconciliationBalance.profile_id == ReconciliationProfile.id
        ).filter(
            ReconciliationProfile.risk_classification == risk_classification.upper()
        )

    total = q.count()

    # Sorting
    sort_col = getattr(ReconciliationBalance, sort_by, ReconciliationBalance.created_at)
    q = q.order_by(desc(sort_col) if sort_desc else asc(sort_col))

    balances = q.offset((page - 1) * page_size).limit(page_size).all()
    return balances, total


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

def get_balance_dashboard(db: Session, user_id: Optional[int] = None) -> dict:
    """
    Dashboard widget data — counts per status + total variance.
    Scoped to user's assigned balances if user_id provided.
    """
    q = db.query(ReconciliationBalance)
    if user_id:
        q = q.filter(
            (ReconciliationBalance.preparer_id == user_id) |
            (ReconciliationBalance.reviewer_id == user_id) |
            (ReconciliationBalance.approver_id == user_id) |
            (ReconciliationBalance.certifier_id == user_id)
        )

    all_balances = q.all()
    total = len(all_balances)

    counts = {
        "total":               total,
        "balanced":            sum(1 for b in all_balances if b.status in {BALANCED, WITHIN_THRESHOLD}),
        "out_of_balance":      sum(1 for b in all_balances if b.status == OUT_OF_BALANCE),
        "pending_review":      sum(1 for b in all_balances if b.status == UNDER_REVIEW),
        "pending_approval":    sum(1 for b in all_balances if b.status == UNDER_REVIEW),
        "pending_certification": sum(1 for b in all_balances if b.status == APPROVED),
        "certified":           sum(1 for b in all_balances if b.status == CERTIFIED),
        "rejected":            sum(1 for b in all_balances if b.status == REJECTED),
        "high_risk":           0,   # computed below
    }

    total_variance = sum(float(b.variance_amount or 0) for b in all_balances)
    materiality_breaches = [
        b for b in all_balances
        if (b.variance_amount or 0) > (b.materiality_limit or 0) and b.materiality_limit > 0
    ]
    counts["high_risk"]       = len(materiality_breaches)
    counts["total_variance"]  = round(total_variance, 2)

    return counts
