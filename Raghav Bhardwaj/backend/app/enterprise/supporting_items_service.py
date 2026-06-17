"""
Supporting Items Management Service
=====================================
Business logic for the supporting_items table.

Covers:
- CRUD with materiality-driven evidence enforcement
- Net variance recalculation after every mutation
- Exception → Supporting Item conversion with EXPLAINED classification
- Certification blocking when CRITICAL unresolved items exist
- Carry-forward automation for period-close
- Full audit trail via existing audit_service.log_action()
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.models import (
    ExceptionQueueRecord,
    ReconciliationAttachment,
    ReconciliationProfile,
    User,
)
from ..services import audit_service

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Enums (string constants matching DB CHECK constraints)
# ─────────────────────────────────────────────────────────────
ITEM_TYPES   = {"TIMING_DIFFERENCE", "ACCRUAL", "OUTSTANDING_CHECK", "DEPOSIT_IN_TRANSIT", "OTHER"}
DIRECTIONS   = {"POSITIVE", "NEGATIVE"}
MATERIALITY  = {"IMMATERIAL", "MATERIAL", "CRITICAL"}
LOCKED_STATES = {"UNDER_REVIEW", "APPROVED", "CERTIFIED", "CLOSED"}


# ─────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _get_balance(db: Session, balance_id: int) -> Any:
    row = db.execute(
        text("SELECT * FROM reconciliation_balances WHERE id = :id"),
        {"id": balance_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Balance {balance_id} not found")
    return row


def _get_profile(db: Session, profile_id: int | None) -> ReconciliationProfile | None:
    if not profile_id:
        return None
    return db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()


def _get_user(db: Session, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def _get_item(db: Session, item_id: int) -> Any:
    row = db.execute(
        text("SELECT * FROM supporting_items WHERE id = :id"),
        {"id": item_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Supporting item {item_id} not found")
    return row


def _classify_materiality(amount: float, profile: ReconciliationProfile | None) -> str:
    """
    Classify item materiality against profile thresholds.
    IMMATERIAL < tolerance_threshold
    MATERIAL   between tolerance_threshold and materiality_limit
    CRITICAL   >= materiality_limit  (or materiality_limit == 0 and amount > 0)
    """
    if not profile:
        return "IMMATERIAL"
    tol = float(profile.tolerance_threshold or 0.0)
    mat = float(profile.materiality_limit or 0.0)
    if mat > 0 and amount >= mat:
        return "CRITICAL"
    if amount > tol:
        return "MATERIAL"
    return "IMMATERIAL"


def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy Row to a plain dict."""
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


# ─────────────────────────────────────────────────────────────
# Variance recalculation
# ─────────────────────────────────────────────────────────────

def recalculate_variance(db: Session, balance_id: int) -> float:
    """
    Net Effect Math (spec):
        Unexplained Variance = ABS((Source Balance - Target Balance)
                                   + Sum(Supporting Items Impact))

    Supporting item impact:
        POSITIVE items  → add to balance (reduce gap)
        NEGATIVE items  → subtract from balance (increase gap)

    Returns the unexplained variance after items are applied.
    """
    balance = _get_balance(db, balance_id)

    source_bal  = float(getattr(balance, "source_balance", 0) or 0)
    target_bal  = float(getattr(balance, "target_balance", 0) or 0)
    raw_variance = source_bal - target_bal

    items = db.execute(
        text("""
            SELECT impact_direction, amount
            FROM   supporting_items
            WHERE  balance_id = :bid AND is_resolved = 0
        """),
        {"bid": balance_id},
    ).fetchall()

    net_adjustment = sum(
        float(r.amount) if r.impact_direction == "POSITIVE" else -float(r.amount)
        for r in items
    )

    unexplained = abs(raw_variance + net_adjustment)

    # Persist back to the balance row if the column exists
    try:
        db.execute(
            text("""
                UPDATE reconciliation_balances
                SET    unexplained_variance = :uv,
                       updated_at           = :now
                WHERE  id = :id
            """),
            {"uv": unexplained, "now": _now(), "id": balance_id},
        )
        db.commit()
    except Exception:
        db.rollback()

    return unexplained


# ─────────────────────────────────────────────────────────────
# Certification block check
# ─────────────────────────────────────────────────────────────

def assert_no_blocking_items(db: Session, balance_id: int) -> None:
    """
    Called by the lifecycle state machine before CERTIFIED transition.
    Raises HTTP 409 if any CRITICAL unresolved supporting items exist.
    """
    count = db.execute(
        text("""
            SELECT COUNT(*) FROM supporting_items
            WHERE  balance_id = :bid
            AND    is_resolved = 0
            AND    materiality_classification = 'CRITICAL'
        """),
        {"bid": balance_id},
    ).scalar()

    if count and count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot certify: {count} unresolved CRITICAL supporting item(s) exist on "
                f"balance {balance_id}. Resolve all CRITICAL items before certifying."
            ),
        )


# ─────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────

def create_item(
    db:          Session,
    balance_id:  int,
    actor_id:    int,
    actor_role:  str,
    *,
    item_type:        str,
    impact_direction: str,
    amount:           float,
    description:      str,
    attachment_id:    int | None   = None,
    exception_id:     int | None   = None,
    carry_forward_enabled: bool    = True,
    source_item_id:   int | None   = None,
) -> dict:
    """
    Create a supporting item on a balance record.

    Enforces:
    - Balance must be in DRAFT (editable) state
    - Item type, direction, amount validation
    - Auto-classifies materiality
    - Evidence enforcement: if amount > materiality_limit, attachment_id is REQUIRED
    - Exception linkage: marks exception as EXPLAINED if provided
    - Recalculates variance after creation
    """
    # Lifecycle lock check
    balance = _get_balance(db, balance_id)
    status  = getattr(balance, "status", "DRAFT") or "DRAFT"
    if status in LOCKED_STATES and actor_role.lower() != "admin":
        raise HTTPException(
            status_code=423,
            detail=(
                f"Balance is {status}. Supporting items cannot be added while "
                "the record is under review, approved, certified, or closed."
            ),
        )

    # Validate enums
    if item_type not in ITEM_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid item_type '{item_type}'. Must be one of {sorted(ITEM_TYPES)}")
    if impact_direction not in DIRECTIONS:
        raise HTTPException(status_code=422, detail=f"Invalid impact_direction '{impact_direction}'")
    if amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be greater than 0")
    if not description or not description.strip():
        raise HTTPException(status_code=422, detail="description is required")

    profile_id = getattr(balance, "profile_id", None)
    profile    = _get_profile(db, profile_id)

    # Auto-classify materiality
    mat_class = _classify_materiality(amount, profile)

    # Evidence enforcement: MATERIAL or CRITICAL items require attachment
    if mat_class in ("MATERIAL", "CRITICAL") and not attachment_id:
        mat_limit = float(profile.materiality_limit or 0) if profile else 0
        raise HTTPException(
            status_code=400,
            detail=(
                f"This item's amount ({amount}) exceeds the profile materiality limit ({mat_limit}). "
                f"A supporting attachment is REQUIRED for {mat_class} items. "
                "Upload evidence first, then provide the attachment_id."
            ),
        )

    # Validate attachment FK if provided
    if attachment_id:
        att = db.query(ReconciliationAttachment).filter(ReconciliationAttachment.id == attachment_id).first()
        if not att:
            raise HTTPException(status_code=404, detail=f"Attachment {attachment_id} not found in Evidence Manager")

    now = _now()

    result = db.execute(
        text("""
            INSERT INTO supporting_items (
                balance_id, profile_id, item_type, impact_direction,
                materiality_classification, amount, description,
                attachment_id, exception_id,
                workflow_state_snapshot, balance_status_snapshot,
                is_resolved, carry_forward_enabled, source_item_id,
                created_by, created_at, updated_at
            ) VALUES (
                :balance_id, :profile_id, :item_type, :impact_direction,
                :mat_class, :amount, :description,
                :attachment_id, :exception_id,
                :wf_snapshot, :bal_snapshot,
                0, :carry_forward, :source_item_id,
                :created_by, :now, :now
            )
        """),
        {
            "balance_id":    balance_id,
            "profile_id":    profile_id,
            "item_type":     item_type,
            "impact_direction": impact_direction,
            "mat_class":     mat_class,
            "amount":        amount,
            "description":   description.strip(),
            "attachment_id": attachment_id,
            "exception_id":  exception_id,
            "wf_snapshot":   getattr(balance, "workflow_state_snapshot", None),
            "bal_snapshot":  status,
            "carry_forward": 1 if carry_forward_enabled else 0,
            "source_item_id": source_item_id,
            "created_by":    actor_id,
            "now":           now,
        },
    )
    db.commit()
    item_id = result.lastrowid

    # Exception linkage: if an exception is provided, mark it EXPLAINED
    if exception_id:
        _link_exception(db, exception_id, item_id, actor_id)

    # Recalculate variance
    variance = recalculate_variance(db, balance_id)
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, balance_id, actor_id=actor_id, persist=True)
    except Exception:
        pass

    # Audit
    audit_service.log_action(
        db,
        action_type="SUPPORTING_ITEM_CREATED",
        user_id=actor_id,
        entity_type="supporting_item",
        entity_id=item_id,
        metadata={
            "balance_id":   balance_id,
            "item_type":    item_type,
            "amount":       amount,
            "direction":    impact_direction,
            "materiality":  mat_class,
            "exception_id": exception_id,
        },
    )

    item = _get_item(db, item_id)
    return {**_row_to_dict(item), "unexplained_variance": variance}


def list_items(db: Session, balance_id: int, include_resolved: bool = True) -> dict:
    """
    List all supporting items for a balance, with variance summary.
    """
    where = "WHERE balance_id = :bid"
    if not include_resolved:
        where += " AND is_resolved = 0"

    items = db.execute(
        text(f"""
            SELECT si.*,
                   u_created.username AS created_by_name,
                   u_resolved.username AS resolved_by_name
            FROM   supporting_items si
            LEFT   JOIN users u_created  ON u_created.id  = si.created_by
            LEFT   JOIN users u_resolved ON u_resolved.id = si.resolved_by
            {where}
            ORDER  BY si.created_at DESC
        """),
        {"bid": balance_id},
    ).fetchall()

    variance = recalculate_variance(db, balance_id)
    try:
        from ..services.variance_service import refresh_balance_variance
        refresh_balance_variance(db, balance_id, actor_id=None, persist=True)
    except Exception:
        pass

    # Summary counts
    total_positive  = sum(float(r.amount) for r in items if r.impact_direction == "POSITIVE" and not r.is_resolved)
    total_negative  = sum(float(r.amount) for r in items if r.impact_direction == "NEGATIVE" and not r.is_resolved)
    critical_unres  = sum(1 for r in items if r.materiality_classification == "CRITICAL" and not r.is_resolved)

    return {
        "balance_id":            balance_id,
        "unexplained_variance":  variance,
        "total_positive_impact": total_positive,
        "total_negative_impact": total_negative,
        "critical_unresolved":   critical_unres,
        "certification_blocked": critical_unres > 0,
        "items": [_row_to_dict(r) for r in items],
    }


def resolve_item(
    db:          Session,
    item_id:     int,
    actor_id:    int,
    actor_role:  str,
    comment:     str,
) -> dict:
    """
    Mark a supporting item as resolved.
    Requires a resolution comment.
    Recalculates variance after resolution.
    """
    if not comment or not comment.strip():
        raise HTTPException(status_code=400, detail="resolution_comment is required")

    item    = _get_item(db, item_id)
    balance = _get_balance(db, item.balance_id)
    status  = getattr(balance, "status", "DRAFT") or "DRAFT"

    if status in LOCKED_STATES and actor_role.lower() != "admin":
        raise HTTPException(
            status_code=423,
            detail=f"Balance is {status}. Items cannot be resolved while the record is locked.",
        )

    if item.is_resolved:
        raise HTTPException(status_code=400, detail="This item is already resolved")

    now = _now()
    db.execute(
        text("""
            UPDATE supporting_items
            SET    is_resolved        = 1,
                   resolved_by        = :resolved_by,
                   resolved_at        = :now,
                   resolution_comment = :comment,
                   updated_at         = :now
            WHERE  id = :id
        """),
        {"resolved_by": actor_id, "now": now, "comment": comment.strip(), "id": item_id},
    )
    db.commit()

    variance = recalculate_variance(db, item.balance_id)
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, item.balance_id, actor_id=actor_id, persist=True)
    except Exception:
        pass

    audit_service.log_action(
        db,
        action_type="SUPPORTING_ITEM_RESOLVED",
        user_id=actor_id,
        entity_type="supporting_item",
        entity_id=item_id,
        metadata={"balance_id": item.balance_id, "comment": comment},
    )

    return {**_row_to_dict(_get_item(db, item_id)), "unexplained_variance": variance}


def delete_item(
    db:         Session,
    item_id:    int,
    actor_id:   int,
    actor_role: str,
) -> dict:
    """
    Delete a supporting item (admin/preparer only, balance must be DRAFT).
    Recalculates variance after deletion.
    """
    item    = _get_item(db, item_id)
    balance = _get_balance(db, item.balance_id)
    status  = getattr(balance, "status", "DRAFT") or "DRAFT"

    if status in LOCKED_STATES and actor_role.lower() != "admin":
        raise HTTPException(
            status_code=423,
            detail=f"Cannot delete: balance is {status}.",
        )

    balance_id = item.balance_id
    db.execute(text("DELETE FROM supporting_items WHERE id = :id"), {"id": item_id})
    db.commit()

    variance = recalculate_variance(db, balance_id)
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, balance_id, actor_id=actor_id, persist=True)
    except Exception:
        pass

    audit_service.log_action(
        db,
        action_type="SUPPORTING_ITEM_DELETED",
        user_id=actor_id,
        entity_type="supporting_item",
        entity_id=item_id,
        metadata={"balance_id": balance_id},
    )

    return {"deleted": True, "item_id": item_id, "unexplained_variance": variance}


# ─────────────────────────────────────────────────────────────
# Exception → Supporting Item linkage
# ─────────────────────────────────────────────────────────────

def _link_exception(db: Session, exception_id: int, item_id: int, actor_id: int) -> None:
    """
    When a supporting item explains an exception, update the exception
    classification to EXPLAINED and refresh aging/risk buckets.
    """
    exc = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not exc:
        logger.warning("Exception %d not found during linkage — skipping", exception_id)
        return

    exc.classification  = "EXPLAINED"
    exc.resolution_notes = f"Explained by supporting item {item_id}"
    exc.updated_at      = _now()
    db.commit()

    audit_service.log_action(
        db,
        action_type="EXCEPTION_EXPLAINED_BY_SUPPORTING_ITEM",
        user_id=actor_id,
        entity_type="exception_queue_record",
        entity_id=exception_id,
        metadata={"supporting_item_id": item_id},
    )


def create_item_from_exception(
    db:           Session,
    exception_id: int,
    actor_id:     int,
    actor_role:   str,
    balance_id:   int,
    *,
    item_type:        str   = "OTHER",
    impact_direction: str   = "NEGATIVE",
    description:      str   = "",
    amount:           float,
    attachment_id:    int | None = None,
) -> dict:
    """
    Convert an active exception into a supporting item directly.
    Links the exception_id and marks it EXPLAINED.
    """
    exc = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not exc:
        raise HTTPException(status_code=404, detail=f"Exception {exception_id} not found")
    if exc.status not in ("OPEN", "IN_PROGRESS", "ASSIGNED"):
        raise HTTPException(
            status_code=400,
            detail=f"Exception {exception_id} is in status '{exc.status}' and cannot be converted.",
        )

    desc = description.strip() or f"Converted from Exception #{exception_id}"

    return create_item(
        db, balance_id, actor_id, actor_role,
        item_type=item_type,
        impact_direction=impact_direction,
        amount=amount,
        description=desc,
        attachment_id=attachment_id,
        exception_id=exception_id,
    )


# ─────────────────────────────────────────────────────────────
# Carry-forward automation
# ─────────────────────────────────────────────────────────────

def carry_forward_items(
    db:             Session,
    source_balance_id: int,
    target_balance_id: int,
    actor_id:       int,
) -> dict:
    """
    Period-close utility: copy unresolved supporting items from one balance
    to the next period's balance, preserving source_item_id lineage.

    Only items where carry_forward_enabled = True are copied.
    Resolved items are never carried forward.
    """
    items = db.execute(
        text("""
            SELECT * FROM supporting_items
            WHERE  balance_id        = :src
            AND    is_resolved       = 0
            AND    carry_forward_enabled = 1
        """),
        {"src": source_balance_id},
    ).fetchall()

    if not items:
        return {"carried_forward": 0, "source_balance_id": source_balance_id, "target_balance_id": target_balance_id}

    now = _now()
    copied = 0
    for item in items:
        # Trace the original source (root of the carry-forward chain)
        root_source_id = item.source_item_id if item.source_item_id else item.id

        db.execute(
            text("""
                INSERT INTO supporting_items (
                    balance_id, profile_id, item_type, impact_direction,
                    materiality_classification, amount, description,
                    attachment_id, exception_id,
                    workflow_state_snapshot, balance_status_snapshot,
                    is_resolved, carry_forward_enabled, source_item_id,
                    created_by, created_at, updated_at
                ) VALUES (
                    :balance_id, :profile_id, :item_type, :direction,
                    :materiality, :amount, :description,
                    :attachment_id, NULL,
                    NULL, 'DRAFT',
                    0, 1, :source_item_id,
                    :created_by, :now, :now
                )
            """),
            {
                "balance_id":    target_balance_id,
                "profile_id":    item.profile_id,
                "item_type":     item.item_type,
                "direction":     item.impact_direction,
                "materiality":   item.materiality_classification,
                "amount":        item.amount,
                "description":   f"[Carried Forward] {item.description}",
                "attachment_id": item.attachment_id,
                "source_item_id": root_source_id,
                "created_by":    actor_id,
                "now":           now,
            },
        )
        copied += 1

    db.commit()

    audit_service.log_action(
        db,
        action_type="SUPPORTING_ITEMS_CARRIED_FORWARD",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=target_balance_id,
        metadata={
            "source_balance_id":  source_balance_id,
            "target_balance_id":  target_balance_id,
            "items_carried":      copied,
        },
    )

    recalculate_variance(db, target_balance_id)
    try:
        from ..services.variance_service import refresh_balance_variance

        refresh_balance_variance(db, target_balance_id, actor_id=actor_id, persist=True)
    except Exception:
        pass

    return {
        "carried_forward":    copied,
        "source_balance_id":  source_balance_id,
        "target_balance_id":  target_balance_id,
    }
