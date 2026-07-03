"""
backend/app/services/sla_monitoring_service.py

SLA Monitoring Engine — Phase 2, Chunk 4, Part 2.

Scans balances in DRAFT / UNDER_REVIEW / APPROVED, resolves the applicable
SLA policy, and creates/updates/auto-resolves sla_violations rows. Delegates
all notification + reassignment + comment + audit work to
escalation_service.process_escalation() — this module's only job is
detection and bookkeeping, never the escalation mechanics themselves.

Lifecycle state mapping (existing fields only, no new lifecycle states):
    DRAFT         age anchor = balance.created_at   -> violation_type SLA_BREACH
    UNDER_REVIEW  age anchor = balance.submitted_at  -> violation_type APPROVAL_BOTTLENECK
    APPROVED      age anchor = balance.approved_at   -> violation_type CERTIFICATION_OVERDUE
                  (APPROVED + certified_at IS NULL is exactly "awaiting
                   certification" — certified_at only gets set on the
                   CERTIFIED transition, so every balance this scan visits
                   in APPROVED state is by definition still awaiting the
                   certifier's action; no new status value needed.)

Priority resolution reuses the existing ReconciliationProfile.risk_classification
field (LOW/MEDIUM/HIGH/CRITICAL) already used by the risk scoring engine —
this is the only "priority" concept already in the schema, so sla_policies
are keyed off it rather than inventing a parallel priority field on balances.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.models import (
    ReconciliationProfile,
    ReconciliationBalance,
    User,
)
from . import escalation_service

log = logging.getLogger("drms.sla_monitoring")

try:
    from ..models.models import SLAPolicy, SLAViolation
except ImportError:
    raise ImportError(
        "SLAPolicy / SLAViolation not found in models.models — "
        "apply sla_monitoring_models.py and run the migration first."
    )

BREACHING_STATES = ["DRAFT", "UNDER_REVIEW", "APPROVED"]

STATE_TO_VIOLATION_TYPE = {
    "DRAFT":         "SLA_BREACH",
    "UNDER_REVIEW":  "APPROVAL_BOTTLENECK",
    "APPROVED":      "CERTIFICATION_OVERDUE",
}

ROLE_FIELD_MAP = {
    "PREPARER":  "assigned_preparer",
    "APPROVER":  "assigned_approver",
    "CERTIFIER": "assigned_certifier",
}


def _state_age_days(balance: ReconciliationBalance, now: datetime) -> int:
    if balance.status == "DRAFT":
        anchor = balance.created_at
    elif balance.status == "UNDER_REVIEW":
        anchor = balance.submitted_at or balance.created_at
    elif balance.status == "APPROVED":
        anchor = balance.approved_at or balance.created_at
    else:
        anchor = balance.created_at
    if not anchor:
        return 0
    return max(0, (now - anchor).days)


def _resolve_policy(db: Session, profile_id: int, priority_level: str) -> Optional["SLAPolicy"]:
    specific = (
        db.query(SLAPolicy)
        .filter(SLAPolicy.profile_id == profile_id, SLAPolicy.priority_level == priority_level)
        .first()
    )
    if specific:
        return specific
    return (
        db.query(SLAPolicy)
        .filter(SLAPolicy.profile_id.is_(None), SLAPolicy.priority_level == priority_level)
        .first()
    )


def resolve_owner_for_role(db: Session, profile: ReconciliationProfile, role: str) -> Optional[int]:
    """Maps an escalation_role (PREPARER/APPROVER/CERTIFIER/ADMIN) to a concrete user id."""
    role = (role or "").upper()
    if role == "ADMIN":
        admin = db.query(User).filter(func.lower(User.role) == "admin").first()
        return admin.id if admin else None
    field = ROLE_FIELD_MAP.get(role)
    return getattr(profile, field, None) if field else None


def run_sla_scan(db: Session, actor_id: Optional[int] = None) -> dict:
    """
    The scheduled scan. Call this from an APScheduler job (see
    scheduler_additions snippet) or manually via POST /sla/scan (admin-only,
    optional convenience endpoint not required by spec but harmless to add
    if you want a manual trigger button).
    """
    now = datetime.utcnow()
    profiles = {p.id: p for p in db.query(ReconciliationProfile).all()}

    # ── Pass 1: auto-resolve OPEN violations whose balance has exited every
    #            breaching state entirely (e.g. went straight to CERTIFIED) ──
    open_violations = db.query(SLAViolation).filter(SLAViolation.status == "OPEN").all()
    balance_ids = [v.balance_id for v in open_violations]
    balances_by_id = {}
    if balance_ids:
        for b in db.query(ReconciliationBalance).filter(ReconciliationBalance.id.in_(balance_ids)).all():
            balances_by_id[b.id] = b

    auto_resolved = 0
    for v in open_violations:
        bal = balances_by_id.get(v.balance_id)
        if not bal or bal.status not in BREACHING_STATES:
            v.status = "RESOLVED"
            v.resolved_at = now
            v.escalation_status = "RESOLVED"
            db.add(v)
            auto_resolved += 1

    # ── Pass 2: scan every balance currently sitting in a breaching state ──
    scanned = 0
    new_violations = 0
    updated_violations = 0
    escalations_triggered = {"level_1": 0, "level_2": 0, "level_3": 0}

    balances = (
        db.query(ReconciliationBalance)
        .filter(ReconciliationBalance.status.in_(BREACHING_STATES))
        .all()
    )

    for bal in balances:
        scanned += 1
        profile = profiles.get(bal.profile_id)
        if not profile:
            continue

        priority = (profile.risk_classification or "MEDIUM").upper()
        policy = _resolve_policy(db, profile.id, priority)
        if not policy:
            continue  # no applicable policy configured — nothing to enforce

        age_days = _state_age_days(bal, now)

        existing = (
            db.query(SLAViolation)
            .filter(SLAViolation.balance_id == bal.id, SLAViolation.status == "OPEN")
            .first()
        )

        if age_days <= policy.max_days_open:
            # Within SLA — auto-resolve if it had previously breached
            if existing:
                existing.status = "RESOLVED"
                existing.resolved_at = now
                existing.escalation_status = "RESOLVED"
                db.add(existing)
                auto_resolved += 1
            continue

        days_overdue = age_days - policy.max_days_open

        if existing:
            existing.days_overdue = days_overdue
            violation = existing
            updated_violations += 1
        else:
            owner_id = resolve_owner_for_role(db, profile, policy.escalation_role)
            violation = SLAViolation(
                balance_id=bal.id,
                profile_id=profile.id,
                policy_id=policy.id,
                violation_type=STATE_TO_VIOLATION_TYPE.get(bal.status, "SLA_BREACH"),
                assigned_user_id=owner_id,
                current_owner_id=owner_id,
                days_overdue=days_overdue,
                escalation_level=1,
                escalation_status="NONE",
                status="OPEN",
                created_at=now,
            )
            db.add(violation)
            db.flush()
            new_violations += 1

        level_fired = escalation_service.process_escalation(
            db, violation, policy, profile, bal, actor_id=actor_id,
        )
        if level_fired:
            escalations_triggered[f"level_{level_fired}"] += 1

    db.commit()

    result = {
        "scanned_balances":      scanned,
        "new_violations":        new_violations,
        "updated_violations":    updated_violations,
        "auto_resolved":         auto_resolved,
        "escalations_triggered": escalations_triggered,
        "run_at":                now,
    }
    log.info(f"[sla_monitoring] scan complete: {result}")
    return result
