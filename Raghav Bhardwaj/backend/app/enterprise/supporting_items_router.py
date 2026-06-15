"""
/api/v1/supporting-items — Supporting Items Router
===================================================
Endpoints:
  GET    /api/v1/supporting-items?balance_id=&include_resolved=
  POST   /api/v1/supporting-items
  POST   /api/v1/supporting-items/from-exception
  POST   /api/v1/supporting-items/carry-forward
  DELETE /api/v1/supporting-items/{item_id}
  POST   /api/v1/supporting-items/{item_id}/resolve
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, AUDITOR, CERTIFIER, PREPARER, REVIEWER
from .supporting_items_service import (
    assert_no_blocking_items,
    carry_forward_items,
    create_item,
    create_item_from_exception,
    delete_item,
    list_items,
    resolve_item,
)

router = APIRouter(prefix="/api/v1/supporting-items", tags=["supporting-items"])

ALL_ROLES = [ADMIN, PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR]
WRITE_ROLES = [ADMIN, PREPARER]


# ─────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────

class CreateItemRequest(BaseModel):
    balance_id:        int
    item_type:         str = Field(..., description="TIMING_DIFFERENCE | ACCRUAL | OUTSTANDING_CHECK | DEPOSIT_IN_TRANSIT | OTHER")
    impact_direction:  str = Field(..., description="POSITIVE | NEGATIVE")
    amount:            float = Field(..., gt=0)
    description:       str = Field(..., min_length=1)
    attachment_id:     Optional[int] = None
    exception_id:      Optional[int] = None
    carry_forward_enabled: bool = True
    source_item_id:    Optional[int] = None


class ResolveRequest(BaseModel):
    resolution_comment: str = Field(..., min_length=1)


class FromExceptionRequest(BaseModel):
    exception_id:      int
    balance_id:        int
    item_type:         str   = "OTHER"
    impact_direction:  str   = "NEGATIVE"
    amount:            float = Field(..., gt=0)
    description:       str   = ""
    attachment_id:     Optional[int] = None


class CarryForwardRequest(BaseModel):
    source_balance_id: int
    target_balance_id: int


class CertifyBlockCheckRequest(BaseModel):
    balance_id: int


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("")
def list_supporting_items(
    balance_id:       int  = Query(..., description="Balance record ID"),
    include_resolved: bool = Query(default=True, description="Include resolved items"),
    db:               Session = Depends(get_db),
    current_user              = Depends(role_required(ALL_ROLES)),
):
    """
    List all supporting items for a balance, with variance summary.
    Returns: items[], unexplained_variance, certification_blocked flag.
    """
    return list_items(db, balance_id, include_resolved=include_resolved)


@router.post("", status_code=201)
def create_supporting_item(
    payload:     CreateItemRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(WRITE_ROLES)),
):
    """
    Create a supporting item on a DRAFT balance.
    Enforces materiality evidence gate and lifecycle lock.
    Auto-classifies materiality. Recalculates unexplained variance.
    """
    return create_item(
        db,
        balance_id        = payload.balance_id,
        actor_id          = current_user.id,
        actor_role        = current_user.role,
        item_type         = payload.item_type,
        impact_direction  = payload.impact_direction,
        amount            = payload.amount,
        description       = payload.description,
        attachment_id     = payload.attachment_id,
        exception_id      = payload.exception_id,
        carry_forward_enabled = payload.carry_forward_enabled,
        source_item_id    = payload.source_item_id,
    )


@router.post("/from-exception", status_code=201)
def create_from_exception(
    payload:     FromExceptionRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(WRITE_ROLES)),
):
    """
    Convert an active exception directly into a supporting item.
    Marks the exception as EXPLAINED and recalculates variance.
    Used by the "Add from Exception" side panel in the UI.
    """
    return create_item_from_exception(
        db,
        exception_id      = payload.exception_id,
        actor_id          = current_user.id,
        actor_role        = current_user.role,
        balance_id        = payload.balance_id,
        item_type         = payload.item_type,
        impact_direction  = payload.impact_direction,
        description       = payload.description,
        amount            = payload.amount,
        attachment_id     = payload.attachment_id,
    )


@router.post("/{item_id}/resolve")
def resolve_supporting_item(
    item_id:     int,
    payload:     ResolveRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(WRITE_ROLES)),
):
    """
    Mark a supporting item as resolved with a mandatory comment.
    Triggers variance recalculation. Balance must be in DRAFT.
    Used for carry-forward items from previous periods.
    """
    return resolve_item(
        db,
        item_id    = item_id,
        actor_id   = current_user.id,
        actor_role = current_user.role,
        comment    = payload.resolution_comment,
    )


@router.delete("/{item_id}")
def delete_supporting_item(
    item_id:     int,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(WRITE_ROLES)),
):
    """
    Delete a supporting item. Balance must be in DRAFT.
    Triggers variance recalculation.
    """
    return delete_item(
        db,
        item_id    = item_id,
        actor_id   = current_user.id,
        actor_role = current_user.role,
    )


@router.post("/carry-forward")
def carry_forward(
    payload:     CarryForwardRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([ADMIN, CERTIFIER])),
):
    """
    Period-close utility: copy unresolved carry-forward items to the
    next period's balance. Preserves source_item_id audit lineage.
    Admin or Certifier only.
    """
    return carry_forward_items(
        db,
        source_balance_id = payload.source_balance_id,
        target_balance_id = payload.target_balance_id,
        actor_id          = current_user.id,
    )


@router.post("/certify-block-check")
def certify_block_check(
    payload:     CertifyBlockCheckRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([ADMIN, CERTIFIER])),
):
    """
    Pre-flight check before certifying a balance.
    Raises HTTP 409 if CRITICAL unresolved items exist.
    Called automatically by lifecycle_service.certify_balance().
    Can also be called explicitly from the UI before showing "Certify" button.
    """
    assert_no_blocking_items(db, payload.balance_id)
    return {"balance_id": payload.balance_id, "certification_blocked": False}
