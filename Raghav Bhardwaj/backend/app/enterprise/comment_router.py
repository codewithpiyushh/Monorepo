"""
/api/v1/balances/{id}/comments — Comment Threads Router
========================================================
Endpoints:
  GET  /api/v1/balances/{id}/comments          — list thread
  POST /api/v1/balances/{id}/comments          — post comment (immutable)
  POST /api/v1/balances/{id}/comments/{cid}/read — mark as read

No PATCH or DELETE endpoints exist — by design (SOX compliance).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, CERTIFIER, PREPARER
from .comment_service import (
    create_comment,
    list_comments,
    mark_read,
)

router = APIRouter(prefix="/api/v1/balances", tags=["comments"])

ALL_ROLES = [ADMIN, PREPARER, APPROVER, CERTIFIER]


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class CreateCommentRequest(BaseModel):
    content:           str            = Field(..., min_length=1, max_length=4000)
    comment_type:      str            = Field(default="DISCUSSION",
                                          description="DISCUSSION | QUESTION | RESPONSE | AUDITOR_NOTE")
    parent_comment_id: Optional[int]  = None
    attachment_id:     Optional[int]  = None


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/{balance_id}/comments")
def list_thread(
    balance_id:   int,
    comment_type: Optional[str] = Query(None, description="Filter by type: DISCUSSION | QUESTION | RESPONSE | SYSTEM_EVENT | AUDITOR_NOTE"),
    db:           Session       = Depends(get_db),
    current_user                = Depends(role_required(ALL_ROLES)),
):
    """
    Return all comments for a balance.
    Passing ?comment_type= filters to that type only (e.g. AUDITOR_NOTE).
    Automatically marks all comments as read for the requesting user.
    """
    return list_comments(
        db,
        balance_id   = balance_id,
        comment_type = comment_type,
        reader_id    = current_user.id,
    )


@router.post("/{balance_id}/comments", status_code=201)
def post_comment(
    balance_id:  int,
    payload:     CreateCommentRequest,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(ALL_ROLES)),
):
    """
    Post an immutable comment on a balance.
    CERTIFIED / CLOSED balances return HTTP 423 — thread is frozen.
    SYSTEM_EVENT type is rejected from this endpoint (system-only).
    @username mentions are extracted and notified automatically.
    No PATCH or DELETE endpoint exists — comments are permanent.
    """
    # Block human actors from posting SYSTEM_EVENT
    if payload.comment_type.upper() == "SYSTEM_EVENT":
        raise HTTPException(
            status_code=403,
            detail="SYSTEM_EVENT comments are generated automatically by the system.",
        )

    # AUDITOR_NOTE restricted to auditor/admin
    if payload.comment_type.upper() == "AUDITOR_NOTE" and current_user.role.lower() not in ("auditor", "admin"):
        raise HTTPException(
            status_code=403,
            detail="AUDITOR_NOTE comments can only be posted by the Auditor role.",
        )

    return create_comment(
        db,
        balance_id        = balance_id,
        author_id         = current_user.id,
        content           = payload.content,
        comment_type      = payload.comment_type,
        parent_comment_id = payload.parent_comment_id,
        attachment_id     = payload.attachment_id,
        is_system         = False,
    )


@router.post("/{balance_id}/comments/{comment_id}/read")
def mark_comment_read(
    balance_id:  int,
    comment_id:  int,
    db:          Session = Depends(get_db),
    current_user         = Depends(role_required(ALL_ROLES)),
):
    """Mark a specific comment as read for the current user."""
    return mark_read(db, comment_id, current_user.id)


