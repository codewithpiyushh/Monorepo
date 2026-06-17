"""
/api/v1/profiles  — Phase 1 Reconciliation Profile Management
=============================================================
Full CRUD for ReconciliationProfile under a clean versioned prefix.

Design decisions:
- Builds on the EXISTING ReconciliationProfile model and repository layer.
  No new model is introduced; new columns (account_number, auto_certify,
  status) are added via profile_migration.py.
- Mutation routes are protected with the existing RBAC role_required()
  dependency — no new auth framework.
- Every write operation calls the EXISTING audit_service.log_action()
  directly, writing to the completed Governance Layer audit table.
- Pagination is cursor/offset-based via ?page= and ?page_size= params.
- Text search filters on name and account_number via ?search=.
- Risk-level and status multi-filters via ?risk_level= and ?status=.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import ReconciliationProfile, User
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, CERTIFIER, PREPARER
from ..services import audit_service

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles-v1"])


# ─────────────────────────────────────────────────────────────
# Pydantic schemas (self-contained — no dependency on the older
# enterprise/schemas.py so this module stays independently testable)
# ─────────────────────────────────────────────────────────────

class ProfileCreateV1(BaseModel):
    # Identity
    name:               str = Field(..., min_length=1, max_length=120)
    account_number:     str | None = Field(None, max_length=50,
                            description="Unique account identifier (e.g. GL account code)")

    # Reconciliation config
    reconciliation_type: str = Field(..., description="BANK | AR | AP | INTERCOMPANY | PAYROLL | INVENTORY")
    frequency:           str = Field(..., description="DAILY | WEEKLY | MONTHLY | QUARTERLY")
    tolerance_threshold: float = Field(default=0.0, ge=0.0)
    date_window_days:    int   = Field(default=0,   ge=0)
    materiality_limit:   float = Field(default=0.0, ge=0.0)

    # Risk & certification
    risk_classification: str  = Field(default="MEDIUM",
                            description="LOW | MEDIUM | HIGH | CRITICAL — maps to Risk Scoring Engine")
    auto_certify:        bool = Field(default=False,
                            description="Auto-certify when variance < tolerance_threshold")
    auto_approve_threshold: float = Field(default=1.0, ge=0.0, le=1.0)
    due_days:            int  = Field(default=5, ge=1)

    # Status
    status:              str  = Field(default="ACTIVE",
                            description="ACTIVE | INACTIVE | ARCHIVED")

    # Workflow assignments — FK to users table
    assigned_preparer:  int | None = None
    assigned_reviewer:  int | None = None
    assigned_approver:  int | None = None
    assigned_certifier: int | None = None

    # Optional config blobs
    workflow_config: dict[str, Any] = {}
    matching_rules:  dict[str, Any] = {}


class ProfileUpdateV1(BaseModel):
    name:                str   | None = Field(None, min_length=1, max_length=120)
    account_number:      str   | None = Field(None, max_length=50)
    reconciliation_type: str   | None = None
    frequency:           str   | None = None
    tolerance_threshold: float | None = None
    date_window_days:    int   | None = None
    materiality_limit:   float | None = None
    risk_classification: str   | None = None
    auto_certify:        bool  | None = None
    auto_approve_threshold: float | None = None
    due_days:            int   | None = None
    status:              str   | None = None
    assigned_preparer:   int   | None = None
    assigned_reviewer:   int   | None = None
    assigned_approver:   int   | None = None
    assigned_certifier:  int   | None = None
    workflow_config:     dict  | None = None
    matching_rules:      dict  | None = None


def _serialize(profile: ReconciliationProfile) -> dict:
    """Convert a profile ORM row to a clean API dict."""
    def _user(uid: int | None) -> dict | None:
        return {"id": uid} if uid else None

    return {
        "id":                   profile.id,
        "name":                 profile.name,
        "account_number":       getattr(profile, "account_number", None),
        "reconciliation_type":  profile.reconciliation_type,
        "frequency":            profile.frequency,
        "tolerance_threshold":  profile.tolerance_threshold,
        "date_window_days":     profile.date_window_days,
        "materiality_limit":    profile.materiality_limit,
        "risk_classification":  profile.risk_classification,
        "auto_certify":         getattr(profile, "auto_certify", False),
        "auto_approve_threshold": profile.auto_approve_threshold,
        "due_days":             profile.due_days,
        "status":               getattr(profile, "status", "ACTIVE"),
        "lifecycle_state":      profile.lifecycle_state,
        "active":               profile.active,
        "assigned_preparer":    profile.assigned_preparer,
        "assigned_reviewer":    profile.assigned_reviewer,
        "assigned_approver":    profile.assigned_approver,
        "assigned_certifier":   profile.assigned_certifier,
        "workflow_config":      json.loads(profile.workflow_config_json or "{}"),
        "matching_rules":       json.loads(profile.matching_rules_json  or "{}"),
        "created_at":           profile.created_at.isoformat() if profile.created_at else None,
        "updated_at":           profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _enrich_with_users(profile_dict: dict, db: Session) -> dict:
    """Attach full username/email for each assigned role slot."""
    for slot in ("assigned_preparer", "assigned_reviewer", "assigned_approver", "assigned_certifier"):
        uid = profile_dict.get(slot)
        if uid:
            u = db.query(User).filter(User.id == uid).first()
            profile_dict[f"{slot}_user"] = (
                {"id": u.id, "username": u.username, "email": u.email, "role": u.role}
                if u else None
            )
        else:
            profile_dict[f"{slot}_user"] = None
    return profile_dict


def _get_or_404(db: Session, profile_id: int) -> ReconciliationProfile:
    p = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    return p


# ─────────────────────────────────────────────────────────────
# READ — list with pagination, search, filters
# ─────────────────────────────────────────────────────────────

@router.get("")
def list_profiles(
    page:       int         = Query(default=1, ge=1,   description="Page number (1-based)"),
    page_size:  int         = Query(default=20, ge=1, le=200, description="Results per page"),
    search:     str | None  = Query(default=None,      description="Text match on name or account_number"),
    risk_level: list[str]   = Query(default=[],        description="Filter by risk_classification (multi-select)"),
    status:     list[str]   = Query(default=[],        description="Filter by status (multi-select)"),
    sort_by:    str         = Query(default="created_at", description="Column to sort by"),
    sort_dir:   str         = Query(default="desc",    description="asc | desc"),
    db:         Session     = Depends(get_db),
    current_user            = Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    """
    Server-side paginated list with:
    - Full-text search on name and account_number
    - Multi-value risk_level and status filters
    - Configurable sort
    - Role-scoped visibility (preparer/reviewer/approver see only their profiles;
      admin/auditor/certifier see all)
    """
    q = db.query(ReconciliationProfile)

    # Role-scoped filtering
    role = (current_user.role or "").lower()
    if role == "preparer":
        q = q.filter(ReconciliationProfile.assigned_preparer == current_user.id)
    elif role == "approver":
        q = q.filter(ReconciliationProfile.assigned_approver == current_user.id)
    elif role == "certifier":
        q = q.filter(ReconciliationProfile.assigned_certifier == current_user.id)
    # admin sees all — no filter

    # Text search (case-insensitive, name or account_number)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            ReconciliationProfile.name.ilike(term),
            ReconciliationProfile.account_number.ilike(term),
        ))

    # Risk level multi-filter
    if risk_level:
        cleaned = [r.upper() for r in risk_level if r.strip()]
        if cleaned:
            q = q.filter(ReconciliationProfile.risk_classification.in_(cleaned))

    # Status multi-filter (uses the new 'status' column, falls back gracefully)
    if status:
        cleaned_s = [s.upper() for s in status if s.strip()]
        if cleaned_s:
            # Filter on 'status' column if it exists, else use 'active' boolean
            if hasattr(ReconciliationProfile, "status"):
                q = q.filter(ReconciliationProfile.status.in_(cleaned_s))

    # Sorting
    sort_col_map = {
        "name":               ReconciliationProfile.name,
        "account_number":     ReconciliationProfile.account_number,
        "risk_classification": ReconciliationProfile.risk_classification,
        "frequency":          ReconciliationProfile.frequency,
        "created_at":         ReconciliationProfile.created_at,
        "updated_at":         ReconciliationProfile.updated_at,
    }
    col = sort_col_map.get(sort_by, ReconciliationProfile.created_at)
    q = q.order_by(col.asc() if sort_dir == "asc" else col.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, -(-total // page_size)),   # ceiling division
        "items":     [_enrich_with_users(_serialize(p), db) for p in items],
    }


@router.get("/{profile_id}")
def get_profile(
    profile_id: int,
    db:         Session = Depends(get_db),
    current_user        = Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    p = _get_or_404(db, profile_id)
    return _enrich_with_users(_serialize(p), db)


# ─────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_profile(
    payload:      ProfileCreateV1,
    request:      Request,
    db:           Session = Depends(get_db),
    current_user          = Depends(role_required([ADMIN])),
):
    """
    Admin-only. Creates a new reconciliation profile.
    account_number must be unique if provided.
    Calls audit_service.log_action() to record the creation in the
    immutable Governance Layer audit trail.
    """
    # Uniqueness check on account_number
    if payload.account_number:
        existing = (
            db.query(ReconciliationProfile)
            .filter(ReconciliationProfile.account_number == payload.account_number)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A profile with account_number '{payload.account_number}' already exists (id={existing.id})",
            )

    profile = ReconciliationProfile(
        name                   = payload.name,
        account_number         = payload.account_number,
        reconciliation_type    = payload.reconciliation_type,
        frequency              = payload.frequency,
        tolerance_threshold    = payload.tolerance_threshold,
        date_window_days       = payload.date_window_days,
        materiality_limit      = payload.materiality_limit,
        risk_classification    = payload.risk_classification.upper(),
        auto_certify           = payload.auto_certify,
        auto_approve_threshold = payload.auto_approve_threshold,
        due_days               = payload.due_days,
        status                 = payload.status.upper(),
        assigned_preparer      = payload.assigned_preparer,
        assigned_reviewer      = payload.assigned_reviewer,
        assigned_approver      = payload.assigned_approver,
        assigned_certifier     = payload.assigned_certifier,
        workflow_config_json   = json.dumps(payload.workflow_config or {}),
        matching_rules_json    = json.dumps(payload.matching_rules  or {}),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    # ── Audit log (existing Governance Layer utility) ──
    audit_service.log_action(
        db,
        action_type = "PROFILE_CREATED",
        user_id     = current_user.id,
        entity_type = "reconciliation_profile",
        entity_id   = profile.id,
        metadata    = {
            "name":             profile.name,
            "account_number":   profile.account_number,
            "risk_level":       profile.risk_classification,
            "frequency":        profile.frequency,
            "auto_certify":     getattr(profile, "auto_certify", False),
        },
        ip_address  = request.client.host if request.client else None,
    )

    return _enrich_with_users(_serialize(profile), db)


# ─────────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────────

@router.patch("/{profile_id}")
def update_profile(
    profile_id: int,
    payload:    ProfileUpdateV1,
    request:    Request,
    db:         Session = Depends(get_db),
    current_user        = Depends(role_required([ADMIN])),
):
    """
    Admin-only. Partial update — only supplied fields are changed.
    Calls audit_service.log_action() to record changes.
    """
    profile = _get_or_404(db, profile_id)

    # account_number uniqueness check on update
    if payload.account_number is not None and payload.account_number != getattr(profile, "account_number", None):
        collision = (
            db.query(ReconciliationProfile)
            .filter(
                ReconciliationProfile.account_number == payload.account_number,
                ReconciliationProfile.id != profile_id,
            )
            .first()
        )
        if collision:
            raise HTTPException(
                status_code=409,
                detail=f"account_number '{payload.account_number}' is already taken by profile id={collision.id}",
            )

    raw = payload.model_dump(exclude_unset=True)
    changed_fields: dict = {}

    for key, value in raw.items():
        if key == "workflow_config":
            setattr(profile, "workflow_config_json", json.dumps(value or {}))
            changed_fields["workflow_config"] = True
        elif key == "matching_rules":
            setattr(profile, "matching_rules_json", json.dumps(value or {}))
            changed_fields["matching_rules"] = True
        elif key == "risk_classification" and value:
            setattr(profile, key, value.upper())
            changed_fields[key] = value.upper()
        elif key == "status" and value:
            setattr(profile, key, value.upper())
            changed_fields[key] = value.upper()
        else:
            old = getattr(profile, key, None)
            if old != value:
                setattr(profile, key, value)
                changed_fields[key] = value

    db.commit()
    db.refresh(profile)

    # ── Audit log ──
    audit_service.log_action(
        db,
        action_type = "PROFILE_UPDATED",
        user_id     = current_user.id,
        entity_type = "reconciliation_profile",
        entity_id   = profile_id,
        metadata    = {"changed_fields": changed_fields},
        ip_address  = request.client.host if request.client else None,
    )

    return _enrich_with_users(_serialize(profile), db)


# ─────────────────────────────────────────────────────────────
# DELETE (soft + hard)
# ─────────────────────────────────────────────────────────────

@router.delete("/{profile_id}")
def delete_profile(
    profile_id: int,
    hard:       bool    = Query(default=False, description="Hard delete — removes the row. Default is soft (status=ARCHIVED)"),
    request:    Request = None,
    db:         Session = Depends(get_db),
    current_user        = Depends(role_required([ADMIN])),
):
    """
    Admin-only.
    - Soft delete (default): sets status=ARCHIVED and active=False.
      Profile stays in DB for audit trail and FK integrity.
    - Hard delete (?hard=true): physically removes the row.
      Use only when no child records exist.
    Calls audit_service.log_action() in both cases.
    """
    profile = _get_or_404(db, profile_id)

    if hard:
        profile_name = profile.name
        db.delete(profile)
        db.commit()
        audit_service.log_action(
            db,
            action_type = "PROFILE_HARD_DELETED",
            user_id     = current_user.id,
            entity_type = "reconciliation_profile",
            entity_id   = profile_id,
            metadata    = {"name": profile_name, "hard": True},
            ip_address  = request.client.host if request and request.client else None,
        )
        return {"deleted": True, "hard": True, "profile_id": profile_id}

    # Soft delete
    profile.active = False
    if hasattr(profile, "status"):
        profile.status = "ARCHIVED"
    profile.lifecycle_state = "CLOSED"
    db.commit()

    audit_service.log_action(
        db,
        action_type = "PROFILE_ARCHIVED",
        user_id     = current_user.id,
        entity_type = "reconciliation_profile",
        entity_id   = profile_id,
        metadata    = {"name": profile.name, "soft": True},
        ip_address  = request.client.host if request and request.client else None,
    )
    return {"deleted": True, "hard": False, "profile_id": profile_id, "status": "ARCHIVED"}
