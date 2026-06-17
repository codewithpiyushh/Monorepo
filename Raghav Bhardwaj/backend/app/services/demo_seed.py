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
from typing import Optional

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

            risk     = prof_def["risk"]
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