"""
backend/app/routes/sla_router.py

SLA Monitoring & Escalation API — Phase 2, Chunk 4.
Mounted at /api/v1/sla in main.py.

RBAC scoping per spec:
  GET /violations            Preparer-scoped (current_owner_id OR assigned_user_id == me)
  GET /violations/team       Approver — all violations for profiles where they're assigned_approver
  GET /violations/enterprise Certifier — read-only, all violations
  GET /violations/all        Admin — all violations (filterable)
  POST /violations/{id}/override   Admin only
  POST /violations/{id}/resolve    Admin only
  POST /policies                   Admin only
  PUT /policies/{id}               Admin only
  POST /violations/{id}/acknowledge  any role currently owning the violation
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..models.models import ReconciliationProfile, User
from ..services import audit_service
from ..services import sla_monitoring_service as svc
from ..services import escalation_service
from ..services.sla_monitoring_schemas import (
    SLAPolicyCreateRequest,
    SLAPolicyUpdateRequest,
    SLAPolicyItem,
    SLAViolationListResponse,
    SLAViolationItem,
    SLAOverrideRequest,
    SLAResolveRequest,
    SLAAcknowledgeRequest,
    SLAScanResult,
)

try:
    from ..models.models import SLAPolicy, SLAViolation
except ImportError:
    raise ImportError("SLAPolicy / SLAViolation not found — apply sla_monitoring_migration first.")

router = APIRouter(prefix="/api/v1/sla", tags=["sla-monitoring"])

ALL_ROLES = [ADMIN, PREPARER, APPROVER, CERTIFIER]


# ─────────────────────────────────────────────────────────────────────────
# Enrichment helper (shared by every list endpoint)
# ─────────────────────────────────────────────────────────────────────────

def _enrich(db: Session, violations: list) -> list:
    profile_ids = {v.profile_id for v in violations}
    profiles = {
        p.id: p for p in db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(profile_ids)).all()
    } if profile_ids else {}

    owner_ids = {v.current_owner_id for v in violations if v.current_owner_id}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(owner_ids)).all()} if owner_ids else {}

    items = []
    for v in violations:
        prof = profiles.get(v.profile_id)
        owner = users.get(v.current_owner_id)
        items.append(SLAViolationItem(
            id=v.id, balance_id=v.balance_id, profile_id=v.profile_id,
            profile_name=prof.name if prof else None,
            policy_id=v.policy_id, violation_type=v.violation_type,
            assigned_user_id=v.assigned_user_id, current_owner_id=v.current_owner_id,
            current_owner_name=getattr(owner, "username", None) if owner else None,
            days_overdue=v.days_overdue, escalation_level=v.escalation_level,
            escalation_status=v.escalation_status, status=v.status,
            priority_level=prof.risk_classification if prof else None,
            created_at=v.created_at, resolved_at=v.resolved_at,
            last_escalated_at=v.last_escalated_at,
        ))
    return items


# ─────────────────────────────────────────────────────────────────────────
# GET /violations — Preparer scope
# ─────────────────────────────────────────────────────────────────────────

@router.get("/violations", response_model=SLAViolationListResponse)
def list_my_violations(
    db: Session = Depends(get_db),
    current_user=Depends(role_required(ALL_ROLES)),
):
    """Preparer: only violations where they are current_owner_id OR assigned_user_id."""
    violations = (
        db.query(SLAViolation)
        .filter(
            (SLAViolation.current_owner_id == current_user.id)
            | (SLAViolation.assigned_user_id == current_user.id)
        )
        .order_by(SLAViolation.days_overdue.desc())
        .all()
    )
    items = _enrich(db, violations)
    return {"violations": items, "total": len(items)}


# ─────────────────────────────────────────────────────────────────────────
# GET /violations/team — Approver scope
# ─────────────────────────────────────────────────────────────────────────

@router.get("/violations/team", response_model=SLAViolationListResponse)
def list_team_violations(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([APPROVER, ADMIN])),
):
    """Approver: all violations for profiles where they are assigned_approver."""
    profile_ids = [
        p.id for p in db.query(ReconciliationProfile)
        .filter(ReconciliationProfile.assigned_approver == current_user.id).all()
    ]
    violations = (
        db.query(SLAViolation)
        .filter(SLAViolation.profile_id.in_(profile_ids))
        .order_by(SLAViolation.days_overdue.desc())
        .all()
    ) if profile_ids else []
    items = _enrich(db, violations)
    return {"violations": items, "total": len(items)}


# ─────────────────────────────────────────────────────────────────────────
# GET /violations/enterprise — Certifier scope (read-only)
# ─────────────────────────────────────────────────────────────────────────

@router.get("/violations/enterprise", response_model=SLAViolationListResponse)
def list_enterprise_violations(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([CERTIFIER, ADMIN])),
):
    """Certifier: enterprise-wide read scope, no override capability."""
    violations = db.query(SLAViolation).order_by(SLAViolation.days_overdue.desc()).all()
    items = _enrich(db, violations)
    return {"violations": items, "total": len(items)}


# ─────────────────────────────────────────────────────────────────────────
# GET /violations/all — Admin full visibility
# ─────────────────────────────────────────────────────────────────────────

@router.get("/violations/all", response_model=SLAViolationListResponse)
def list_all_violations(
    status_filter: Optional[str] = Query(None, alias="status"),
    escalation_level: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    q = db.query(SLAViolation)
    if status_filter:
        q = q.filter(SLAViolation.status == status_filter.upper())
    if escalation_level:
        q = q.filter(SLAViolation.escalation_level == escalation_level)
    violations = q.order_by(SLAViolation.days_overdue.desc()).all()
    items = _enrich(db, violations)
    return {"violations": items, "total": len(items)}


# ─────────────────────────────────────────────────────────────────────────
# POST /violations/{id}/acknowledge — current owner only
# ─────────────────────────────────────────────────────────────────────────

@router.post("/violations/{violation_id}/acknowledge")
def acknowledge_violation(
    violation_id: int,
    payload: SLAAcknowledgeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(ALL_ROLES)),
):
    v = db.query(SLAViolation).filter(SLAViolation.id == violation_id).first()
    if not v:
        raise HTTPException(404, "Violation not found")
    if v.current_owner_id != current_user.id and (current_user.role or "").lower() != "admin":
        raise HTTPException(403, "Only the current owner (or an admin) may acknowledge this violation.")

    v.status = "ACKNOWLEDGED"
    db.add(v)
    audit_service.log_action(
        db, "SLA_VIOLATION_ACKNOWLEDGED", user_id=current_user.id,
        entity_type="sla_violations", entity_id=v.id,
        metadata={"note": payload.note},
    )
    db.commit()
    return {"id": v.id, "status": v.status}


# ─────────────────────────────────────────────────────────────────────────
# POST /violations/{id}/override — Admin only
# ─────────────────────────────────────────────────────────────────────────

@router.post("/violations/{violation_id}/override", response_model=SLAViolationItem)
def override_violation_endpoint(
    violation_id: int,
    payload: SLAOverrideRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    v = db.query(SLAViolation).filter(SLAViolation.id == violation_id).first()
    if not v:
        raise HTTPException(404, "Violation not found")

    v = escalation_service.override_violation(
        db, v,
        escalation_level=payload.escalation_level,
        escalation_status=payload.escalation_status,
        current_owner_id=payload.current_owner_id,
        note=payload.note,
        actor_id=current_user.id,
    )
    return _enrich(db, [v])[0]


# ─────────────────────────────────────────────────────────────────────────
# POST /violations/{id}/resolve — Admin only (force-resolve)
# ─────────────────────────────────────────────────────────────────────────

@router.post("/violations/{violation_id}/resolve")
def resolve_violation(
    violation_id: int,
    payload: SLAResolveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    v = db.query(SLAViolation).filter(SLAViolation.id == violation_id).first()
    if not v:
        raise HTTPException(404, "Violation not found")

    v.status = "RESOLVED"
    v.resolved_at = datetime.utcnow()
    v.escalation_status = "RESOLVED"
    db.add(v)

    audit_service.log_action(
        db, "SLA_VIOLATION_FORCE_RESOLVED", user_id=current_user.id,
        entity_type="sla_violations", entity_id=v.id,
        metadata={"note": payload.note},
    )
    db.commit()
    return {"id": v.id, "status": v.status, "resolved_at": v.resolved_at}


# ─────────────────────────────────────────────────────────────────────────
# POST /policies, GET /policies, PUT /policies/{id} — Admin write, all read
# ─────────────────────────────────────────────────────────────────────────

@router.post("/policies", response_model=SLAPolicyItem)
def create_policy(
    payload: SLAPolicyCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    policy = SLAPolicy(
        profile_id=payload.profile_id,
        priority_level=payload.priority_level.upper(),
        max_days_open=payload.max_days_open,
        escalation_role=payload.escalation_role.upper(),
        reminder_interval_days=payload.reminder_interval_days,
    )
    db.add(policy)
    db.flush()

    audit_service.log_action(
        db, "SLA_POLICY_CREATED", user_id=current_user.id,
        entity_type="sla_policies", entity_id=policy.id,
        metadata=payload.model_dump(),
    )
    db.commit()
    db.refresh(policy)

    prof = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == policy.profile_id).first() \
        if policy.profile_id else None
    return SLAPolicyItem(
        id=policy.id, profile_id=policy.profile_id, profile_name=prof.name if prof else None,
        priority_level=policy.priority_level, max_days_open=policy.max_days_open,
        escalation_role=policy.escalation_role, reminder_interval_days=policy.reminder_interval_days,
        created_at=policy.created_at, updated_at=policy.updated_at,
    )


@router.get("/policies", response_model=list[SLAPolicyItem])
def list_policies(
    db: Session = Depends(get_db),
    current_user=Depends(role_required(ALL_ROLES)),
):
    """Read access for all roles — everyone benefits from seeing the rules that apply to them."""
    policies = db.query(SLAPolicy).all()
    profile_ids = {p.profile_id for p in policies if p.profile_id}
    profiles = {
        p.id: p for p in db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(profile_ids)).all()
    } if profile_ids else {}
    return [
        SLAPolicyItem(
            id=p.id, profile_id=p.profile_id,
            profile_name=profiles.get(p.profile_id).name if p.profile_id in profiles else None,
            priority_level=p.priority_level, max_days_open=p.max_days_open,
            escalation_role=p.escalation_role, reminder_interval_days=p.reminder_interval_days,
            created_at=p.created_at, updated_at=p.updated_at,
        )
        for p in policies
    ]


@router.put("/policies/{policy_id}", response_model=SLAPolicyItem)
def update_policy(
    policy_id: int,
    payload: SLAPolicyUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    policy = db.query(SLAPolicy).filter(SLAPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Policy not found")

    before = {
        "max_days_open": policy.max_days_open,
        "escalation_role": policy.escalation_role,
        "reminder_interval_days": policy.reminder_interval_days,
    }
    if payload.max_days_open is not None:
        policy.max_days_open = payload.max_days_open
    if payload.escalation_role is not None:
        policy.escalation_role = payload.escalation_role.upper()
    if payload.reminder_interval_days is not None:
        policy.reminder_interval_days = payload.reminder_interval_days

    db.add(policy)
    audit_service.log_action(
        db, "SLA_POLICY_UPDATED", user_id=current_user.id,
        entity_type="sla_policies", entity_id=policy.id,
        metadata={"before": before, "after": payload.model_dump(exclude_none=True)},
    )
    db.commit()
    db.refresh(policy)

    prof = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == policy.profile_id).first() \
        if policy.profile_id else None
    return SLAPolicyItem(
        id=policy.id, profile_id=policy.profile_id, profile_name=prof.name if prof else None,
        priority_level=policy.priority_level, max_days_open=policy.max_days_open,
        escalation_role=policy.escalation_role, reminder_interval_days=policy.reminder_interval_days,
        created_at=policy.created_at, updated_at=policy.updated_at,
    )


# ─────────────────────────────────────────────────────────────────────────
# POST /scan — Admin manual trigger
# ─────────────────────────────────────────────────────────────────────────

@router.post("/scan", response_model=SLAScanResult)
def trigger_scan(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    """Manually trigger the SLA scan. Also runs automatically via APScheduler."""
    return svc.run_sla_scan(db, actor_id=current_user.id)
