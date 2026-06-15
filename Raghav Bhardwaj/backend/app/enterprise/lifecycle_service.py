"""
Reconciliation Lifecycle State Machine — Phase 2 Upgrade
=========================================================
Replaces lifecycle_service.py entirely.

New in Phase 2:
  - Dynamic approval_chain_json driving sequential + parallel tiers
  - Auto-certification: DRAFT → UNDER_REVIEW → APPROVED → CERTIFIED
    triggered on submit when variance == 0 or < auto_approve_threshold
  - Multi-level approve(): increments step index, handles parallel quorum,
    routes to next tier or finalises to APPROVED
  - Delegation: if the current approver has an active delegate, route to them
  - Enterprise SoD validation on chain creation/update
  - Chain immutability when balance is mid-workflow
  - All transitions write to certification_workflow_history + audit_service
  - Notification on every ownership change

Phase 3 hooks preserved:
  - journal_adjustment_pending blocks CERTIFY and CLOSE
  - assert_no_blocking_items() imported at call-site in lifecycle_router.py
"""
from __future__ import annotations
from .comment_service import create_system_event
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.models import (
    CertificationWorkflow,
    CertificationWorkflowHistory,
    ReconciliationProfile,
    User,
)
from ..services import audit_service, notification_service

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Status constants
# ─────────────────────────────────────────────────────────────
class LifecycleStatus:
    DRAFT        = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED     = "APPROVED"
    CERTIFIED    = "CERTIFIED"
    CLOSED       = "CLOSED"
    REJECTED     = "REJECTED"


LOCKED_STATES = {
    LifecycleStatus.UNDER_REVIEW,
    LifecycleStatus.APPROVED,
    LifecycleStatus.CERTIFIED,
    LifecycleStatus.CLOSED,
}

_SLA_DAYS = {"review": 3, "approval": 2, "certification": 2}

# Approval types
SEQ      = "SEQUENTIAL"
PARALLEL = "PARALLEL"


# ─────────────────────────────────────────────────────────────
# Approval chain schema helper
# ─────────────────────────────────────────────────────────────
# chain = [
#   {"approval_type": "SEQUENTIAL", "users": [uid]},
#   {"approval_type": "PARALLEL",   "users": [uid1, uid2]},
# ]

def _parse_chain(profile: ReconciliationProfile | None) -> list[dict]:
    """Parse approval_chain_json from the profile. Falls back to legacy single-user chain."""
    if profile is None:
        return []
    raw = getattr(profile, "approval_chain_json", None)
    if raw:
        try:
            chain = json.loads(raw)
            if isinstance(chain, list):
                return chain
        except Exception:
            pass
    # Legacy fallback: build a chain from assigned_reviewer + assigned_approver
    chain = []
    if profile.assigned_reviewer:
        chain.append({"approval_type": SEQ, "users": [profile.assigned_reviewer]})
    if profile.assigned_approver and profile.assigned_approver != profile.assigned_reviewer:
        chain.append({"approval_type": SEQ, "users": [profile.assigned_approver]})
    return chain


def _chain_user_ids(chain: list[dict]) -> set[int]:
    ids = set()
    for tier in chain:
        for uid in tier.get("users", []):
            if uid:
                ids.add(int(uid))
    return ids


# ─────────────────────────────────────────────────────────────
# Enterprise SoD validation
# ─────────────────────────────────────────────────────────────

def validate_chain_sod(
    db: Session,
    preparer_id: int | None,
    certifier_id: int | None,
    chain: list[dict],
) -> None:
    """
    Enforce on profile create/update:
    1. Preparer must not appear in the approval chain.
    2. No user may occupy more than one approval tier.
    3. Certifier must not appear in the approval chain.
    Raises HTTP 422 if any rule is violated.
    """
    chain_ids = _chain_user_ids(chain)
    errors = []

    if preparer_id and preparer_id in chain_ids:
        errors.append(f"Preparer (id={preparer_id}) cannot appear in the approval chain.")

    if certifier_id and certifier_id in chain_ids:
        errors.append(f"Certifier (id={certifier_id}) cannot appear in the approval chain (they certify, not approve).")

    # Check no user appears in more than one tier
    seen: set[int] = set()
    for tier in chain:
        tier_users = {int(u) for u in tier.get("users", []) if u}
        duplicates = tier_users & seen
        if duplicates:
            errors.append(f"User(s) {duplicates} appear in more than one approval tier — SoD violation.")
        seen |= tier_users

    if errors:
        raise HTTPException(status_code=422, detail={"sod_violations": errors})


# ─────────────────────────────────────────────────────────────
# Delegation resolver
# ─────────────────────────────────────────────────────────────

def _resolve_delegate(db: Session, user_id: int) -> int:
    """
    If the user has an active delegation, return the delegate's user_id.
    Otherwise return the original user_id.
    """
    now = _now()
    row = db.execute(
        text("""
            SELECT delegate_user_id, delegation_start_date, delegation_end_date
            FROM   users
            WHERE  id = :uid
              AND  delegate_user_id IS NOT NULL
        """),
        {"uid": user_id},
    ).fetchone()

    if not row or not row.delegate_user_id:
        return user_id

    start = row.delegation_start_date
    end   = row.delegation_end_date

    active = (start is None or start <= now) and (end is None or now <= end)
    if active:
        logger.info("Delegating from user %d to delegate %d", user_id, row.delegate_user_id)
        return int(row.delegate_user_id)
    return user_id


# ─────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _get_user(db: Session, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def _get_balance(db: Session, balance_id: int) -> Any:
    row = db.execute(
        text("SELECT * FROM reconciliation_balances WHERE id = :id"),
        {"id": balance_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Balance {balance_id} not found")
    return row


def _update_balance_cols(db: Session, balance_id: int, updates: dict) -> None:
    if not updates:
        return
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["_id"] = balance_id
    db.execute(
        text(f"UPDATE reconciliation_balances SET {set_clauses} WHERE id = :_id"),
        updates,
    )
    db.commit()


def _get_profile(db: Session, profile_id: int | None) -> ReconciliationProfile | None:
    if not profile_id:
        return None
    return db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()


def _ensure_synthetic_workflow(db: Session, balance_id: int) -> int:
    row = db.execute(
        text("SELECT id, profile_id FROM reconciliation_balances WHERE id = :id"),
        {"id": balance_id},
    ).fetchone()
    profile_id = row.profile_id if row and hasattr(row, "profile_id") else None

    existing = (
        db.query(CertificationWorkflow)
        .filter(
            CertificationWorkflow.status == "BALANCE_LIFECYCLE",
            CertificationWorkflow.profile_id == (profile_id or 0),
        )
        .first()
    )
    if existing:
        return existing.id

    wf = CertificationWorkflow(
        profile_id=profile_id or 0,
        status="BALANCE_LIFECYCLE",
        current_stage="LIFECYCLE",
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return wf.id


def _post_system_event(db: Session, balance_id: int, content: str) -> None:
    """
    Fire-and-forget system comment. Errors are swallowed so they
    never block the lifecycle transition.
    """
    try:
        from .comment_service import create_system_event
        create_system_event(db, balance_id, content)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "System comment failed (non-fatal, balance=%d): %s", balance_id, exc
        )


def _write_history(
    db: Session,
    *,
    balance_id: int,
    actor_id: int | None,
    actor_role: str | None,
    action: str,
    from_status: str,
    to_status: str,
    comments: str | None,
    extra_meta: dict | None = None,
) -> CertificationWorkflowHistory:
    synthetic_wf_id = _ensure_synthetic_workflow(db, balance_id)
    entry = CertificationWorkflowHistory(
        workflow_id=synthetic_wf_id,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        from_status=from_status,
        to_status=to_status,
        comments=comments,
        created_at=_now(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    meta = {
        "from_status": from_status,
        "to_status":   to_status,
        "action":      action,
        "actor_role":  actor_role,
        "comments":    comments,
    }
    if extra_meta:
        meta.update(extra_meta)

    audit_service.log_action(
        db,
        action_type=f"LIFECYCLE_{action}",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance_id,
        metadata=meta,
    )
    return entry


def _notify(
    db: Session,
    *,
    event_type: str,
    recipient_user_id: int | None,
    subject: str,
    body: str,
) -> None:
    if not recipient_user_id:
        return
    user = _get_user(db, recipient_user_id)
    if not user or not user.email:
        return
    try:
        notification_service.send_email(
            db,
            event_type=event_type,
            workflow_id=None,
            recipient_email=user.email,
            subject=subject,
            body=body,
        )
    except Exception as exc:
        logger.warning("Notification failed (non-fatal): %s", exc)


# ─────────────────────────────────────────────────────────────
# Immutability guard
# ─────────────────────────────────────────────────────────────

def assert_editable(balance_row: Any, actor_role: str = "") -> None:
    locked = getattr(balance_row, "is_certified_locked", False)
    if not locked:
        return
    if actor_role.lower() in ("admin", "certifier"):
        return
    raise HTTPException(
        status_code=423,
        detail=(
            "This balance is CERTIFIED and immutably locked. "
            "Contact an administrator for a Controller Override."
        ),
    )


def record_override(db: Session, balance_id: int, actor_id: int, reason: str) -> None:
    row = db.execute(
        text("SELECT override_log FROM reconciliation_balances WHERE id = :id"),
        {"id": balance_id},
    ).fetchone()
    existing = json.loads(row.override_log or "[]") if row else []
    existing.append({"actor_id": actor_id, "reason": reason, "timestamp": _now().isoformat()})
    db.execute(
        text("UPDATE reconciliation_balances SET override_log = :log WHERE id = :id"),
        {"log": json.dumps(existing), "id": balance_id},
    )
    db.commit()
    audit_service.log_action(
        db, action_type="LIFECYCLE_CONTROLLER_OVERRIDE",
        user_id=actor_id, entity_type="reconciliation_balance",
        entity_id=balance_id, metadata={"reason": reason},
    )


# ─────────────────────────────────────────────────────────────
# Chain lock guard
# ─────────────────────────────────────────────────────────────

def assert_chain_unlocked(db: Session, profile_id: int) -> None:
    """
    Prevent approval_chain_json changes while a balance is mid-workflow.
    Check reconciliation_balances for any active UNDER_REVIEW / APPROVED records.
    """
    count = db.execute(
        text("""
            SELECT COUNT(*) FROM reconciliation_balances
            WHERE profile_id = :pid
            AND   status IN ('UNDER_REVIEW', 'APPROVED')
        """),
        {"pid": profile_id},
    ).scalar() or 0

    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot modify the approval chain: {count} balance record(s) are currently "
                "UNDER_REVIEW or APPROVED on this profile. The chain is locked mid-workflow."
            ),
        )


# ─────────────────────────────────────────────────────────────
# Auto-certification engine
# ─────────────────────────────────────────────────────────────

def _run_auto_certify(
    db: Session,
    balance_id: int,
    balance_row: Any,
    profile: ReconciliationProfile | None,
    submitter_id: int,
) -> bool:
    """
    Check auto-certify conditions on submit.
    If met, rapidly step DRAFT → UNDER_REVIEW → APPROVED → CERTIFIED,
    writing a history entry for each transition with actor=SYSTEM.
    Returns True if auto-certification ran.
    """
    if not profile:
        return False
    auto_certify = getattr(profile, "auto_certify", False)
    if not auto_certify:
        return False

    risk = (profile.risk_classification or "").upper()
    if risk not in ("LOW", "MEDIUM"):
        return False

    threshold  = float(profile.auto_approve_threshold or profile.tolerance_threshold or 0.0)
    variance   = abs(float(getattr(balance_row, "unexplained_variance", None) or 0.0))

    if variance > threshold:
        return False

    now = _now()
    auto_comment = (
        f"⚡ AUTO-CERTIFIED by System Engine — "
        f"variance {variance:.2f} ≤ threshold {threshold:.2f} "
        f"(risk: {risk}). Submitted by user #{submitter_id}."
    )

    # Step 1: DRAFT → UNDER_REVIEW
    _write_history(db, balance_id=balance_id, actor_id=None, actor_role="SYSTEM",
        action="AUTO_SUBMIT", from_status=LifecycleStatus.DRAFT,
        to_status=LifecycleStatus.UNDER_REVIEW, comments=auto_comment,
        extra_meta={"approval_type": "SYSTEM_AUTO_APPROVAL"},
    )

    # Step 2: UNDER_REVIEW → APPROVED
    _write_history(db, balance_id=balance_id, actor_id=None, actor_role="SYSTEM",
        action="AUTO_APPROVE", from_status=LifecycleStatus.UNDER_REVIEW,
        to_status=LifecycleStatus.APPROVED, comments=auto_comment,
        extra_meta={"approval_type": "SYSTEM_AUTO_APPROVAL"},
    )

    # Step 3: APPROVED → CERTIFIED
    _write_history(db, balance_id=balance_id, actor_id=None, actor_role="SYSTEM",
        action="AUTO_CERTIFY", from_status=LifecycleStatus.APPROVED,
        to_status=LifecycleStatus.CERTIFIED, comments=auto_comment,
        extra_meta={"approval_type": "SYSTEM_AUTO_APPROVAL"},
    )

    _update_balance_cols(db, balance_id, {
        "status":                 LifecycleStatus.CERTIFIED,
        "is_certified_locked":    1,
        "auto_certified":         1,
        "submitted_at":           now,
        "approved_at":            now,
        "certification_due_date": now,
        "current_owner_id":       None,
        "current_owner_role":     "SYSTEM",
        "assigned_at":            now,
        "submit_comment":         auto_comment,
        "approval_comment":       auto_comment,
        "certification_comment":  auto_comment,
    })

    _post_system_event(
        db, balance_id,
        f"⚡ Auto-Certified by System Engine. "
        f"Variance {variance:.2f} ≤ threshold {threshold:.2f} (risk: {risk})."
    )

    # Notify all stakeholders
    for uid in filter(None, [
        profile.assigned_preparer, profile.assigned_reviewer,
        profile.assigned_approver, profile.assigned_certifier,
    ]):
        _notify(
            db, event_type="AUTO_CERTIFIED",
            recipient_user_id=uid,
            subject="[DRMS] ⚡ Balance Auto-Certified by System Engine",
            body=(
                f"Balance #{balance_id} was automatically certified.\n\n"
                f"Reason: {auto_comment}\n"
                f"Date: {now.strftime('%Y-%m-%d %H:%M UTC')}"
            ),
        )

    logger.info("Auto-certified balance %d (variance=%.2f threshold=%.2f)", balance_id, variance, threshold)
    return True


# ─────────────────────────────────────────────────────────────
# SUBMIT — DRAFT → UNDER_REVIEW (or CERTIFIED via auto-cert)
# ─────────────────────────────────────────────────────────────

def submit_balance(
    db: Session,
    balance_id: int,
    actor_id: int,
    actor_role: str,
    comment: str,
) -> dict:
    if not comment or not comment.strip():
        raise HTTPException(status_code=400, detail="submit_comment is required")

    balance = _get_balance(db, balance_id)
    current_status = getattr(balance, "status", None)

    if current_status not in (LifecycleStatus.DRAFT, LifecycleStatus.REJECTED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit from '{current_status}'. Must be DRAFT or REJECTED.",
        )

    profile = _get_profile(db, getattr(balance, "profile_id", None))

    # SoD: only assigned preparer (or admin)
    if profile and profile.assigned_preparer and profile.assigned_preparer != actor_id:
        if actor_role.lower() != "admin":
            raise HTTPException(status_code=403, detail="Only the assigned Preparer may submit.")

    # Auto-certification check
    if _run_auto_certify(db, balance_id, balance, profile, actor_id):
        return {
            "balance_id":     balance_id,
            "status":         LifecycleStatus.CERTIFIED,
            "action":         "AUTO_CERTIFY",
            "auto_certified": True,
        }

    # Normal submit
    now = _now()
    chain = _parse_chain(profile)
    first_tier = chain[0] if chain else None
    first_approver_id = None
    if first_tier:
        users = first_tier.get("users", [])
        if users:
            raw_id = int(users[0])
            first_approver_id = _resolve_delegate(db, raw_id)

    _update_balance_cols(db, balance_id, {
        "status":                      LifecycleStatus.UNDER_REVIEW,
        "submitted_at":                now,
        "submit_comment":              comment.strip(),
        "review_due_date":             now + timedelta(days=_SLA_DAYS["review"]),
        "current_approval_step_index": 0,
        "parallel_approvals_json":     "[]",
        "current_owner_id":            first_approver_id,
        "current_owner_role":          "reviewer",
        "assigned_at":                 now,
        "step_due_at":                 now + timedelta(days=_SLA_DAYS["approval"]),
        "rejection_comment":           None,
    })

    _write_history(
        db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
        action="SUBMIT", from_status=current_status,
        to_status=LifecycleStatus.UNDER_REVIEW, comments=comment,
    )

    _post_system_event(
        db, balance_id,
        f"⚑ Submitted for review by {actor_role} (user #{actor_id}). "
        f"Comment: {comment[:120]}{'…' if len(comment) > 120 else ''}"
    )

    if first_approver_id:
        _notify(
            db, event_type="REVIEW_REQUIRED",
            recipient_user_id=first_approver_id,
            subject="[DRMS] Review Required — Balance Reconciliation",
            body=(
                f"Balance #{balance_id} has been submitted for your review.\n"
                f"Submitted by user #{actor_id}\nComment: {comment}\n"
                f"Due: {(now + timedelta(days=_SLA_DAYS['review'])).strftime('%Y-%m-%d')}"
            ),
        )

    return {"balance_id": balance_id, "status": LifecycleStatus.UNDER_REVIEW, "action": "SUBMIT"}


# ─────────────────────────────────────────────────────────────
# APPROVE — multi-level, parallel, delegation
# ─────────────────────────────────────────────────────────────

def approve_balance(
    db: Session,
    balance_id: int,
    actor_id: int,
    actor_role: str,
    comment: str | None,
) -> dict:
    balance = _get_balance(db, balance_id)
    current_status = getattr(balance, "status", None)

    if current_status != LifecycleStatus.UNDER_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve from '{current_status}'. Must be UNDER_REVIEW.",
        )

    profile  = _get_profile(db, getattr(balance, "profile_id", None))
    chain    = _parse_chain(profile)
    step_idx = int(getattr(balance, "current_approval_step_index", 0) or 0)

    if step_idx >= len(chain) and chain and actor_role.lower() != "admin":
        raise HTTPException(status_code=400, detail="All approval tiers have already been completed.")

    # Resolve delegation for actor
    effective_actor = _resolve_delegate(db, actor_id)

    # Validate actor is in the current tier (or admin)
    if chain and actor_role.lower() != "admin":
        current_tier = chain[step_idx]
        tier_users   = {_resolve_delegate(db, int(u)) for u in current_tier.get("users", []) if u}
        if effective_actor not in tier_users and actor_id not in {int(u) for u in current_tier.get("users", [])}:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"You are not assigned to approval tier {step_idx + 1} "
                    f"({'PARALLEL' if current_tier.get('approval_type') == PARALLEL else 'SEQUENTIAL'})."
                ),
            )

    # SoD: submitter cannot approve
    submit_actors = db.execute(
        text("""
            SELECT actor_id FROM certification_workflow_history cwh
            JOIN   certification_workflows cw ON cw.id = cwh.workflow_id
            WHERE  cw.status = 'BALANCE_LIFECYCLE'
            AND    cwh.action = 'SUBMIT'
            ORDER  BY cwh.created_at DESC LIMIT 1
        """),
    ).fetchone()
    if submit_actors and submit_actors.actor_id in (actor_id, effective_actor) and actor_role.lower() != "admin":
        raise HTTPException(
            status_code=400,
            detail="SoD violation: the preparer who submitted cannot approve.",
        )

    now        = _now()
    tier_type  = chain[step_idx].get("approval_type", SEQ) if chain else SEQ
    tier_users_raw = [int(u) for u in chain[step_idx].get("users", [])] if chain else []

    # ── PARALLEL tier logic ──
    if tier_type == PARALLEL and len(tier_users_raw) > 1:
        parallel_so_far = json.loads(getattr(balance, "parallel_approvals_json", None) or "[]")
        if effective_actor not in parallel_so_far:
            parallel_so_far.append(effective_actor)

        all_approved = all(
            _resolve_delegate(db, u) in parallel_so_far or u in parallel_so_far
            for u in tier_users_raw
        )

        _update_balance_cols(db, balance_id, {
            "parallel_approvals_json": json.dumps(parallel_so_far),
        })

        _write_history(
            db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
            action="PARALLEL_APPROVE", from_status=current_status,
            to_status=current_status,
            comments=comment or f"Parallel approval ({len(parallel_so_far)}/{len(tier_users_raw)})",
            extra_meta={"tier_index": step_idx, "parallel_done": all_approved},
        )

        if not all_approved:
            # Notify remaining approvers
            remaining = [
                u for u in tier_users_raw
                if _resolve_delegate(db, u) not in parallel_so_far and u not in parallel_so_far
            ]
            for uid in remaining:
                _notify(
                    db, event_type="PARALLEL_APPROVAL_NEEDED",
                    recipient_user_id=uid,
                    subject=f"[DRMS] Parallel Approval Required ({len(parallel_so_far)}/{len(tier_users_raw)} done)",
                    body=(
                        f"Balance #{balance_id} needs your approval.\n"
                        f"Tier {step_idx + 1} (PARALLEL): {len(parallel_so_far)} of {len(tier_users_raw)} approvals received."
                    ),
                )
            return {
                "balance_id":              balance_id,
                "status":                  current_status,
                "action":                  "PARALLEL_APPROVE",
                "tier_index":              step_idx,
                "parallel_approvals":      len(parallel_so_far),
                "parallel_total":          len(tier_users_raw),
                "quorum_reached":          False,
            }
        # Quorum reached — fall through to advance step

    # ── Advance to next tier or APPROVED ──
    next_step = step_idx + 1

    if next_step < len(chain):
        # More tiers remain — keep UNDER_REVIEW, route to next tier
        next_tier        = chain[next_step]
        next_tier_users  = [int(u) for u in next_tier.get("users", []) if u]
        next_owner_id    = _resolve_delegate(db, next_tier_users[0]) if next_tier_users else None

        _update_balance_cols(db, balance_id, {
            "current_approval_step_index": next_step,
            "parallel_approvals_json":     "[]",
            "current_owner_id":            next_owner_id,
            "current_owner_role":          "approver",
            "assigned_at":                 now,
            "step_due_at":                 now + timedelta(days=_SLA_DAYS["approval"]),
            "approval_comment":            (comment or "").strip() or None,
        })

        _write_history(
            db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
            action="TIER_APPROVED", from_status=current_status,
            to_status=current_status,
            comments=comment,
            extra_meta={"completed_tier": step_idx, "next_tier": next_step},
        )

        _post_system_event(
            db, balance_id,
            f"✓ Tier {step_idx + 1} approved by user #{actor_id}. "
            f"Routing to Tier {next_step + 1} of {len(chain)}."
        )

        # Notify next tier approvers
        for uid in next_tier_users:
            effective_next = _resolve_delegate(db, uid)
            _notify(
                db, event_type="APPROVAL_REQUIRED",
                recipient_user_id=effective_next,
                subject=f"[DRMS] Approval Required — Tier {next_step + 1}",
                body=(
                    f"Balance #{balance_id} has passed tier {step_idx + 1} and requires your approval (tier {next_step + 1}).\n"
                    f"Prev approver: user #{actor_id}\nComment: {comment or '—'}"
                ),
            )

        return {
            "balance_id":    balance_id,
            "status":        current_status,
            "action":        "TIER_APPROVED",
            "completed_tier": step_idx,
            "next_tier":     next_step,
            "total_tiers":   len(chain),
        }

    # ── Final tier approved — transition to APPROVED ──
    certifier_id = profile.assigned_certifier if profile else None

    _update_balance_cols(db, balance_id, {
        "status":                      LifecycleStatus.APPROVED,
        "approval_comment":            (comment or "").strip() or None,
        "approved_at":                 now,
        "approval_due_date":           now,
        "current_approval_step_index": next_step,
        "parallel_approvals_json":     "[]",
        "current_owner_id":            certifier_id,
        "current_owner_role":          "certifier",
        "assigned_at":                 now,
        "step_due_at":                 now + timedelta(days=_SLA_DAYS["certification"]),
    })

    _write_history(
        db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
        action="APPROVE", from_status=current_status,
        to_status=LifecycleStatus.APPROVED, comments=comment,
        extra_meta={"final_tier": step_idx, "total_tiers": len(chain)},
    )

    _post_system_event(
        db, balance_id,
        f"✓ Final approval given by {actor_role} (user #{actor_id}) — "
        f"all {len(chain)} tier(s) complete. Balance moved to APPROVED."
        + (f" Comment: {comment}" if comment else "")
    )

    _notify(
        db, event_type="CERTIFICATION_REQUIRED",
        recipient_user_id=certifier_id,
        subject="[DRMS] Certification Required — Balance Fully Approved",
        body=(
            f"Balance #{balance_id} has cleared all {len(chain)} approval tier(s) and is ready to certify.\n"
            f"Final approver: user #{actor_id}\nComment: {comment or '—'}"
        ),
    )

    return {
        "balance_id":  balance_id,
        "status":      LifecycleStatus.APPROVED,
        "action":      "APPROVE",
        "total_tiers": len(chain),
    }


# ─────────────────────────────────────────────────────────────
# REJECT — resets chain, returns to preparer
# ─────────────────────────────────────────────────────────────

def reject_balance(
    db: Session,
    balance_id: int,
    actor_id: int,
    actor_role: str,
    comment: str,
) -> dict:
    if not comment or not comment.strip():
        raise HTTPException(status_code=400, detail="rejection_comment is required")

    balance = _get_balance(db, balance_id)
    current_status = getattr(balance, "status", None)

    if current_status not in (LifecycleStatus.UNDER_REVIEW, LifecycleStatus.APPROVED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject from '{current_status}'.",
        )

    profile    = _get_profile(db, getattr(balance, "profile_id", None))
    preparer_id = profile.assigned_preparer if profile else None
    now        = _now()

    _update_balance_cols(db, balance_id, {
        "status":                      LifecycleStatus.DRAFT,
        "rejection_comment":           comment.strip(),
        "current_approval_step_index": 0,
        "parallel_approvals_json":     "[]",
        "current_owner_id":            preparer_id,
        "current_owner_role":          "preparer",
        "assigned_at":                 now,
        "submitted_at":                None,
        "review_due_date":             None,
        "approval_due_date":           None,
        "approved_at":                 None,
        "step_due_at":                 None,
    })

    _write_history(
        db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
        action="REJECT", from_status=current_status,
        to_status=LifecycleStatus.DRAFT, comments=comment,
    )

    _post_system_event(
        db, balance_id,
        f"✗ Rejected by {actor_role} (user #{actor_id}) — "
        f"returned to Preparer. Approval chain reset. "
        f"Reason: {comment[:200]}{'…' if len(comment) > 200 else ''}"
    )

    _notify(
        db, event_type="RECONCILIATION_REJECTED",
        recipient_user_id=preparer_id,
        subject="[DRMS] Reconciliation Rejected — Revision Required",
        body=(
            f"Balance #{balance_id} was rejected and returned to you.\n"
            f"Rejected by: user #{actor_id} ({actor_role})\nReason: {comment}\n"
            "Please revise and resubmit. The approval chain has been fully reset."
        ),
    )

    return {"balance_id": balance_id, "status": LifecycleStatus.DRAFT, "action": "REJECT"}


# ─────────────────────────────────────────────────────────────
# CERTIFY + CLOSE (unchanged from Phase 1 except minor cleanup)
# ─────────────────────────────────────────────────────────────

def certify_balance(
    db: Session,
    balance_id: int,
    actor_id: int,
    actor_role: str,
    comment: str | None,
) -> dict:
    balance = _get_balance(db, balance_id)
    current_status = getattr(balance, "status", None)

    if current_status != LifecycleStatus.APPROVED:
        raise HTTPException(status_code=400, detail=f"Cannot certify from '{current_status}'. Must be APPROVED.")

    if actor_role.lower() not in ("certifier", "admin"):
        raise HTTPException(status_code=403, detail="Only the Controller (certifier) or Admin may certify.")

    pending = getattr(balance, "journal_adjustment_pending", False)
    if pending and actor_role.lower() != "admin":
        raise HTTPException(status_code=409, detail="Journal Adjustment is pending — process it first.")

    # Supporting items block (imported at call-site in router)
    # assert_no_blocking_items(db, balance_id)  ← called by router before this

    now = _now()
    _update_balance_cols(db, balance_id, {
        "status":                 LifecycleStatus.CERTIFIED,
        "is_certified_locked":    1,
        "certification_comment":  (comment or "").strip() or None,
        "certification_due_date": now,
        "current_owner_id":       None,
        "current_owner_role":     "system",
        "assigned_at":            now,
    })

    _write_history(
        db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
        action="CERTIFY", from_status=current_status,
        to_status=LifecycleStatus.CERTIFIED, comments=comment,
    )

    _post_system_event(
        db, balance_id,
        f"🔒 Certified by Controller (user #{actor_id}). "
        "Balance record is now immutably locked. "
        "This comment thread is now a read-only audit artifact."
        + (f" Note: {comment}" if comment else "")
    )

    profile = _get_profile(db, getattr(balance, "profile_id", None))
    if profile:
        chain_ids = _chain_user_ids(_parse_chain(profile))
        all_stakeholders = chain_ids | set(filter(None, [
            profile.assigned_preparer, profile.assigned_certifier,
        ]))
        for uid in all_stakeholders:
            _notify(
                db, event_type="RECONCILIATION_CERTIFIED",
                recipient_user_id=uid,
                subject="[DRMS] Reconciliation Cycle Certified",
                body=(
                    f"Balance #{balance_id} has been certified and locked.\n"
                    f"Certified by: user #{actor_id}\nComment: {comment or '—'}\n"
                    f"Date: {now.strftime('%Y-%m-%d %H:%M UTC')}"
                ),
            )

    return {"balance_id": balance_id, "status": LifecycleStatus.CERTIFIED, "action": "CERTIFY"}


def close_balance(
    db: Session,
    balance_id: int,
    actor_id: int,
    actor_role: str,
) -> dict:
    if actor_role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Only Admin may close.")

    balance = _get_balance(db, balance_id)
    current_status = getattr(balance, "status", None)

    if current_status != LifecycleStatus.CERTIFIED:
        raise HTTPException(status_code=400, detail=f"Cannot close from '{current_status}'. Must be CERTIFIED.")

    if getattr(balance, "journal_adjustment_pending", False):
        raise HTTPException(status_code=409, detail="Journal Adjustment is pending.")

    _update_balance_cols(db, balance_id, {
        "status":             LifecycleStatus.CLOSED,
        "current_owner_role": "system",
    })

    _write_history(
        db, balance_id=balance_id, actor_id=actor_id, actor_role=actor_role,
        action="CLOSE", from_status=current_status,
        to_status=LifecycleStatus.CLOSED, comments=None,
    )

    return {"balance_id": balance_id, "status": LifecycleStatus.CLOSED, "action": "CLOSE"}


# ─────────────────────────────────────────────────────────────
# History fetch (enriched with chain metadata)
# ─────────────────────────────────────────────────────────────

def get_workflow_history(db: Session, balance_id: int) -> list[dict]:
    synthetic_wf_id = _ensure_synthetic_workflow(db, balance_id)
    entries = (
        db.query(CertificationWorkflowHistory)
        .filter(CertificationWorkflowHistory.workflow_id == synthetic_wf_id)
        .order_by(CertificationWorkflowHistory.created_at.desc())
        .all()
    )
    result = []
    for e in entries:
        actor = _get_user(db, e.actor_id) if e.actor_id else None
        result.append({
            "id":          e.id,
            "action":      e.action,
            "from_status": e.from_status,
            "to_status":   e.to_status,
            "actor_id":    e.actor_id,
            "actor_name":  actor.username if actor else "system",
            "actor_email": actor.email    if actor else None,
            "role":        e.actor_role,
            "timestamp":   e.created_at.isoformat() if e.created_at else None,
            "comment":     e.comments,
            "is_auto":     e.action in ("AUTO_SUBMIT", "AUTO_APPROVE", "AUTO_CERTIFY"),
        })
    return result


def get_chain_status(db: Session, balance_id: int) -> dict:
    """
    Return a real-time view of approval chain progress for the UI stepper.
    Includes tier definitions, completion state, parallel quorum progress,
    and active tier indicator.
    """
    balance  = _get_balance(db, balance_id)
    profile  = _get_profile(db, getattr(balance, "profile_id", None))
    chain    = _parse_chain(profile)
    step_idx = int(getattr(balance, "current_approval_step_index", 0) or 0)
    parallel = json.loads(getattr(balance, "parallel_approvals_json", None) or "[]")
    status   = getattr(balance, "status", "DRAFT")
    auto     = bool(getattr(balance, "auto_certified", False))

    tiers = []
    for i, tier in enumerate(chain):
        tier_users_raw = [int(u) for u in tier.get("users", []) if u]
        tier_type      = tier.get("approval_type", SEQ)
        completed      = i < step_idx or status in (LifecycleStatus.APPROVED, LifecycleStatus.CERTIFIED, LifecycleStatus.CLOSED)
        active         = i == step_idx and status == LifecycleStatus.UNDER_REVIEW
        parallel_done  = len(parallel) if active and tier_type == PARALLEL else (len(tier_users_raw) if completed else 0)

        user_details = []
        for uid in tier_users_raw:
            u = _get_user(db, uid)
            effective = _resolve_delegate(db, uid)
            delegate  = _get_user(db, effective) if effective != uid else None
            user_details.append({
                "id":               uid,
                "username":         u.username   if u else str(uid),
                "email":            u.email      if u else None,
                "has_approved":     uid in parallel or effective in parallel if (active and tier_type == PARALLEL) else completed,
                "delegate_id":      effective if effective != uid else None,
                "delegate_username": delegate.username if delegate else None,
            })

        tiers.append({
            "tier_index":      i,
            "approval_type":   tier_type,
            "users":           user_details,
            "completed":       completed,
            "active":          active,
            "parallel_done":   parallel_done,
            "parallel_total":  len(tier_users_raw) if tier_type == PARALLEL else 1,
        })

    return {
        "balance_id":    balance_id,
        "status":        status,
        "auto_certified": auto,
        "step_index":    step_idx,
        "total_tiers":   len(chain),
        "chain":         tiers,
    }