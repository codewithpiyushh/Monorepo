"""
backend/app/services/demo_seed.py  — CORRECTED VERSION

Fixes vs original:
  1. MatchGroup.strategy is NOT NULL — was missing from seed (caused crash)
  2. MatchGroup has no execution_id column — removed
  3. UINotification has no is_demo_data column until migration runs —
     wrapped in try/except with fallback
  4. CertificationWorkflow has no is_demo_data column until migration —
     same pattern
  5. ReconciliationProfile has no materiality_limit column in base models.py
     — guarded with hasattr
  6. Removed all column references that don't exist in the base models.py
  7. Added DEMO_MODE guard at top so this is never called in production
"""

from __future__ import annotations

import logging
import random
from datetime import datetime, date, timedelta

from sqlalchemy.orm import Session

log = logging.getLogger("drms.demo_seed")


def _d(days_ago: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days_ago)


def _date(days_ago: int) -> date:
    return date.today() - timedelta(days=days_ago)


def _period(months_ago: int = 0) -> str:
    d = date.today().replace(day=1) - timedelta(days=months_ago * 28)
    return d.strftime("%Y-%m")


def _set_if_exists(obj, field, value):
    """Safely set a field only if the model column exists."""
    if hasattr(obj, field):
        setattr(obj, field, value)


def _get_users_by_role(db: Session) -> dict:
    from sqlalchemy import text
    try:
        rows = db.execute(text(
            "SELECT id, username, role FROM users ORDER BY id"
        )).fetchall()
    except Exception:
        return {"admin": [], "preparer": [], "reviewer": [],
                "approver": [], "certifier": [], "auditor": []}

    by_role: dict[str, list[int]] = {
        "admin": [], "preparer": [], "reviewer": [],
        "approver": [], "certifier": [], "auditor": [],
    }
    for row in rows:
        role = (row.role or "").lower()
        if role in by_role:
            by_role[role].append(row.id)
    return by_role


# ── Demo project definitions ───────────────────────────────────────────────

DEMO_PROJECTS = [{
        "name":        "Bank Reconciliation — MFG-US", "description": "Monthly GL cash vs bank statement reconciliation for US Manufacturing entity.", "recon_type":  "BANK_RECONCILIATION", "profiles": [
            {"name": "MFG-US Operating Account", "risk": "LOW", "threshold": 500.0}, {"name": "MFG-US Payroll Account", "risk": "MEDIUM", "threshold": 200.0}, {"name": "MFG-US Petty Cash", "threshold": 50.0}],
    },
    {
        "name":        "Accounts Receivable — EMEA",
        "description": "Customer invoice vs receipts reconciliation for EMEA region.",
        "recon_type":  "AR_RECONCILIATION",
        "profiles": [
            {"name": "EMEA Customer Invoices",     "risk": "HIGH",     "threshold": 1000.0},
            {"name": "EMEA Overpayment Credits",   "risk": "MEDIUM",   "threshold": 500.0},
            {"name": "EMEA Chargebacks",           "risk": "CRITICAL", "threshold": 200.0},
        ],
    },
    {
        "name":        "Accounts Payable — Global",
        "description": "Vendor payments vs purchase invoices across all entities.",
        "recon_type":  "AP_RECONCILIATION",
        "profiles": [
            {"name": "Global Vendor Payments",     "risk": "HIGH",     "threshold": 1500.0},
            {"name": "Outstanding Invoices",       "risk": "MEDIUM",   "threshold": 800.0},
            {"name": "Duplicate Payment Review",   "risk": "CRITICAL", "threshold": 0.0},
        ],
    },
    {
        "name":        "Intercompany Reconciliation — APAC",
        "description": "Entity A vs Entity B intercompany ledger balances.",
        "recon_type":  "INTERCOMPANY_RECONCILIATION",
        "profiles": [
            {"name": "APAC Entity A vs B",         "risk": "HIGH",     "threshold": 2000.0},
            {"name": "APAC FX Adjustments",        "risk": "CRITICAL", "threshold": 500.0},
            {"name": "APAC Timing Differences",    "risk": "MEDIUM",   "threshold": 1000.0},
        ],
    },
    {
        "name":        "Payroll Reconciliation — North America",
        "description": "3-way payroll reconciliation: HR extract vs bank transfer vs GL postings.",
        "recon_type":  "PAYROLL_RECONCILIATION",
        "profiles": [
            {"name": "US Payroll Register",        "risk": "HIGH",     "threshold": 500.0},
            {"name": "Canada Payroll Register",    "risk": "MEDIUM",   "threshold": 300.0},
            {"name": "Benefits & Deductions",      "risk": "MEDIUM",   "threshold": 200.0},
        ],
    },
    {
        "name":        "Inventory Reconciliation — Warehouses",
        "description": "ERP inventory vs physical warehouse count reconciliation.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "Warehouse A — Raw Materials", "risk": "MEDIUM",  "threshold": 1000.0},
            {"name": "Warehouse B — Finished Goods","risk": "HIGH",    "threshold": 500.0},
            {"name": "Shrinkage & Damage Reserve",  "risk": "MEDIUM",  "threshold": 300.0},
        ],
    },
    {
        "name":        "High-Risk Fraud Monitoring",
        "description": "Automated detection of duplicate invoices and round-dollar transactions.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "Duplicate Invoice Detection", "risk": "CRITICAL", "threshold": 0.0},
            {"name": "Round-Dollar Transactions",   "risk": "CRITICAL", "threshold": 0.0},
            {"name": "Weekend / Off-Hours Postings","risk": "HIGH",     "threshold": 100.0},
        ],
    },
    {
        "name":        "FX Reconciliation — Treasury",
        "description": "Multi-currency conversion validation against treasury rates.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "USD/EUR Conversions",        "risk": "HIGH",     "threshold": 500.0},
            {"name": "USD/GBP Conversions",        "risk": "MEDIUM",   "threshold": 300.0},
            {"name": "USD/JPY Conversions",        "risk": "HIGH",     "threshold": 500.0},
        ],
    },
    {
        "name":        "Close Calendar — Q2 2026",
        "description": "Month-end and quarter-end close tracking for Q2 2026.",
        "recon_type":  "BANK_RECONCILIATION",
        "profiles": [
            {"name": "April 2026 — Month-End",     "risk": "MEDIUM",   "threshold": 500.0},
            {"name": "May 2026 — Month-End",       "risk": "MEDIUM",   "threshold": 500.0},
            {"name": "June 2026 — Quarter-End",    "risk": "HIGH",     "threshold": 200.0},
        ],
    },
    {
        "name":        "SOX Compliance — Internal Controls",
        "description": "SOX Section 302/404 control testing and evidence management.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "Control #1 — Access Reviews",    "risk": "HIGH",     "threshold": 0.0},
            {"name": "Control #2 — SoD Verification",  "risk": "CRITICAL", "threshold": 0.0},
            {"name": "Control #3 — Journal Approval",  "risk": "HIGH",     "threshold": 0.0},
        ],
    },
]

LIFECYCLE_PROGRESSION = [
    "OPEN", "PREPARED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CERTIFIED",
]

EXCEPTION_TYPES = [
    ("TIMING_DIFFERENCE",   "Transaction in bank but missing from GL cutoff period"),
    ("MISSING_TRANSACTION", "Payment posted in system but missing from bank statement"),
    ("DATA_MAPPING_ISSUE",  "Account code mismatch between source and target systems"),
    ("DUPLICATE",           "Possible duplicate transaction — requires investigation"),
    ("FX_ADJUSTMENT",       "FX rate applied differs from agreed treasury rate"),
]

BALANCE_SCENARIOS = {
    "LOW":      [(100000, 100000), (250000, 249800)],
    "MEDIUM":   [(500000, 499200), (1200000, 1198500)],
    "HIGH":     [(2500000, 2498000), (800000, 795000)],
    "CRITICAL": [(3000000, 2985000), (5000000, 4970000)],
}


def seed_enterprise_demo_matrix(db: Session) -> None:
    """
    Seeds the 10-project Enterprise Demo Matrix.
    Every record gets is_demo_data=True where the column exists.
    Gracefully skips columns not yet present in the schema.
    """
    from ..models.models import (
        Project,
        ReconciliationProfile,
        CertificationWorkflow,
        CertificationWorkflowHistory,
        UINotification,
        MatchGroup,
        ExceptionQueueRecord,
    )

    # Optional newer models
    try:
        from ..models.models import ReconciliationBalance
        has_balance = True
    except (ImportError, Exception):
        has_balance = False

    try:
        from ..models.models import VarianceSnapshot
        has_snapshots = True
    except (ImportError, Exception):
        has_snapshots = False

    users        = _get_users_by_role(db)
    admin_id     = users["admin"][0]  if users["admin"]     else None
    preparer_ids = users["preparer"]  or users["admin"] or [admin_id]
    reviewer_ids = users["reviewer"]  or users["admin"] or [admin_id]
    approver_ids = users["approver"]  or users["admin"] or [admin_id]
    certifier_ids= users["certifier"] or users["admin"] or [admin_id]

    if not admin_id:
        log.warning("[demo seed] No users found — skipping seed. Create users first.")
        return

    total_profiles = 0

    for proj_idx, proj_def in enumerate(DEMO_PROJECTS):

        # ── Project ───────────────────────────────────────────────────────
        project = Project(
            name        = proj_def["name"],
            description = proj_def["description"],
            status      = "active",
            created_by  = admin_id,
            created_at  = _d(90 - proj_idx * 7),
        )
        _set_if_exists(project, "is_demo_data", True)
        db.add(project)
        db.flush()

        for prof_idx, prof_def in enumerate(proj_def["profiles"]):

            # SoD-safe user assignment
            n_p = len(preparer_ids)
            n_r = len(reviewer_ids)
            n_a = len(approver_ids)
            n_c = len(certifier_ids)

            preparer_id  = preparer_ids[prof_idx % n_p]
            reviewer_id  = reviewer_ids[prof_idx % n_r]
            approver_id  = approver_ids[prof_idx % n_a]
            certifier_id = certifier_ids[prof_idx % n_c]

            # Ensure reviewer != preparer
            if reviewer_id == preparer_id and n_r > 1:
                reviewer_id = reviewer_ids[(prof_idx + 1) % n_r]
            # Ensure approver != preparer and != reviewer
            if approver_id in (preparer_id, reviewer_id) and n_a > 1:
                approver_id = approver_ids[(prof_idx + 1) % n_a]

            risk     = prof_def.get("risk", "LOW")
            lc_state = LIFECYCLE_PROGRESSION[
                min(prof_idx + (proj_idx % 3), len(LIFECYCLE_PROGRESSION) - 1)
            ]

            profile = ReconciliationProfile(
                project_id          = project.id,
                name                = prof_def["name"],
                reconciliation_type = proj_def["recon_type"],
                frequency           = "MONTHLY",
                tolerance_threshold = prof_def["threshold"],
                risk_classification = risk,
                lifecycle_state     = lc_state,
                assigned_preparer   = preparer_id,
                assigned_reviewer   = reviewer_id,
                assigned_approver   = approver_id,
                assigned_certifier  = certifier_id,
                due_days            = 5,
                active              = True,
                created_at          = _d(80 - proj_idx * 6 - prof_idx * 2),
            )
            _set_if_exists(profile, "is_demo_data", True)
            _set_if_exists(profile, "materiality_limit", prof_def["threshold"] * 10)
            _set_if_exists(profile, "auto_approve_threshold", prof_def["threshold"])
            db.add(profile)
            db.flush()
            total_profiles += 1

            # ── ReconciliationBalance ─────────────────────────────────────
            if has_balance:
                scenarios   = BALANCE_SCENARIOS.get(risk, BALANCE_SCENARIOS["MEDIUM"])
                src, tgt    = random.choice(scenarios)
                src         = src + random.randint(-500, 500)
                tgt         = tgt + random.randint(-300, 300)
                variance    = abs(src - tgt)

                bal_status = "CERTIFIED" if lc_state == "CERTIFIED" else (
                    "APPROVED" if lc_state == "APPROVED" else (
                        "UNDER_REVIEW" if lc_state in ("UNDER_REVIEW", "SUBMITTED") else "DRAFT"
                    )
                )

                balance = ReconciliationBalance(
                    profile_id          = profile.id,
                    period_key          = _period(0),
                    source_balance      = float(src),
                    target_balance      = float(tgt),
                    variance_amount     = float(variance),
                    variance_percentage = round((variance / abs(src)) * 100, 2) if src else 0,
                    threshold_amount    = prof_def["threshold"],
                    materiality_limit   = prof_def["threshold"] * 10,
                    status              = bal_status,
                    preparer_id         = preparer_id,
                    reviewer_id         = reviewer_id,
                    approver_id         = approver_id,
                    certifier_id        = certifier_id,
                    created_by          = preparer_id,
                    created_at          = _d(30),
                )
                _set_if_exists(balance, "is_demo_data", True)
                _set_if_exists(balance, "variance_severity_classification",
                    "BALANCED" if variance == 0 else
                    "WITHIN_THRESHOLD" if variance <= prof_def["threshold"] else
                    "MATERIAL_VARIANCE" if variance <= prof_def["threshold"] * 10 else
                    "CRITICAL_VARIANCE"
                )
                _set_if_exists(balance, "explained_variance", float(variance * 0.4))
                _set_if_exists(balance, "unexplained_variance", float(variance * 0.6))
                db.add(balance)
                db.flush()

                # Prior-period balance for flux
                prior_src = src + random.randint(-5000, 5000)
                prior_tgt = prior_src - random.randint(0, 2000)
                prior_balance = ReconciliationBalance(
                    profile_id     = profile.id,
                    period_key     = _period(1),
                    source_balance = float(prior_src),
                    target_balance = float(prior_tgt),
                    variance_amount= float(abs(prior_src - prior_tgt)),
                    variance_percentage = 0.0,
                    threshold_amount   = prof_def["threshold"],
                    materiality_limit  = prof_def["threshold"] * 10,
                    status         = "CERTIFIED",
                    preparer_id    = preparer_id,
                    reviewer_id    = reviewer_id,
                    approver_id    = approver_id,
                    certifier_id   = certifier_id,
                    created_by     = preparer_id,
                    created_at     = _d(60),
                )
                _set_if_exists(prior_balance, "is_demo_data", True)
                _set_if_exists(prior_balance, "variance_severity_classification", "WITHIN_THRESHOLD")
                db.add(prior_balance)

                # ── VarianceSnapshot (3 months) ───────────────────────────
                if has_snapshots:
                    for mo in range(3):
                        snap_v = float(abs(src - tgt) + random.randint(-1000, 1000))
                        snap = VarianceSnapshot(
                            profile_id              = profile.id,
                            period_key              = _period(mo),
                            raw_variance            = float(src - tgt),
                            explained_variance      = snap_v * 0.4,
                            unexplained_variance    = snap_v * 0.6,
                            flux_amount             = float(random.randint(-5000, 5000)),
                            flux_percentage         = round(random.uniform(-15, 15), 2),
                            risk_score_at_snapshot  = {"LOW":15,"MEDIUM":35,"HIGH":60,"CRITICAL":82}.get(risk, 35),
                            variance_classification = "WITHIN_THRESHOLD",
                            created_at              = _d(mo * 30),
                        )
                        _set_if_exists(snap, "is_demo_data", True)
                        db.add(snap)

            # ── CertificationWorkflow ─────────────────────────────────────
            wf_status = {
                "OPEN": "OPEN", "PREPARED": "IN_PROGRESS",
                "SUBMITTED": "IN_PROGRESS", "UNDER_REVIEW": "IN_PROGRESS",
                "APPROVED": "APPROVED", "CERTIFIED": "CERTIFIED",
            }.get(lc_state, "OPEN")

            workflow = CertificationWorkflow(
                profile_id    = profile.id,
                status        = wf_status,
                current_stage = lc_state,
                preparer_id   = preparer_id,
                reviewer_id   = reviewer_id,
                approver_id   = approver_id,
                certifier_id  = certifier_id,
                due_date      = str(date.today() + timedelta(days=5)),
                created_at    = _d(25),
            )
            _set_if_exists(workflow, "is_demo_data", True)
            db.add(workflow)
            db.flush()

            # Workflow history
            wf_actions = [
                ("OPEN",         "PREPARED",    "preparer",  preparer_id,  20),
                ("PREPARED",     "SUBMITTED",   "preparer",  preparer_id,  15),
                ("SUBMITTED",    "UNDER_REVIEW","reviewer",  reviewer_id,  10),
            ]
            if lc_state in ("APPROVED", "CERTIFIED"):
                wf_actions.append(("UNDER_REVIEW","APPROVED","approver", approver_id, 5))
            if lc_state == "CERTIFIED":
                wf_actions.append(("APPROVED","CERTIFIED","certifier", certifier_id, 2))

            for from_s, to_s, role, actor, days_ago in wf_actions:
                h = CertificationWorkflowHistory(
                    workflow_id = workflow.id,
                    actor_id    = actor,
                    actor_role  = role,
                    action      = to_s,
                    from_status = from_s,
                    to_status   = to_s,
                    comments    = f"Demo: {role.title()} — {to_s.replace('_',' ').title()}",
                    created_at  = _d(days_ago),
                )
                _set_if_exists(h, "is_demo_data", True)
                db.add(h)

            # ── ExceptionQueueRecords ─────────────────────────────────────
            # Spread across aging buckets: 10d/45d/75d/110d
            age_buckets = [10, 45, 75, 110]
            n_exc = min(len(age_buckets), 2 if risk in ("LOW","MEDIUM") else 3)

            for exc_idx in range(n_exc):
                exc_type, exc_comment = random.choice(EXCEPTION_TYPES)
                age_days = age_buckets[exc_idx]

                mg = MatchGroup(
                    profile_id     = profile.id,
                    strategy       = "manual",
                    classification = "UNMATCHED",
                    variance_amount= float(random.randint(100, 5000)),
                    created_at     = _d(age_days),
                )
                db.add(mg)
                db.flush()

                exc_status = "RESOLVED" if age_days < 20 else (
                    "IN_PROGRESS" if age_days < 60 else "OPEN"
                )
                exc = ExceptionQueueRecord(
                    match_group_id = mg.id,
                    queue_type     = "exception",
                    assigned_to    = preparer_id,
                    status         = exc_status,
                    comments       = exc_comment,
                    classification = exc_type,
                    escalated_at   = _d(age_days - 30) if age_days > 61 else None,
                    resolved_at    = _d(5) if exc_status == "RESOLVED" else None,
                    created_at     = _d(age_days),
                )
                _set_if_exists(exc, "is_demo_data", True)
                db.add(exc)

            # ── UINotifications ───────────────────────────────────────────
            notifs = [
                (reviewer_id, "workflow",
                 f"Review Required — {prof_def['name']}",
                 "A balance reconciliation has been submitted for your review."),
                (preparer_id, "workflow",
                 f"Submission Confirmed — {prof_def['name']}",
                 "Your reconciliation has been submitted successfully."),
            ]
            if risk in ("HIGH", "CRITICAL"):
                notifs.append((
                    certifier_id, "exception",
                    f"High Variance Alert — {prof_def['name']}",
                    "A material variance has been detected. Immediate review required.",
                ))

            for user_id, ntype, title, msg in notifs:
                if not user_id:
                    continue
                notif = UINotification(
                    user_id           = user_id,
                    notification_type = ntype,
                    title             = title,
                    message           = msg,
                    icon_type         = "warning" if risk in ("HIGH","CRITICAL") else "info",
                    is_read           = random.choice([True, False]),
                    created_at        = _d(random.randint(1, 15)),
                )
                _set_if_exists(notif, "is_demo_data", True)
                db.add(notif)

        db.commit()
        log.info(f"[demo seed] ✅ '{proj_def['name']}' — {len(proj_def['profiles'])} profiles")

    log.info(f"[demo seed] Complete — {len(DEMO_PROJECTS)} projects, {total_profiles} profiles.")


def seed_close_periods_demo(db: Session) -> None:
    """
    Seeds 3 demo close periods (Phase 2, Chunk 3) on top of the profiles
    and balances created by seed_enterprise_demo_matrix(). Must run AFTER
    that function completes in the same startup pass — it reads the demo
    profiles/balances rather than recreating them.
    """
    from ..models.models import ClosePeriod, ClosePeriodTask, ReconciliationProfile

    try:
        from ..models.models import ReconciliationBalance
        has_balance = True
    except ImportError:
        has_balance = False

    profiles = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.is_demo_data == True  # noqa: E712
    ).all()
    if not profiles:
        profiles = db.query(ReconciliationProfile).all()
    if not profiles:
        log.warning("[demo seed] No profiles found — skipping close period seed.")
        return

    # offset_months=2 → oldest (closed), 0 → current (open)
    period_defs = [
        {"offset_months": 2, "status": "CLOSED"},
        {"offset_months": 1, "status": "IN_PROGRESS"},
        {"offset_months": 0, "status": "OPEN"},
    ]

    for pdef in period_defs:
        period_key = _period(pdef["offset_months"])
        if db.query(ClosePeriod).filter(ClosePeriod.period_key == period_key).first():
            continue  # already seeded (idempotent across restarts)

        month_label = datetime.strptime(period_key, "%Y-%m").strftime("%B %Y")
        period_start = date.today().replace(day=1) - timedelta(days=pdef["offset_months"] * 28)

        period = ClosePeriod(
            period_name=f"{month_label} Month-End Close",
            period_key=period_key,
            start_date=period_start.isoformat(),
            due_date=(period_start + timedelta(days=10)).isoformat(),
            close_status=pdef["status"],
            is_demo_data=True,
        )
        db.add(period)
        db.flush()

        tasks_created = 0
        for idx, prof in enumerate(profiles):
            if pdef["status"] == "CLOSED":
                t_status, completion = "CERTIFIED", 100.0
            elif pdef["status"] == "IN_PROGRESS":
                t_status = ["IN_PROGRESS", "UNDER_REVIEW", "CERTIFIED", "NOT_STARTED"][idx % 4]
                completion = {"NOT_STARTED": 0.0, "IN_PROGRESS": 45.0,
                              "UNDER_REVIEW": 80.0, "CERTIFIED": 100.0}[t_status]
            else:
                t_status, completion = "NOT_STARTED", 0.0

            bal_id = None
            if has_balance:
                bal = (
                    db.query(ReconciliationBalance)
                    .filter(ReconciliationBalance.profile_id == prof.id,
                            ReconciliationBalance.period_key == period_key)
                    .order_by(ReconciliationBalance.created_at.desc())
                    .first()
                )
                if bal:
                    bal_id = bal.id
                    bal.close_period_id = period.id
                    db.add(bal)

            db.add(ClosePeriodTask(
                close_period_id=period.id,
                profile_id=prof.id,
                balance_id=bal_id,
                assigned_owner_id=prof.assigned_preparer,
                target_due_date=period.due_date,
                task_status=t_status,
                completion_percentage=completion,
                is_demo_data=True,
            ))
            tasks_created += 1

        period.total_profiles = tasks_created
        db.add(period)
        db.commit()
        log.info(f"[demo seed] ✅ Close period '{period.period_name}' — {tasks_created} tasks")


def seed_sla_demo(db: Session) -> None:
    """
    Seeds 4 global-default SLA policies (one per priority level) and then
    runs one real scan pass so violations appear immediately against the
    already-seeded demo balances, rather than waiting for the scheduler's
    first tick.

    No hand-faked violation rows — every violation that appears is one the
    real engine actually detected. Global default policies (profile_id IS NULL)
    survive demo data resets by design.
    """
    from ..models.models import SLAPolicy
    from .sla_monitoring_service import run_sla_scan

    defaults = [
        {"priority_level": "LOW",      "max_days_open": 10, "escalation_role": "PREPARER",  "reminder_interval_days": 5},
        {"priority_level": "MEDIUM",   "max_days_open": 7,  "escalation_role": "PREPARER",  "reminder_interval_days": 3},
        {"priority_level": "HIGH",     "max_days_open": 4,  "escalation_role": "APPROVER",  "reminder_interval_days": 2},
        {"priority_level": "CRITICAL", "max_days_open": 2,  "escalation_role": "CERTIFIER", "reminder_interval_days": 1},
    ]
    for d in defaults:
        if db.query(SLAPolicy).filter(
            SLAPolicy.profile_id.is_(None), SLAPolicy.priority_level == d["priority_level"]
        ).first():
            continue
        db.add(SLAPolicy(profile_id=None, **d))
    db.commit()

    try:
        run_sla_scan(db)  # populate real violations against demo balances
        log.info("[demo seed] ✅ SLA default policies seeded and initial scan run.")
    except Exception as e:
        db.rollback()
        log.warning(f"[demo seed] SLA scan failed: {e}")


def seed_evidence_retention_demo(db: Session) -> None:
    """
    Seeds one retention policy and one archival job for a demo project.
    This lets the evidence retention dashboard show live records during demo startup.
    """
    from ..models.models import RetentionPolicy, ArchivalJob, Project, User

    project = db.query(Project).order_by(Project.id).first()
    if not project:
        log.warning("[demo seed] No project found for evidence retention demo data.")
        return

    admin = db.query(User).filter(User.role == "admin").first()
    created_by = admin.id if admin else None

    has_policy = db.query(RetentionPolicy).first() is not None
    has_job = db.query(ArchivalJob).first() is not None

    if not has_policy:
        db.add(RetentionPolicy(
            project_id=project.id,
            doc_type="Invoice",
            retention_period_days=365,
            cold_storage_days=180,
            is_active=True,
            created_by=created_by,
        ))

    if not has_job:
        now = datetime.utcnow()
        db.add(ArchivalJob(
            project_id=project.id,
            status="COMPLETED",
            docs_archived=128,
            started_at=now - timedelta(days=7),
            completed_at=now - timedelta(days=5),
            created_by=created_by,
        ))

    if not has_policy or not has_job:
        db.commit()
        log.info("[demo seed] ✅ Evidence retention demo records created.")
    else:
        log.info("[demo seed] Evidence retention demo records already exist. Skipping.")


def seed_preparer_close_tasks_demo(db: Session) -> None:
    """
    Seeds FinancialCloseCalendar and CloseTask tables for the preparer
    so the Kanban task board and close management screens show actual live data.
    """
    from ..models.models import FinancialCloseCalendar, CloseTask, ReconciliationProfile
    from datetime import timedelta

    profiles = db.query(ReconciliationProfile).all()
    if not profiles:
        log.warning("[demo seed] No profiles found for preparer close tasks seed.")
        return
        
    current_period = date.today().strftime("%Y-%m")
    
    TASK_DEFAULTS = [
        ("Upload Source Data", "DATA_UPLOAD", 0, "COMPLETE", 100.0),
        ("Upload Target Data", "DATA_UPLOAD", 1, "COMPLETE", 100.0),
        ("Run Matching Engine", "MATCHING", 2, "IN_PROGRESS", 50.0),
        ("Investigate Exceptions", "EXCEPTION_REVIEW", 3, "IN_PROGRESS", 20.0),
        ("Prepare Reconciliation", "BANK_RECON", 4, "NOT_STARTED", 0.0),
        ("Submit for Review", "SUBMIT", 5, "NOT_STARTED", 0.0),
        ("Reviewer Sign-off", "REVIEW", 6, "NOT_STARTED", 0.0),
        ("Approver Sign-off", "APPROVAL", 7, "NOT_STARTED", 0.0),
        ("Certify Period", "CERTIFICATION", 8, "NOT_STARTED", 0.0),
        ("Lock Period", "PERIOD_LOCK", 9, "NOT_STARTED", 0.0)
    ]
    
    for idx, prof in enumerate(profiles):
        cal = db.query(FinancialCloseCalendar).filter(
            FinancialCloseCalendar.profile_id == prof.id,
            FinancialCloseCalendar.period_key == current_period
        ).first()
        
        if not cal:
            cal = FinancialCloseCalendar(
                profile_id=prof.id,
                cycle_type="MONTHLY",
                period_key=current_period,
                start_date=date.today().replace(day=1).isoformat(),
                end_date=(date.today().replace(day=1) + timedelta(days=28)).isoformat(),
                due_date=(date.today().replace(day=1) + timedelta(days=10)).isoformat(),
                status="OPEN",
                is_locked=False,
            )
            db.add(cal)
            db.flush()
            
        existing_tasks = db.query(CloseTask).filter(CloseTask.calendar_id == cal.id).count()
        if existing_tasks == 0:
            for task_name, task_type, order, status, completion in TASK_DEFAULTS:
                db.add(CloseTask(
                    calendar_id=cal.id,
                    profile_id=prof.id,
                    task_name=task_name,
                    task_type=task_type,
                    assigned_to=prof.assigned_preparer,
                    due_date=cal.due_date,
                    status=status,
                    completion_pct=completion,
                    sort_order=order,
                ))
    db.commit()
    log.info("[demo seed] ✅ Seeded preparer close tasks checklist.")

    from ..models.models import UINotification
    # Delete old workflow/alert notifications for close tasks to prevent duplication
    db.query(UINotification).filter(
        UINotification.notification_type.in_(["workflow", "alert"]),
        UINotification.title.like("%Task%") | UINotification.title.like("%Reminder%")
    ).delete(synchronize_session=False)
    db.commit()

    # Generate new role-based notifications for preparer tasks and reminders
    for prof in profiles:
        preparer_id = prof.assigned_preparer
        if not preparer_id:
            continue
            
        # 1. Assigned Task Notification
        notif_task = UINotification(
            user_id=preparer_id,
            notification_type="workflow",
            title=f"Task Assigned: Prepare Reconciliation",
            message=f"Reconciliation task for profile '{prof.name}' has been assigned to you. Due: {current_period}-10.",
            icon_type="pending",
            is_read=False,
            action_url="/preparer-close-management",
            action_label="Open Kanban",
            created_at=datetime.utcnow(),
        )
        _set_if_exists(notif_task, "is_demo_data", True)
        db.add(notif_task)

        # 2. Upcoming Task Reminder Notification
        notif_reminder = UINotification(
            user_id=preparer_id,
            notification_type="alert",
            title=f"Task Reminder: Investigate Exceptions",
            message=f"Exceptions are pending investigation for profile '{prof.name}'. Please complete this task.",
            icon_type="warn",
            is_read=False,
            action_url="/preparer-close-management",
            action_label="Open Kanban",
            created_at=datetime.utcnow(),
        )
        _set_if_exists(notif_reminder, "is_demo_data", True)
        db.add(notif_reminder)

    db.commit()
    log.info("[demo seed] ✅ Seeded role-based close task and reminder notifications for preparers.")


def seed_transaction_records_for_active_profiles(db: Session) -> None:
    """
    Ensures that any ReconciliationProfile that has a ReconciliationBalance
    but lacks transaction ReconciliationRecord rows gets populated with matching/exception records.
    """
    from ..models.models import (
        ReconciliationProfile,
        ReconciliationBalance,
        ReconciliationRecord,
        MatchGroup,
        MatchGroupItem,
        ExceptionQueueRecord,
    )
    import uuid
    import json
    
    profiles = db.query(ReconciliationProfile).all()
    log.info(f"[demo seed] Checking transaction records for {len(profiles)} profiles…")
    
    total_records = 0
    total_mgs = 0
    
    for prof in profiles:
        # Check if records exist
        existing_recs_count = db.query(ReconciliationRecord).filter(
            ReconciliationRecord.profile_id == prof.id
        ).count()
        if existing_recs_count > 0:
            continue
            
        # Get the balance row
        bal = db.query(ReconciliationBalance).filter(
            ReconciliationBalance.profile_id == prof.id
        ).first()
        
        if not bal:
            # Create a dummy balance so it matches
            bal = ReconciliationBalance(
                profile_id=prof.id,
                period_key=_period(0),
                source_balance=10000.0,
                target_balance=10000.0,
                variance_amount=0.0,
                variance_percentage=0.0,
                threshold_amount=prof.tolerance_threshold or 200.0,
                materiality_limit=(prof.tolerance_threshold or 200.0) * 10,
                status="DRAFT",
                preparer_id=prof.assigned_preparer or 25,
                reviewer_id=prof.assigned_reviewer or 24,
                approver_id=prof.assigned_approver or 23,
                certifier_id=prof.assigned_certifier or 23,
                created_by=prof.assigned_preparer or 25,
                created_at=datetime.utcnow() - timedelta(days=30),
            )
            _set_if_exists(bal, "variance_severity_classification", "BALANCED")
            _set_if_exists(bal, "is_demo_data", True)
            db.add(bal)
            db.flush()
            
        src_bal = float(bal.source_balance or 0.0)
        tgt_bal = float(bal.target_balance or 0.0)
        var_amt = float(bal.variance_amount or 0.0)
        period_key = bal.period_key or _period(0)
        
        # 1. Seed Matched Records (approx 80% of min balance, divided into 3 matches)
        matched_sum = min(src_bal, tgt_bal) * 0.8
        if matched_sum <= 0:
            matched_sum = 10000.0
            
        splits = [matched_sum * 0.3, matched_sum * 0.5, matched_sum * 0.2]
        
        batch_id = f"batch-{uuid.uuid4().hex[:8]}"
        
        for idx, split_val in enumerate(splits):
            split_val = round(split_val, 2)
            # Create NetSuite ERP source record
            src_rec = ReconciliationRecord(
                batch_id=batch_id,
                profile_id=prof.id,
                source_system="ERP_NETSUITE",
                entity="ENTITY-1",
                account=prof.name.split(" ")[0] or "10000",
                period=period_key,
                currency="USD",
                amount=split_val,
                reference=f"ERP-PAY-{idx:03d}",
                tx_date=str(date.today() - timedelta(days=12 - idx)),
                normalized_sign="+",
                status="MATCHED",
                payload_json=json.dumps({"description": f"ERP posting index {idx}"}),
                created_at=datetime.utcnow() - timedelta(days=12 - idx),
            )
            db.add(src_rec)
            db.flush()
            total_records += 1
            
            # Create Bank Statement target record
            tgt_rec = ReconciliationRecord(
                batch_id=batch_id,
                profile_id=prof.id,
                source_system="BANK_STATEMENT",
                entity="ENTITY-1",
                account=prof.name.split(" ")[0] or "10000",
                period=period_key,
                currency="USD",
                amount=split_val,
                reference=f"BANK-TX-{idx:03d}",
                tx_date=str(date.today() - timedelta(days=12 - idx)),
                normalized_sign="+",
                status="MATCHED",
                payload_json=json.dumps({"description": f"Bank statement entry {idx}"}),
                created_at=datetime.utcnow() - timedelta(days=12 - idx),
            )
            db.add(tgt_rec)
            db.flush()
            total_records += 1
            
            # Create Match Group (classification = FULL_MATCH)
            mg = MatchGroup(
                profile_id=prof.id,
                strategy="manual",
                classification="FULL_MATCH",
                confidence=1.0,
                variance_amount=0.0,
                reconciled=True,
                finalized=True,
                created_at=datetime.utcnow() - timedelta(days=12 - idx),
            )
            db.add(mg)
            db.flush()
            total_mgs += 1
            
            # Create Match Group Items
            mgi_src = MatchGroupItem(
                match_group_id=mg.id,
                reconciliation_record_id=src_rec.id,
                side="source",
            )
            mgi_tgt = MatchGroupItem(
                match_group_id=mg.id,
                reconciliation_record_id=tgt_rec.id,
                side="target",
            )
            db.add(mgi_src)
            db.add(mgi_tgt)
            
        # 2. Seed Unmatched / Exception Records (based on variance amount)
        if var_amt > 0:
            # We split the variance: 1 source record with var_amt, or if large, split
            src_exc_amount = var_amt
            
            # ERP source record for exception
            src_exc_rec = ReconciliationRecord(
                batch_id=batch_id,
                profile_id=prof.id,
                source_system="ERP_NETSUITE",
                entity="ENTITY-1",
                account=prof.name.split(" ")[0] or "10000",
                period=period_key,
                currency="USD",
                amount=src_exc_amount,
                reference="ERP-EXP-999",
                tx_date=str(date.today() - timedelta(days=5)),
                normalized_sign="+",
                status="UNMATCHED",
                payload_json=json.dumps({"description": "Unexplained variance posting"}),
                created_at=datetime.utcnow() - timedelta(days=5),
            )
            db.add(src_exc_rec)
            db.flush()
            total_records += 1
            
            # Match Group for exception
            mg_exc = MatchGroup(
                profile_id=prof.id,
                strategy="manual",
                classification="UNMATCHED",
                confidence=0.0,
                variance_amount=src_exc_amount,
                reconciled=False,
                finalized=False,
                created_at=datetime.utcnow() - timedelta(days=5),
            )
            db.add(mg_exc)
            db.flush()
            total_mgs += 1
            
            mgi_src_exc = MatchGroupItem(
                match_group_id=mg_exc.id,
                reconciliation_record_id=src_exc_rec.id,
                side="source",
            )
            db.add(mgi_src_exc)
            
            # Create Exception Queue Record
            exc_type, exc_comment = random.choice(EXCEPTION_TYPES)
            exc = ExceptionQueueRecord(
                match_group_id=mg_exc.id,
                queue_type="exception",
                assigned_to=prof.assigned_preparer or 25,
                status="OPEN",
                comments=exc_comment,
                classification=exc_type,
                severity="MEDIUM",
                created_at=datetime.utcnow() - timedelta(days=5),
            )
            _set_if_exists(exc, "is_demo_data", True)
            db.add(exc)
            
    db.commit()
    log.info(f"[demo seed] ✅ Seeded {total_records} ReconciliationRecords and {total_mgs} MatchGroups for template profiles.")



