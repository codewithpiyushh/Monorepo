"""
backend/app/services/close_calendar_service.py

Financial Close Calendar Engine — Phase 2, Chunk 3.

Orchestration layer that groups many reconciliation profiles into a single
month-end / quarter-end close period, tracks aggregate completion and
certification progress, and enforces Close Readiness Validation before a
period can be marked CLOSED.

Reuses existing engines rather than re-implementing them:
  - Balance status / variance classification  → reconciliation_balances
  - Supporting items materiality              → supporting_items (Phase 1 #5)
  - Exception aging                           → exception_queue_records
  - Approval / certification workflow state   → certification_workflows

NOTE ON AUDIT LOGGING: your hash-chain audit_service module wasn't in the
files available to me, so this module writes AuditLog rows directly using
the exact schema you already have (previous_hash / entry_hash chain
columns). If you have a centralized `audit_service.log_action()` helper
with a different signature, swap `_write_audit_log()` below for that call —
everything else is unaffected.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import (
    ReconciliationProfile,
    CertificationWorkflow,
    MatchGroup,
    ExceptionQueueRecord,
    UINotification,
    AuditLog,
)
from .close_calendar_schemas import (
    ClosePeriodSummary,
    CloseCalendarKPIs,
    ClosePeriodTaskItem,
    BlockerRecord,
    BurndownPoint,
    VarianceDensityCell,
    ApprovalBottleneck,
    SLACalendarSection,
    SLABottleneckApprover,
)

log = logging.getLogger("drms.close_calendar")

# ── Optional model imports (graceful degradation if not yet migrated) ──────

try:
    from ..models.models import ClosePeriod, ClosePeriodTask
except ImportError:
    raise ImportError(
        "ClosePeriod / ClosePeriodTask not found in models.models — "
        "apply close_calendar_model_addition.py and the migration first."
    )

try:
    from ..models.models import ReconciliationBalance
    HAS_BALANCE = True
except ImportError:
    HAS_BALANCE = False

try:
    from ..models.models import SupportingItem
    HAS_SUPPORTING_ITEMS = True
except ImportError:
    HAS_SUPPORTING_ITEMS = False

try:
    from ..models.models import SLAViolation, User
    HAS_SLA = True
except ImportError:
    HAS_SLA = False


AGING_CRITICAL_DAYS = 90
BOTTLENECK_STALL_DAYS = 3
NEAR_DEADLINE_DAYS = 5

STAGE_TO_ROLE = {
    "PREPARER":  "preparer",
    "PREPARED":  "preparer",
    "REVIEWER":  "reviewer",
    "UNDER_REVIEW": "reviewer",
    "APPROVER":  "approver",
    "APPROVED":  "approver",
    "CERTIFIER": "certifier",
    "CERTIFIED": "certifier",
}


# ─────────────────────────────────────────────────────────────────────────
# Audit logging (inline — see module docstring)
# ─────────────────────────────────────────────────────────────────────────

def _write_audit_log(db: Session, user_id: Optional[int], action_type: str,
                      entity_id: int, metadata: dict) -> None:
    try:
        prev = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
        prev_hash = prev.entry_hash if prev else ""
        payload = json.dumps(metadata, default=str, sort_keys=True)
        entry_hash = hashlib.sha256(f"{prev_hash}|{action_type}|{entity_id}|{payload}".encode()).hexdigest()
        entry = AuditLog(
            user_id=user_id,
            action_type=action_type,
            entity_type="close_periods",
            entity_id=entity_id,
            metadata_json=payload,
            previous_hash=prev_hash,
            entry_hash=entry_hash,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        log.warning(f"[close_calendar] audit log write failed (non-fatal): {e}")
        db.rollback()


def _notify(db: Session, user_id: Optional[int], ntype: str, title: str, message: str, icon: str = "info") -> None:
    if not user_id:
        return
    try:
        n = UINotification(
            user_id=user_id, notification_type=ntype,
            title=title, message=message, icon_type=icon,
            is_read=False, created_at=datetime.utcnow(),
        )
        db.add(n)
        db.commit()
    except Exception as e:
        log.warning(f"[close_calendar] notification write failed (non-fatal): {e}")
        db.rollback()


# ─────────────────────────────────────────────────────────────────────────
# Progress computation
# ─────────────────────────────────────────────────────────────────────────

def _today_str() -> str:
    return date.today().isoformat()


def sync_period_tasks_with_workflows(db: Session, period_id: int):
    """
    Syncs ClosePeriodTask status and completion percentage with the actual
    CertificationWorkflow status for the given close period.
    """
    from ..models.models import ClosePeriod, ClosePeriodTask, FinancialCloseCalendar, CertificationWorkflow
    
    period = db.query(ClosePeriod).filter(ClosePeriod.id == period_id).first()
    if not period:
        return
        
    tasks = db.query(ClosePeriodTask).filter(ClosePeriodTask.close_period_id == period.id).all()
    for task in tasks:
        # Find FinancialCloseCalendar for this profile and period key
        calendar = db.query(FinancialCloseCalendar).filter(
            FinancialCloseCalendar.profile_id == task.profile_id,
            FinancialCloseCalendar.period_key == period.period_key
        ).first()
        if not calendar:
            continue
            
        # Find CertificationWorkflow for this calendar
        wf = db.query(CertificationWorkflow).filter(
            CertificationWorkflow.calendar_id == calendar.id
        ).first()
        if not wf:
            continue
            
        # Determine status and completion based on workflow status
        wf_status = (wf.status or "OPEN").upper().strip()
        if wf_status in ("OPEN", "REOPENED"):
            task_status, completion = "NOT_STARTED", 0.0
        elif wf_status == "PREPARED":
            task_status, completion = "IN_PROGRESS", 33.0
        elif wf_status == "SUBMITTED":
            task_status, completion = "UNDER_REVIEW", 66.0
        elif wf_status == "REVIEWED":
            task_status, completion = "UNDER_REVIEW", 80.0
        elif wf_status == "APPROVED":
            task_status, completion = "UNDER_REVIEW", 90.0
        elif wf_status == "CERTIFIED":
            task_status, completion = "CERTIFIED", 100.0
        else:
            task_status, completion = "NOT_STARTED", 0.0
            
        task.task_status = task_status
        task.completion_percentage = completion
        db.add(task)
    db.commit()


def recalc_period_progress(db: Session, period: "ClosePeriod") -> dict:
    """
    Computes live progress for a period from its ClosePeriodTask rows and
    persists the denormalized counters on the ClosePeriod row itself.
    """
    tasks = db.query(ClosePeriodTask).filter(ClosePeriodTask.close_period_id == period.id).all()

    total = len(tasks)
    completed = sum(1 for t in tasks if (t.completion_percentage or 0) >= 100)
    certified = sum(1 for t in tasks if t.task_status == "CERTIFIED")

    period.total_profiles = total
    period.completed_profiles = completed
    period.certified_profiles = certified
    db.add(period)
    db.commit()

    completion_pct = round((completed / total) * 100, 1) if total else 0.0
    certification_pct = round((certified / total) * 100, 1) if total else 0.0

    return {
        "total": total, "completed": completed, "certified": certified,
        "completion_pct": completion_pct, "certification_pct": certification_pct,
    }


def _open_issues_count(db: Session, profile_ids: list[int]) -> int:
    """Lightweight issue count used in the period overview grid (not the full validation)."""
    if not profile_ids:
        return 0
    count = 0

    if HAS_BALANCE:
        count += db.query(ReconciliationBalance).filter(
            ReconciliationBalance.profile_id.in_(profile_ids),
            ReconciliationBalance.status.in_(["DRAFT", "UNDER_REVIEW"]),
        ).count()
        count += db.query(ReconciliationBalance).filter(
            ReconciliationBalance.profile_id.in_(profile_ids),
            ReconciliationBalance.variance_severity_classification.in_(["MATERIAL_VARIANCE", "CRITICAL_VARIANCE"]),
            ReconciliationBalance.status != "CERTIFIED",
        ).count()

    cutoff = datetime.utcnow() - timedelta(days=AGING_CRITICAL_DAYS)
    count += (
        db.query(ExceptionQueueRecord)
        .join(MatchGroup, ExceptionQueueRecord.match_group_id == MatchGroup.id)
        .filter(
            MatchGroup.profile_id.in_(profile_ids),
            ExceptionQueueRecord.status != "RESOLVED",
            ExceptionQueueRecord.created_at <= cutoff,
        ).count()
    )
    return count


def _profile_ids_for_period(db: Session, period_id: int) -> list[int]:
    rows = db.query(ClosePeriodTask.profile_id).filter(
        ClosePeriodTask.close_period_id == period_id
    ).distinct().all()
    return [r[0] for r in rows]


# ─────────────────────────────────────────────────────────────────────────
# SLA Monitoring integration (Phase 2, Chunk 4, Part 5)
# ─────────────────────────────────────────────────────────────────────────
# Reuses sla_violations directly rather than re-deriving overdue state —
# the SLA scanning engine (sla_monitoring_service.run_sla_scan) is the
# single source of truth for what's overdue; this just reads its output.

def _compute_sla_section(db: Session, profile_ids: list[int]) -> Optional["SLACalendarSection"]:
    if not HAS_SLA or not profile_ids:
        return None

    violations = db.query(SLAViolation).filter(SLAViolation.profile_id.in_(profile_ids)).all()
    open_violations = [v for v in violations if v.status == "OPEN"]

    profiles = {
        p.id: p for p in db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(profile_ids)).all()
    }

    by_priority = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for v in open_violations:
        prof = profiles.get(v.profile_id)
        priority = (prof.risk_classification if prof else "MEDIUM") or "MEDIUM"
        if priority in by_priority:
            by_priority[priority] += 1

    # "Overdue Reconciliations" — balances past SLA regardless of violation
    # record status (i.e. OPEN + ACKNOWLEDGED both count; only RESOLVED excluded)
    overdue_recon_count = len([v for v in violations if v.status != "RESOLVED"])

    escalated_accounts = [v for v in open_violations if v.escalation_level == 3]
    overdue_certs = [v for v in open_violations if v.violation_type == "CERTIFICATION_OVERDUE"]

    # Bottleneck approvers — approvers with the most open violations currently assigned
    approver_counts: dict[int, int] = {}
    for v in open_violations:
        if v.current_owner_id:
            approver_counts[v.current_owner_id] = approver_counts.get(v.current_owner_id, 0) + 1

    bottlenecks = []
    if approver_counts:
        user_ids = list(approver_counts.keys())
        users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        for uid, count in sorted(approver_counts.items(), key=lambda kv: -kv[1])[:10]:
            u = users.get(uid)
            bottlenecks.append(SLABottleneckApprover(
                user_id=uid, user_name=getattr(u, "username", f"User #{uid}"),
                open_violation_count=count,
            ))

    return SLACalendarSection(
        open_sla_violations_count=len(open_violations),
        open_sla_violations_by_priority=by_priority,
        overdue_reconciliations_count=overdue_recon_count,
        escalated_accounts_count=len(escalated_accounts),
        overdue_certifications_count=len(overdue_certs),
        bottleneck_approvers=bottlenecks,
    )


# ─────────────────────────────────────────────────────────────────────────
# Period list / KPI cards
# ─────────────────────────────────────────────────────────────────────────

def list_close_periods(db: Session) -> dict:
    periods = db.query(ClosePeriod).order_by(ClosePeriod.due_date.asc()).all()

    summaries = []
    today = date.today()
    near_deadline = 0
    open_periods = 0
    overdue_tasks_total = 0
    material_variances_total = 0
    pending_certs_total = 0

    for p in periods:
        sync_period_tasks_with_workflows(db, p.id)
        progress = recalc_period_progress(db, p)
        profile_ids = _profile_ids_for_period(db, p.id)
        open_issues = _open_issues_count(db, profile_ids)

        summaries.append(ClosePeriodSummary(
            id=p.id, period_name=p.period_name, period_key=p.period_key,
            start_date=p.start_date, due_date=p.due_date, close_status=p.close_status,
            total_profiles=progress["total"], completed_profiles=progress["completed"],
            certified_profiles=progress["certified"],
            completion_pct=progress["completion_pct"], certification_pct=progress["certification_pct"],
            open_issues=open_issues, is_demo_data=bool(p.is_demo_data),
            overdue_certification_threshold=getattr(p, "overdue_certification_threshold", 5) or 5,
            created_at=p.created_at,
        ))

        if p.close_status != "CLOSED":
            open_periods += 1
            try:
                due = date.fromisoformat(p.due_date)
                if 0 <= (due - today).days <= NEAR_DEADLINE_DAYS:
                    near_deadline += 1
            except (ValueError, TypeError):
                pass

        overdue_tasks_total += db.query(ClosePeriodTask).filter(
            ClosePeriodTask.close_period_id == p.id,
            ClosePeriodTask.task_status != "CERTIFIED",
            ClosePeriodTask.target_due_date < _today_str(),
        ).count()

        if HAS_BALANCE and profile_ids:
            material_variances_total += db.query(ReconciliationBalance).filter(
                ReconciliationBalance.profile_id.in_(profile_ids),
                ReconciliationBalance.variance_severity_classification.in_(["MATERIAL_VARIANCE", "CRITICAL_VARIANCE"]),
            ).count()

        pending_certs_total += progress["total"] - progress["certified"]

    kpis = CloseCalendarKPIs(
        open_periods=open_periods,
        near_deadline=near_deadline,
        overdue_tasks=overdue_tasks_total,
        material_variances=material_variances_total,
        pending_certifications=pending_certs_total,
    )

    return {"periods": summaries, "kpis": kpis}


# ─────────────────────────────────────────────────────────────────────────
# Create period
# ─────────────────────────────────────────────────────────────────────────

def create_close_period(db: Session, payload, current_user_id: int) -> dict:
    existing = db.query(ClosePeriod).filter(ClosePeriod.period_key == payload.period_key).first()
    if existing:
        raise ValueError(f"A close period with period_key '{payload.period_key}' already exists.")

    period = ClosePeriod(
        period_name=payload.period_name,
        period_key=payload.period_key,
        start_date=payload.start_date,
        due_date=payload.due_date,
        close_status="OPEN",
        created_by=current_user_id,
    )
    if hasattr(period, "overdue_certification_threshold"):
        period.overdue_certification_threshold = getattr(payload, "overdue_certification_threshold", 5) or 5
    db.add(period)
    db.flush()

    q = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True)  # noqa: E712
    if getattr(payload, "project_id", None):
        q = q.filter(ReconciliationProfile.project_id == payload.project_id)
    profiles = q.all()

    latest_balance_by_profile = {}
    if HAS_BALANCE:
        for prof in profiles:
            bal = (
                db.query(ReconciliationBalance)
                .filter(ReconciliationBalance.profile_id == prof.id,
                        ReconciliationBalance.period_key == payload.period_key)
                .order_by(ReconciliationBalance.created_at.desc())
                .first()
            )
            if bal:
                latest_balance_by_profile[prof.id] = bal.id
                bal.close_period_id = period.id
                db.add(bal)

    tasks_created = 0
    for prof in profiles:
        task = ClosePeriodTask(
            close_period_id=period.id,
            profile_id=prof.id,
            balance_id=latest_balance_by_profile.get(prof.id),
            assigned_owner_id=prof.assigned_preparer,
            target_due_date=payload.due_date,
            task_status="NOT_STARTED",
            completion_percentage=0.0,
        )
        db.add(task)
        tasks_created += 1

        _notify(
            db, prof.assigned_preparer, "workflow",
            f"Close Period Opened — {payload.period_name}",
            f"'{prof.name}' has been added to the {payload.period_name} close cycle. "
            f"Due {payload.due_date}.",
        )

    db.commit()
    recalc_period_progress(db, period)

    _write_audit_log(db, current_user_id, "CREATE_CLOSE_PERIOD", period.id, {
        "period_name": payload.period_name, "period_key": payload.period_key,
        "tasks_created": tasks_created,
    })

    return {
        "id": period.id, "period_name": period.period_name, "period_key": period.period_key,
        "tasks_created": tasks_created, "total_profiles": tasks_created,
    }


# ─────────────────────────────────────────────────────────────────────────
# Task list (drilldown)
# ─────────────────────────────────────────────────────────────────────────

def list_period_tasks(db: Session, period_id: int, owner_id: Optional[int] = None) -> dict:
    sync_period_tasks_with_workflows(db, period_id)
    q = (
        db.query(ClosePeriodTask, ReconciliationProfile)
        .join(ReconciliationProfile, ClosePeriodTask.profile_id == ReconciliationProfile.id)
        .filter(ClosePeriodTask.close_period_id == period_id)
    )
    if owner_id:
        q = q.filter(ClosePeriodTask.assigned_owner_id == owner_id)

    rows = q.all()
    today_str = _today_str()
    items = []
    for task, profile in rows:
        items.append(ClosePeriodTaskItem(
            id=task.id, close_period_id=task.close_period_id, profile_id=profile.id,
            profile_name=profile.name, risk_classification=profile.risk_classification,
            balance_id=task.balance_id, assigned_owner_id=task.assigned_owner_id,
            assigned_owner_name=None,  # enrich client-side from users list, kept light here
            target_due_date=task.target_due_date, task_status=task.task_status,
            completion_percentage=task.completion_percentage or 0.0,
            is_overdue=bool(task.target_due_date and task.target_due_date < today_str and task.task_status != "CERTIFIED"),
            created_at=task.created_at,
        ))
    return {"tasks": items, "total": len(items)}


def update_task_status(db: Session, task_id: int, task_status: Optional[str],
                        completion_percentage: Optional[float], current_user) -> ClosePeriodTask:
    task = db.query(ClosePeriodTask).filter(ClosePeriodTask.id == task_id).first()
    if not task:
        raise ValueError("Task not found")

    role = getattr(current_user, "role", "").lower()
    if role not in ("admin",) and task.assigned_owner_id != current_user.id:
        raise PermissionError("Only the assigned owner or an admin can update this task.")

    if task_status:
        task.task_status = task_status
        if task_status == "CERTIFIED":
            task.completion_percentage = 100.0
    if completion_percentage is not None:
        task.completion_percentage = max(0.0, min(100.0, completion_percentage))

    db.add(task)
    db.commit()

    period = db.query(ClosePeriod).filter(ClosePeriod.id == task.close_period_id).first()
    if period:
        recalc_period_progress(db, period)

    return task


# ─────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────

def get_period_dashboard(db: Session, period_id: int) -> dict:
    period = db.query(ClosePeriod).filter(ClosePeriod.id == period_id).first()
    if not period:
        raise ValueError("Close period not found")

    sync_period_tasks_with_workflows(db, period_id)
    progress = recalc_period_progress(db, period)
    profile_ids = _profile_ids_for_period(db, period_id)
    open_issues = _open_issues_count(db, profile_ids)

    period_summary = ClosePeriodSummary(
        id=period.id, period_name=period.period_name, period_key=period.period_key,
        start_date=period.start_date, due_date=period.due_date, close_status=period.close_status,
        total_profiles=progress["total"], completed_profiles=progress["completed"],
        certified_profiles=progress["certified"], completion_pct=progress["completion_pct"],
        certification_pct=progress["certification_pct"], open_issues=open_issues,
        is_demo_data=bool(period.is_demo_data),
        overdue_certification_threshold=getattr(period, "overdue_certification_threshold", 5) or 5,
        created_at=period.created_at,
    )

    open_variances = 0
    material_breaches = 0
    variance_density: list[VarianceDensityCell] = []
    if HAS_BALANCE and profile_ids:
        balances = (
            db.query(ReconciliationBalance, ReconciliationProfile)
            .join(ReconciliationProfile, ReconciliationBalance.profile_id == ReconciliationProfile.id)
            .filter(ReconciliationBalance.profile_id.in_(profile_ids))
            .order_by(ReconciliationBalance.created_at.desc())
            .all()
        )
        seen_profiles = set()
        for bal, prof in balances:
            if prof.id in seen_profiles:
                continue
            seen_profiles.add(prof.id)
            cls = bal.variance_severity_classification or "BALANCED"
            if cls != "BALANCED":
                open_variances += 1
            if cls in ("MATERIAL_VARIANCE", "CRITICAL_VARIANCE"):
                material_breaches += 1
            variance_density.append(VarianceDensityCell(
                profile_name=prof.name, risk=prof.risk_classification or "MEDIUM",
                variance_pct=round(bal.variance_percentage or 0.0, 2), classification=cls,
            ))

    cutoff = datetime.utcnow() - timedelta(days=AGING_CRITICAL_DAYS)
    aging_exceptions = 0
    if profile_ids:
        aging_exceptions = (
            db.query(ExceptionQueueRecord)
            .join(MatchGroup, ExceptionQueueRecord.match_group_id == MatchGroup.id)
            .filter(
                MatchGroup.profile_id.in_(profile_ids),
                ExceptionQueueRecord.status != "RESOLVED",
                ExceptionQueueRecord.created_at <= cutoff,
            ).count()
        )

    overdue_tasks = db.query(ClosePeriodTask).filter(
        ClosePeriodTask.close_period_id == period_id,
        ClosePeriodTask.task_status != "CERTIFIED",
        ClosePeriodTask.target_due_date < _today_str(),
    ).count()

    # ── Approval bottlenecks ────────────────────────────────────────────
    bottlenecks: list[ApprovalBottleneck] = []
    if profile_ids:
        stall_cutoff = datetime.utcnow() - timedelta(days=BOTTLENECK_STALL_DAYS)
        workflows = (
            db.query(CertificationWorkflow, ReconciliationProfile)
            .join(ReconciliationProfile, CertificationWorkflow.profile_id == ReconciliationProfile.id)
            .filter(
                CertificationWorkflow.profile_id.in_(profile_ids),
                CertificationWorkflow.status != "CERTIFIED",
                CertificationWorkflow.updated_at <= stall_cutoff,
            ).all()
        )
        for wf, prof in workflows:
            days_stuck = (datetime.utcnow() - wf.updated_at).days if wf.updated_at else 0
            bottlenecks.append(ApprovalBottleneck(
                profile_id=prof.id, profile_name=prof.name,
                stuck_stage=wf.current_stage or wf.status,
                stuck_role=STAGE_TO_ROLE.get((wf.current_stage or "").upper(), "preparer"),
                days_stuck=days_stuck,
            ))

    # ── Burndown (best-effort, derived from actual task completion) ──────
    burndown = _build_burndown(db, period, progress["total"])

    blockers = _collect_blockers(db, period, profile_ids)
    sla_section = _compute_sla_section(db, profile_ids)

    return {
        "period": period_summary,
        "completion_pct": progress["completion_pct"],
        "certification_pct": progress["certification_pct"],
        "open_variances": open_variances,
        "material_breaches": material_breaches,
        "aging_exceptions": aging_exceptions,
        "overdue_tasks": overdue_tasks,
        "approval_bottlenecks": bottlenecks,
        "burndown": burndown,
        "variance_density": variance_density,
        "blockers_preview": blockers[:5],
        "sla": sla_section,
    }


def _build_burndown(db: Session, period: "ClosePeriod", total: int) -> list[BurndownPoint]:
    """
    Best-effort burndown: no historical daily snapshot table exists for this
    module, so we plot start (all remaining) → today (actual remaining),
    using each CERTIFIED task's updated_at as a completion event.
    """
    certified_tasks = (
        db.query(ClosePeriodTask.updated_at)
        .filter(ClosePeriodTask.close_period_id == period.id, ClosePeriodTask.task_status == "CERTIFIED")
        .order_by(ClosePeriodTask.updated_at.asc())
        .all()
    )

    try:
        start = date.fromisoformat(period.start_date)
    except (ValueError, TypeError):
        start = date.today()

    points = [BurndownPoint(day_label=start.strftime("%b %d"), remaining_tasks=total, completed_tasks=0)]
    completed_so_far = 0
    for (ts,) in certified_tasks:
        if not ts:
            continue
        completed_so_far += 1
        points.append(BurndownPoint(
            day_label=ts.strftime("%b %d"),
            remaining_tasks=max(total - completed_so_far, 0),
            completed_tasks=completed_so_far,
        ))

    today_label = date.today().strftime("%b %d")
    if not points or points[-1].day_label != today_label:
        points.append(BurndownPoint(
            day_label=today_label,
            remaining_tasks=max(total - completed_so_far, 0),
            completed_tasks=completed_so_far,
        ))

    return points


# ─────────────────────────────────────────────────────────────────────────
# Close readiness validation
# ─────────────────────────────────────────────────────────────────────────

def _collect_blockers(db: Session, period: "ClosePeriod", profile_ids: list[int]) -> list[BlockerRecord]:
    blockers: list[BlockerRecord] = []
    if not profile_ids:
        return blockers

    profile_names_full = {
        p.id: p for p in db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(profile_ids)).all()
    }
    profile_names = {pid: prof.name for pid, prof in profile_names_full.items()}

    # 1 & 2 — DRAFT / UNDER_REVIEW balances
    if HAS_BALANCE:
        for status, category in (("DRAFT", "DRAFT_BALANCE"), ("UNDER_REVIEW", "UNDER_REVIEW_BALANCE")):
            rows = db.query(ReconciliationBalance).filter(
                ReconciliationBalance.profile_id.in_(profile_ids),
                ReconciliationBalance.status == status,
            ).all()
            for b in rows:
                blockers.append(BlockerRecord(
                    category=category, profile_id=b.profile_id,
                    profile_name=profile_names.get(b.profile_id, "Unknown"),
                    reference_id=b.id, reference_label=f"Balance #{b.id} ({b.period_key})",
                    detail=f"Balance is still {status} — cannot close period until reviewed and approved.",
                ))

        # 3 — Material OUT_OF_BALANCE
        rows = db.query(ReconciliationBalance).filter(
            ReconciliationBalance.profile_id.in_(profile_ids),
            ReconciliationBalance.variance_severity_classification.in_(["MATERIAL_VARIANCE", "CRITICAL_VARIANCE"]),
            ReconciliationBalance.status != "CERTIFIED",
        ).all()
        for b in rows:
            blockers.append(BlockerRecord(
                category="MATERIAL_VARIANCE", profile_id=b.profile_id,
                profile_name=profile_names.get(b.profile_id, "Unknown"),
                reference_id=b.id,
                reference_label=f"Balance #{b.id} — {b.variance_severity_classification}",
                detail=f"Variance of {b.variance_amount:,.2f} ({b.variance_percentage:.1f}%) is unresolved.",
            ))

    # 4 — Unresolved CRITICAL supporting items
    if HAS_SUPPORTING_ITEMS and HAS_BALANCE:
        rows = (
            db.query(SupportingItem, ReconciliationBalance)
            .join(ReconciliationBalance, SupportingItem.balance_id == ReconciliationBalance.id)
            .filter(
                ReconciliationBalance.profile_id.in_(profile_ids),
                SupportingItem.materiality_classification == "CRITICAL",
                SupportingItem.is_resolved == False,  # noqa: E712
            ).all()
        )
        for item, bal in rows:
            blockers.append(BlockerRecord(
                category="CRITICAL_SUPPORTING_ITEM", profile_id=bal.profile_id,
                profile_name=profile_names.get(bal.profile_id, "Unknown"),
                reference_id=item.id, reference_label=f"Supporting Item #{item.id}",
                detail=item.description or "Unresolved critical supporting item.",
            ))

    # 5 — Aging exceptions > 90 days
    cutoff = datetime.utcnow() - timedelta(days=AGING_CRITICAL_DAYS)
    rows = (
        db.query(ExceptionQueueRecord, MatchGroup)
        .join(MatchGroup, ExceptionQueueRecord.match_group_id == MatchGroup.id)
        .filter(
            MatchGroup.profile_id.in_(profile_ids),
            ExceptionQueueRecord.status != "RESOLVED",
            ExceptionQueueRecord.created_at <= cutoff,
        ).all()
    )
    for exc, mg in rows:
        age_days = (datetime.utcnow() - exc.created_at).days
        blockers.append(BlockerRecord(
            category="AGING_EXCEPTION_CRITICAL", profile_id=mg.profile_id,
            profile_name=profile_names.get(mg.profile_id, "Unknown"),
            reference_id=exc.id, reference_label=f"Exception #{exc.id}",
            detail=exc.comments or "Unresolved exception exceeds 90-day aging threshold.",
            age_days=age_days,
        ))

    # 6 — Incomplete approval / certification workflows
    rows = db.query(CertificationWorkflow).filter(
        CertificationWorkflow.profile_id.in_(profile_ids),
        CertificationWorkflow.status != "CERTIFIED",
    ).all()
    for wf in rows:
        blockers.append(BlockerRecord(
            category="INCOMPLETE_WORKFLOW", profile_id=wf.profile_id,
            profile_name=profile_names.get(wf.profile_id, "Unknown"),
            reference_id=wf.id, reference_label=f"Workflow #{wf.id} — {wf.current_stage}",
            detail=f"Certification workflow is still at stage '{wf.current_stage}' (status: {wf.status}).",
        ))

    # 7, 8, 9 — SLA Monitoring integration (Phase 2, Chunk 4, Part 5).
    # Reuses sla_violations directly; does not re-derive overdue state.
    if HAS_SLA:
        open_violations = db.query(SLAViolation).filter(
            SLAViolation.profile_id.in_(profile_ids),
            SLAViolation.status == "OPEN",
        ).all()

        # 7 — Any CRITICAL-priority SLA violation that's OPEN
        for v in open_violations:
            prof_priority = (profile_names_full.get(v.profile_id).risk_classification
                              if v.profile_id in profile_names_full else None)
            if prof_priority == "CRITICAL":
                blockers.append(BlockerRecord(
                    category="CRITICAL_SLA_VIOLATION", profile_id=v.profile_id,
                    profile_name=profile_names.get(v.profile_id, "Unknown"),
                    reference_id=v.id, reference_label=f"SLA Violation #{v.id} ({v.violation_type})",
                    detail=f"CRITICAL-priority SLA violation is still OPEN — {v.days_overdue} day(s) overdue.",
                    age_days=v.days_overdue,
                ))

        # 8 — Escalated accounts (level 3) still unresolved
        for v in open_violations:
            if v.escalation_level == 3:
                blockers.append(BlockerRecord(
                    category="ESCALATED_ACCOUNT_UNRESOLVED", profile_id=v.profile_id,
                    profile_name=profile_names.get(v.profile_id, "Unknown"),
                    reference_id=v.id, reference_label=f"SLA Violation #{v.id} — Level 3",
                    detail=f"Account was escalated to Level 3 and remains unresolved "
                           f"({v.days_overdue} day(s) overdue).",
                    age_days=v.days_overdue,
                ))

        # 9 — Overdue-certification count exceeds the period's configurable threshold
        overdue_cert_violations = [v for v in open_violations if v.violation_type == "CERTIFICATION_OVERDUE"]
        threshold = getattr(period, "overdue_certification_threshold", 5) or 5
        if len(overdue_cert_violations) > threshold:
            for v in overdue_cert_violations:
                blockers.append(BlockerRecord(
                    category="OVERDUE_CERTIFICATION_THRESHOLD_EXCEEDED", profile_id=v.profile_id,
                    profile_name=profile_names.get(v.profile_id, "Unknown"),
                    reference_id=v.id, reference_label=f"SLA Violation #{v.id} — Certification Overdue",
                    detail=f"{len(overdue_cert_violations)} overdue certifications exceed the "
                           f"configured threshold of {threshold} for this period.",
                    age_days=v.days_overdue,
                ))

    return blockers


def validate_close_readiness(db: Session, period_id: int) -> dict:
    period = db.query(ClosePeriod).filter(ClosePeriod.id == period_id).first()
    if not period:
        raise ValueError("Close period not found")

    profile_ids = _profile_ids_for_period(db, period_id)
    blockers = _collect_blockers(db, period, profile_ids)

    return {
        "ready": len(blockers) == 0,
        "period_id": period_id,
        "blockers": blockers,
        "blocker_count": len(blockers),
        "checked_at": datetime.utcnow(),
    }


def close_period(db: Session, period_id: int, current_user) -> dict:
    period = db.query(ClosePeriod).filter(ClosePeriod.id == period_id).first()
    if not period:
        raise ValueError("Close period not found")
    if period.close_status == "CLOSED":
        raise ValueError("Period is already closed.")

    validation = validate_close_readiness(db, period_id)
    if not validation["ready"]:
        raise PermissionError(
            f"Close Readiness Validation failed — {validation['blocker_count']} blocking issue(s) "
            f"must be resolved before this period can be closed."
        )

    period.close_status = "CLOSED"
    period.closed_by = current_user.id
    period.closed_at = datetime.utcnow()
    db.add(period)
    db.commit()

    _write_audit_log(db, current_user.id, "CLOSE_PERIOD", period.id, {
        "period_name": period.period_name, "period_key": period.period_key,
    })

    # Confirmation notification to the closing user (extend to broadcast to
    # all admins if you have a list_users_by_role() helper available)
    _notify(db, current_user.id, "workflow", f"Period Closed — {period.period_name}",
            f"{period.period_name} has been successfully closed with all readiness checks passed.",
            icon="success")

    return {
        "id": period.id, "close_status": period.close_status,
        "closed_at": period.closed_at, "closed_by": period.closed_by,
        "message": f"{period.period_name} closed successfully.",
    }
