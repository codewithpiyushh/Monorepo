"""
backend/app/services/escalation_service.py

Escalation Engine — Phase 2, Chunk 4, Part 3.

Implements the exact 3-level ladder from the spec. Pure mechanics live
here; sla_monitoring_service.py decides WHEN to call process_escalation(),
this module decides WHAT happens at each level.

Reuses, rather than duplicates:
  - Notification Center  -> UINotification (direct, same model used by
    every other engine — aging, variance, balance, etc.)
  - Audit Trail           -> audit_service.log_action(db, action_type,
    user_id=, entity_type=, entity_id=, metadata=)
  - Comment Threads       -> enterprise.comment_service.create_system_event(
    db, balance_id, content) — the dedicated convenience wrapper for
    system-generated, authorless SYSTEM_EVENT comments (verified against
    the actual enterprise/comment_service.py implementation).

ASSUMPTION — manager hierarchy
The manager_id field now exists on the User model.
_resolve_manager_or_admin_fallback() checks for it.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.models import ReconciliationProfile, ReconciliationBalance, UINotification, User
from . import audit_service

log = logging.getLogger("drms.escalation")

try:
    from ..models.models import SLAViolation, SLAPolicy
except ImportError:
    raise ImportError("SLAViolation / SLAPolicy not found — apply sla_monitoring_models.py first.")

ESCALATION_CHAIN = ["PREPARER", "APPROVER", "CERTIFIER", "ADMIN"]


# ─────────────────────────────────────────────────────────────────────────
# Notification helper (Notification Center reuse)
# ─────────────────────────────────────────────────────────────────────────

def _notify(db: Session, user_id: Optional[int], title: str, message: str, icon_type: str = "warning") -> None:
    if not user_id:
        return
    db.add(UINotification(
        user_id=user_id, notification_type="sla", title=title, message=message,
        icon_type=icon_type, is_read=False, created_at=datetime.utcnow(),
    ))


# ─────────────────────────────────────────────────────────────────────────
# Role / ownership helpers
# ─────────────────────────────────────────────────────────────────────────

def _role_for_owner(profile: ReconciliationProfile, owner_id: Optional[int]) -> str:
    if owner_id is None:
        return "UNKNOWN"
    if owner_id == profile.assigned_preparer:
        return "PREPARER"
    if owner_id == profile.assigned_approver:
        return "APPROVER"
    if owner_id == profile.assigned_certifier:
        return "CERTIFIER"
    return "ADMIN"  # anything else (e.g. already reassigned to an admin user)


def _next_authority(db: Session, profile: ReconciliationProfile, current_owner_id: Optional[int]) -> tuple[Optional[int], str]:
    """Strictly Preparer -> Approver -> Certifier -> Admin. Never backward, never past Admin."""
    current_role = _role_for_owner(profile, current_owner_id)
    idx = ESCALATION_CHAIN.index(current_role) if current_role in ESCALATION_CHAIN else 0
    next_idx = min(idx + 1, len(ESCALATION_CHAIN) - 1)
    next_role = ESCALATION_CHAIN[next_idx]

    if next_role == "APPROVER":
        return profile.assigned_approver, next_role
    if next_role == "CERTIFIER":
        return profile.assigned_certifier, next_role
    if next_role == "ADMIN":
        admin = db.query(User).filter(func.lower(User.role) == "admin").first()
        return (admin.id if admin else None), next_role
    return profile.assigned_preparer, next_role


def _resolve_manager_or_admin_fallback(db: Session, owner_id: Optional[int]) -> tuple[Optional[int], str]:
    """Returns (notify_user_id, fallback_reason). No manager concept exists
    today, so this always resolves to the Admin role and logs that fact."""
    if not owner_id:
        admin = db.query(User).filter(func.lower(User.role) == "admin").first()
        return (admin.id if admin else None), "no_owner_admin_fallback"

    owner = db.query(User).filter(User.id == owner_id).first()
    manager_id = getattr(owner, "manager_id", None) if owner else None
    if manager_id:
        return manager_id, "manager_hierarchy"

    admin = db.query(User).filter(func.lower(User.role) == "admin").first()
    return (admin.id if admin else None), "no_manager_admin_fallback"


# ─────────────────────────────────────────────────────────────────────────
# Comment Thread reuse (see module docstring ASSUMPTION note)
# ─────────────────────────────────────────────────────────────────────────

def _post_system_comment(
    db: Session,
    balance: ReconciliationBalance,
    profile: ReconciliationProfile,
    previous_owner_role: str,
    new_owner_role: str,
    days_overdue: int,
    new_owner_id: Optional[int],
) -> None:
    new_owner = db.query(User).filter(User.id == new_owner_id).first() if new_owner_id else None
    mention = f"@{new_owner.username}" if new_owner and getattr(new_owner, "username", None) else f"the {new_owner_role}"

    content = (
        "[SYSTEM]\n"
        f"The account was escalated from {previous_owner_role} to {new_owner_role}.\n"
        "Reason: SLA Breach.\n"
        f"Days Overdue: {days_overdue}.\n"
        f"{mention} has been assigned as the new owner."
    )

    try:
        from ..enterprise import comment_service  # correct module path
        comment_service.create_system_event(
            db,
            balance_id=balance.id,
            content=content,
        )
    except (ImportError, AttributeError) as e:
        log.warning(
            f"[escalation_service] comment_service unavailable ({e}) — "
            f"system escalation comment NOT posted for balance {balance.id}."
        )
    except Exception as e:
        log.warning(f"[escalation_service] Failed to post system escalation comment: {e}")



# ─────────────────────────────────────────────────────────────────────────
# Core escalation state machine
# ─────────────────────────────────────────────────────────────────────────

def process_escalation(
    db: Session,
    violation: "SLAViolation",
    policy: "SLAPolicy",
    profile: ReconciliationProfile,
    balance: ReconciliationBalance,
    actor_id: Optional[int] = None,
) -> Optional[int]:
    """
    Idempotent. Returns the level number actually fired this call (1, 2, or
    3), or None if nothing changed (already at the correct level for its
    current overdue duration, or fully escalated/resolved already).
    """
    now = datetime.utcnow()

    # ── Level 1 — first detection ───────────────────────────────────────
    if violation.escalation_status == "NONE":
        _notify(
            db, violation.current_owner_id,
            title="SLA Warning — Action Required",
            message=(
                f"Balance #{balance.id} on profile '{profile.name}' is "
                f"{violation.days_overdue} day(s) past its SLA threshold."
            ),
            icon_type="warning",
        )
        violation.escalation_level = 1
        violation.escalation_status = "LEVEL_1_NOTIFIED"
        violation.last_escalated_at = now
        db.add(violation)

        audit_service.log_action(
            db, "SLA_ESCALATION_LEVEL_1", user_id=actor_id,
            entity_type="sla_violations", entity_id=violation.id,
            metadata={
                "balance_id": balance.id, "profile_id": profile.id,
                "days_overdue": violation.days_overdue,
                "notified_user_id": violation.current_owner_id,
            },
        )
        db.commit()
        return 1

    days_since_last = (
        (now - violation.last_escalated_at).days if violation.last_escalated_at else 999
    )

    # ── Level 2 — reminder interval elapsed since Level 1 ───────────────
    if violation.escalation_status == "LEVEL_1_NOTIFIED":
        if days_since_last < policy.reminder_interval_days:
            return None  # not due yet — idempotent no-op

        manager_id, fallback_reason = _resolve_manager_or_admin_fallback(db, violation.current_owner_id)

        _notify(
            db, violation.current_owner_id,
            title="SLA Escalation — Level 2 Reminder",
            message=(
                f"Balance #{balance.id} on profile '{profile.name}' remains unresolved at "
                f"{violation.days_overdue} day(s) overdue. This is a second-notice escalation."
            ),
            icon_type="error",
        )
        if manager_id:
            _notify(
                db, manager_id,
                title="SLA Escalation — Team Member Overdue",
                message=(
                    f"Balance #{balance.id} on profile '{profile.name}' is "
                    f"{violation.days_overdue} day(s) overdue and has reached Level 2 escalation."
                ),
                icon_type="error",
            )

        violation.escalation_level = 2
        violation.escalation_status = "LEVEL_2_NOTIFIED"
        violation.last_escalated_at = now
        db.add(violation)

        audit_service.log_action(
            db, "SLA_ESCALATION_LEVEL_2", user_id=actor_id,
            entity_type="sla_violations", entity_id=violation.id,
            metadata={
                "balance_id": balance.id, "profile_id": profile.id,
                "days_overdue": violation.days_overdue,
                "notified_user_id": violation.current_owner_id,
                "manager_notified_id": manager_id,
                "manager_resolution": fallback_reason,
            },
        )
        db.commit()
        return 2

    # ── Level 3 — reassign to next authority ────────────────────────────
    if violation.escalation_status == "LEVEL_2_NOTIFIED":
        if days_since_last < policy.reminder_interval_days:
            return None

        previous_owner_role = _role_for_owner(profile, violation.current_owner_id)
        new_owner_id, new_owner_role = _next_authority(db, profile, violation.current_owner_id)

        violation.current_owner_id = new_owner_id
        violation.escalation_level = 3
        violation.escalation_status = "LEVEL_3_REASSIGNED"
        violation.last_escalated_at = now
        db.add(violation)

        _post_system_comment(
            db, balance, profile, previous_owner_role, new_owner_role,
            violation.days_overdue, new_owner_id,
        )

        audit_service.log_action(
            db, "SLA_ESCALATION_LEVEL_3", user_id=actor_id,
            entity_type="sla_violations", entity_id=violation.id,
            metadata={
                "balance_id": balance.id, "profile_id": profile.id,
                "days_overdue": violation.days_overdue,
                "previous_owner_role": previous_owner_role,
                "new_owner_role": new_owner_role,
                "new_owner_id": new_owner_id,
            },
        )

        _notify(
            db, new_owner_id,
            title="SLA Escalation — Account Reassigned to You",
            message=(
                f"Balance #{balance.id} on profile '{profile.name}' has been escalated to you "
                f"({new_owner_role}) after {violation.days_overdue} day(s) overdue."
            ),
            icon_type="error",
        )

        db.commit()
        return 3

    # Already LEVEL_3_REASSIGNED or RESOLVED — nothing further to do.
    return None


# ─────────────────────────────────────────────────────────────────────────
# Manual override (Admin) — used by sla_router.py
# ─────────────────────────────────────────────────────────────────────────

def override_violation(
    db: Session,
    violation: "SLAViolation",
    escalation_level: Optional[int],
    escalation_status: Optional[str],
    current_owner_id: Optional[int],
    note: Optional[str],
    actor_id: int,
) -> "SLAViolation":
    before = {
        "escalation_level": violation.escalation_level,
        "escalation_status": violation.escalation_status,
        "current_owner_id": violation.current_owner_id,
    }
    if escalation_level is not None:
        violation.escalation_level = escalation_level
    if escalation_status is not None:
        violation.escalation_status = escalation_status
    if current_owner_id is not None:
        violation.current_owner_id = current_owner_id

    db.add(violation)

    audit_service.log_action(
        db, "SLA_VIOLATION_MANUAL_OVERRIDE", user_id=actor_id,
        entity_type="sla_violations", entity_id=violation.id,
        metadata={"before": before, "note": note},
    )
    db.commit()
    return violation
