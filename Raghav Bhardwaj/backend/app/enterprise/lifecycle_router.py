"""
/api/v1/balances/{id}/workflow  — Phase 2 Lifecycle Router
==========================================================
All Phase 1 endpoints preserved.
New in Phase 2:
  GET  /api/v1/balances/{id}/chain-status     — live chain progress for UI stepper
  POST /api/v1/profiles/{id}/validate-chain   — SoD check before saving approval_chain_json
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, CERTIFIER, PREPARER
from .lifecycle_service import (
    approve_balance,
    assert_editable,
    assert_chain_unlocked,
    certify_balance,
    close_balance,
    get_chain_status,
    get_workflow_history,
    record_override,
    reject_balance,
    submit_balance,
    validate_chain_sod,
)

router = APIRouter(prefix="/api/v1/balances", tags=["lifecycle"])


# ─────────────────────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────────────────────

class SubmitRequest(BaseModel):
    submit_comment: str = Field(..., min_length=1)


class ApproveRequest(BaseModel):
    approval_comment: Optional[str] = None


class RejectRequest(BaseModel):
    rejection_comment: str = Field(..., min_length=1)


class CertifyRequest(BaseModel):
    certification_comment: Optional[str] = None


class OverrideRequest(BaseModel):
    reason: str = Field(..., min_length=5)


class ValidateChainRequest(BaseModel):
    approval_chain: list[dict] = Field(..., description="approval_chain_json array to validate")
    preparer_id:    Optional[int] = None
    certifier_id:   Optional[int] = None
    profile_id:     Optional[int] = None


# ─────────────────────────────────────────────────────────────
# Phase 1 endpoints (unchanged API surface)
# ─────────────────────────────────────────────────────────────

@router.post("/{balance_id}/workflow/submit")
def submit(
    balance_id:  int,
    payload:     SubmitRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([PREPARER, ADMIN])),
):
    """
    DRAFT → UNDER_REVIEW (or CERTIFIED via auto-certification if variance ≤ threshold).
    Auto-certification runs synchronously on submit, preserving full audit trail.
    """
    return submit_balance(
        db, balance_id=balance_id,
        actor_id=current_user.id, actor_role=current_user.role,
        comment=payload.submit_comment,
    )


@router.post("/{balance_id}/workflow/approve")
def approve(
    balance_id:  int,
    payload:     ApproveRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([APPROVER, ADMIN])),
):
    """
    Dynamic multi-level approval:
    - SEQUENTIAL: advances one tier per call
    - PARALLEL: collects approvals until quorum, then advances
    - Handles delegation transparently
    - Final tier transitions to APPROVED
    """
    return approve_balance(
        db, balance_id=balance_id,
        actor_id=current_user.id, actor_role=current_user.role,
        comment=payload.approval_comment,
    )


@router.post("/{balance_id}/workflow/reject")
def reject(
    balance_id:  int,
    payload:     RejectRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([APPROVER, CERTIFIER, ADMIN])),
):
    """
    ANY tier → DRAFT. Resets step_index to 0. Mandatory comment.
    """
    return reject_balance(
        db, balance_id=balance_id,
        actor_id=current_user.id, actor_role=current_user.role,
        comment=payload.rejection_comment,
    )


@router.post("/{balance_id}/workflow/certify")
def certify(
    balance_id:  int,
    payload:     CertifyRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([CERTIFIER, ADMIN])),
):
    """
    APPROVED → CERTIFIED. Applies immutable lock.
    Blocked by unresolved CRITICAL supporting items.
    """
    from .supporting_items_service import assert_no_blocking_items
    assert_no_blocking_items(db, balance_id)
    return certify_balance(
        db, balance_id=balance_id,
        actor_id=current_user.id, actor_role=current_user.role,
        comment=payload.certification_comment,
    )


@router.post("/{balance_id}/workflow/close")
def close(
    balance_id:  int,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([ADMIN])),
):
    return close_balance(db, balance_id=balance_id, actor_id=current_user.id, actor_role=current_user.role)


@router.post("/{balance_id}/workflow/override")
def controller_override(
    balance_id:  int,
    payload:     OverrideRequest,
    request:     Request,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([ADMIN, CERTIFIER])),
):
    record_override(db, balance_id, current_user.id, payload.reason)
    return {"balance_id": balance_id, "override_recorded": True, "reason": payload.reason}


@router.get("/{balance_id}/workflow-history")
def workflow_history(
    balance_id:  int,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([PREPARER, APPROVER, CERTIFIER, ADMIN])),
):
    return get_workflow_history(db, balance_id)


# ─────────────────────────────────────────────────────────────
# Phase 2 — new endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/{balance_id}/chain-status")
def chain_status(
    balance_id:  int,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([PREPARER, APPROVER, CERTIFIER, ADMIN])),
):
    """
    Returns live approval chain progress:
    tier definitions, completion state, parallel quorum, active tier,
    delegation info, and auto_certified flag for the UI stepper.
    """
    return get_chain_status(db, balance_id)


# Profiles router sub-endpoint (mounted separately in main.py if preferred)
profiles_router = APIRouter(prefix="/api/v1/profiles", tags=["profiles-v1"])


@profiles_router.post("/{profile_id}/validate-chain")
def validate_chain(
    profile_id:  int,
    payload:     ValidateChainRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required([ADMIN])),
):
    """
    SoD validation before saving approval_chain_json.
    Also checks chain is not locked mid-workflow.
    Call this from the profile edit modal before saving.
    """
    if payload.profile_id:
        assert_chain_unlocked(db, payload.profile_id)

    validate_chain_sod(
        db,
        preparer_id  = payload.preparer_id,
        certifier_id = payload.certifier_id,
        chain        = payload.approval_chain,
    )
    return {"valid": True, "tiers": len(payload.approval_chain)}
