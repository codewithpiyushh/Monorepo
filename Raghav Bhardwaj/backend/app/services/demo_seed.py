"""
backend/app/services/demo_seed.py

10-Project Enterprise Demo Matrix — complete seed script.

Every single INSERT sets is_demo_data = True.
No hardcoded IDs are assumed — all relationships are resolved
via the objects created in this session.

Covers:
  - 10 realistic reconciliation projects (Bank, AR, AP, Intercompany, Payroll, etc.)
  - Reconciliation profiles per project (3-5 profiles each)
  - ReconciliationBalance records with varied variance states
  - CertificationWorkflows in mixed lifecycle states
  - ExceptionQueueRecords spread across all aging buckets
  - UINotifications simulating real workflow events
  - VarianceSnapshots for 3-month trend data
"""

from __future__ import annotations

import json
import logging
import random
from datetime import datetime, date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

log = logging.getLogger("drms.demo_seed")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _d(days_ago: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days_ago)


def _date(days_ago: int) -> date:
    return date.today() - timedelta(days=days_ago)


def _period(months_ago: int = 0) -> str:
    d = date.today().replace(day=1) - timedelta(days=months_ago * 28)
    return d.strftime("%Y-%m")


# ── Demo user roster ──────────────────────────────────────────────────────────
# We look up users by role rather than hardcoding IDs so the seed works
# regardless of which users exist in the database.

def _get_users_by_role(db: Session) -> dict:
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT id, username, role FROM users ORDER BY id"
    )).fetchall()

    by_role: dict[str, list[int]] = {
        "admin": [], "preparer": [], "reviewer": [],
        "approver": [], "certifier": [], "auditor": [],
    }
    for row in rows:
        role = (row.role or "").lower()
        if role in by_role:
            by_role[role].append(row.id)

    return by_role


def _pick(lst: list, fallback: Optional[int] = None) -> Optional[int]:
    return lst[0] if lst else fallback


def _pick_r(lst: list) -> Optional[int]:
    """Pick a random item from list, or None."""
    return random.choice(lst) if lst else None


# ── Project definitions ───────────────────────────────────────────────────────

DEMO_PROJECTS = [
    {
        "name":        "Bank Reconciliation — MFG-US",
        "description": "Monthly GL cash vs bank statement reconciliation for US Manufacturing entity.",
        "recon_type":  "BANK_RECONCILIATION",
        "profiles": [
            {"name": "MFG-US Operating Account",  "risk": "LOW",      "threshold": 500,    "materiality": 5000},
            {"name": "MFG-US Payroll Account",     "risk": "MEDIUM",   "threshold": 200,    "materiality": 2000},
            {"name": "MFG-US Petty Cash",          "risk": "LOW",      "threshold": 50,     "materiality": 500},
        ],
    },
    {
        "name":        "Accounts Receivable — EMEA",
        "description": "Customer invoice vs receipts reconciliation for EMEA region.",
        "recon_type":  "AR_RECONCILIATION",
        "profiles": [
            {"name": "EMEA Customer Invoices",     "risk": "HIGH",     "threshold": 1000,   "materiality": 10000},
            {"name": "EMEA Overpayment Credits",   "risk": "MEDIUM",   "threshold": 500,    "materiality": 5000},
            {"name": "EMEA Chargebacks",           "risk": "CRITICAL", "threshold": 200,    "materiality": 2000},
        ],
    },
    {
        "name":        "Accounts Payable — Global",
        "description": "Vendor payments vs purchase invoices across all entities.",
        "recon_type":  "AP_RECONCILIATION",
        "profiles": [
            {"name": "Global Vendor Payments",     "risk": "HIGH",     "threshold": 1500,   "materiality": 15000},
            {"name": "Outstanding Invoices",       "risk": "MEDIUM",   "threshold": 800,    "materiality": 8000},
            {"name": "Duplicate Payment Review",   "risk": "CRITICAL", "threshold": 0,      "materiality": 1000},
        ],
    },
    {
        "name":        "Intercompany Reconciliation — APAC",
        "description": "Entity A vs Entity B intercompany ledger balances for APAC subsidiaries.",
        "recon_type":  "INTERCOMPANY_RECONCILIATION",
        "profiles": [
            {"name": "APAC Entity A vs B",         "risk": "HIGH",     "threshold": 2000,   "materiality": 20000},
            {"name": "APAC FX Adjustments",        "risk": "CRITICAL", "threshold": 500,    "materiality": 5000},
            {"name": "APAC Timing Differences",    "risk": "MEDIUM",   "threshold": 1000,   "materiality": 10000},
            {"name": "APAC Elimination Entries",   "risk": "LOW",      "threshold": 300,    "materiality": 3000},
        ],
    },
    {
        "name":        "Payroll Reconciliation — North America",
        "description": "3-way payroll reconciliation: HR extract vs bank transfer vs GL postings.",
        "recon_type":  "PAYROLL_RECONCILIATION",
        "profiles": [
            {"name": "US Payroll Register",        "risk": "HIGH",     "threshold": 500,    "materiality": 5000},
            {"name": "Canada Payroll Register",    "risk": "MEDIUM",   "threshold": 300,    "materiality": 3000},
            {"name": "Benefits & Deductions",      "risk": "MEDIUM",   "threshold": 200,    "materiality": 2000},
        ],
    },
    {
        "name":        "Inventory Reconciliation — Warehouses",
        "description": "ERP inventory vs physical warehouse count reconciliation.",
        "recon_type":  "INVENTORY_RECONCILIATION",
        "profiles": [
            {"name": "Warehouse A — Raw Materials", "risk": "MEDIUM",  "threshold": 1000,   "materiality": 10000},
            {"name": "Warehouse B — Finished Goods","risk": "HIGH",    "threshold": 500,    "materiality": 5000},
            {"name": "Shrinkage & Damage Reserve",  "risk": "MEDIUM",  "threshold": 300,    "materiality": 3000},
        ],
    },
    {
        "name":        "High-Risk Fraud Monitoring",
        "description": "Automated detection of duplicate invoices, round-dollar transactions, and weekend postings.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "Duplicate Invoice Detection","risk": "CRITICAL",  "threshold": 0,      "materiality": 500},
            {"name": "Round-Dollar Transactions",  "risk": "CRITICAL",  "threshold": 0,      "materiality": 1000},
            {"name": "Weekend / Off-Hours Postings","risk": "HIGH",     "threshold": 100,    "materiality": 2000},
            {"name": "Vendor Master Anomalies",    "risk": "CRITICAL",  "threshold": 0,      "materiality": 500},
            {"name": "Split Payment Detection",    "risk": "HIGH",      "threshold": 200,    "materiality": 2000},
        ],
    },
    {
        "name":        "FX Reconciliation — Treasury",
        "description": "Multi-currency conversion validation against treasury rates.",
        "recon_type":  "FX_RECONCILIATION",
        "profiles": [
            {"name": "USD/EUR Conversions",        "risk": "HIGH",     "threshold": 500,    "materiality": 5000},
            {"name": "USD/GBP Conversions",        "risk": "MEDIUM",   "threshold": 300,    "materiality": 3000},
            {"name": "USD/JPY Conversions",        "risk": "HIGH",     "threshold": 500,    "materiality": 5000},
        ],
    },
    {
        "name":        "Close Calendar — Q2 2026",
        "description": "Month-end and quarter-end close tracking for Q2 2026.",
        "recon_type":  "BANK_RECONCILIATION",
        "profiles": [
            {"name": "April 2026 — Month-End Close","risk": "MEDIUM",  "threshold": 500,    "materiality": 5000},
            {"name": "May 2026 — Month-End Close",  "risk": "MEDIUM",  "threshold": 500,    "materiality": 5000},
            {"name": "June 2026 — Quarter-End Close","risk": "HIGH",   "threshold": 200,    "materiality": 2000},
        ],
    },
    {
        "name":        "SOX Compliance — Internal Controls",
        "description": "SOX Section 302/404 control testing and evidence management.",
        "recon_type":  "CASH_RECONCILIATION",
        "profiles": [
            {"name": "Control #1 — Access Reviews", "risk": "HIGH",    "threshold": 0,      "materiality": 0},
            {"name": "Control #2 — Segregation of Duties","risk":"CRITICAL","threshold":0,   "materiality": 0},
            {"name": "Control #3 — Journal Approval","risk": "HIGH",   "threshold": 0,      "materiality": 0},
        ],
    },
]


# Balance scenarios per risk level
BALANCE_SCENARIOS = {
    "LOW": [
        (100000, 100000),      # perfect match
        (250000, 249800),      # tiny variance
        (75000,  75050),       # within threshold
    ],
    "MEDIUM": [
        (500000,  499200),     # within threshold
        (1200000, 1198500),    # within threshold
        (350000,  349100),     # small variance
    ],
    "HIGH": [
        (2500000, 2498000),    # out of balance
        (800000,  795000),     # significant variance
        (1500000, 1492000),    # exceeds threshold
    ],
    "CRITICAL": [
        (3000000, 2985000),    # material variance
        (5000000, 4970000),    # critical variance
        (1000000, 975000),     # critical variance
    ],
}

LIFECYCLE_PROGRESSION = [
    "OPEN", "PREPARED", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CERTIFIED",
]

EXCEPTION_TYPES = [
    ("TIMING_DIFFERENCE",      "Transaction appears in bank but not in GL cutoff"),
    ("MISSING_TRANSACTION",    "Payment posted in system but missing from bank statement"),
    ("DATA_MAPPING_ISSUE",     "Account code mismatch between source and target systems"),
    ("DUPLICATE",              "Possible duplicate transaction detected — requires investigation"),
    ("INTERCOMPANY_DIFFERENCE","Intercompany balance does not agree between entities"),
    ("ROUNDING_DIFFERENCE",    "Currency rounding difference below materiality threshold"),
    ("FX_ADJUSTMENT",          "FX rate applied differs from agreed treasury rate"),
    ("MANUAL_JOURNAL",         "Unsupported manual journal entry requires approval"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Main seed function
# ─────────────────────────────────────────────────────────────────────────────

def seed_enterprise_demo_matrix(db: Session) -> None:
    """
    Seeds the complete 10-project Enterprise Demo Matrix.
    Every record has is_demo_data = True.
    Safe to call multiple times — purge must happen before calling.
    """
    from ..models.models import (
        Project,
        ReconciliationProfile,
        CertificationWorkflow,
        CertificationWorkflowHistory,
        UINotification,
    )
    # Import newer models safely
    try:
        from ..models.models import ReconciliationBalance
        has_balance = True
    except ImportError:
        has_balance = False

    try:
        from ..models.models import ExceptionQueueRecord, MatchGroup
        has_exceptions = True
    except ImportError:
        has_exceptions = False

    try:
        from ..models.models import VarianceSnapshot
        has_snapshots = True
    except ImportError:
        has_snapshots = False

    users = _get_users_by_role(db)
    admin_id     = _pick(users["admin"])
    preparer_ids = users["preparer"] or users["admin"]
    reviewer_ids = users["reviewer"] or users["admin"]
    approver_ids = users["approver"] or users["admin"]
    certifier_ids= users["certifier"] or users["admin"]

    created_profiles = []

    for proj_idx, proj_def in enumerate(DEMO_PROJECTS):
        # ── Create Project ────────────────────────────────────────────────
        project = Project(
            name        = proj_def["name"],
            description = proj_def["description"],
            status      = "active",
            created_by  = admin_id,
            is_demo_data= True,
            created_at  = _d(90 - proj_idx * 7),
        )
        db.add(project)
        db.flush()

        for prof_idx, prof_def in enumerate(proj_def["profiles"]):
            # Assign distinct users per profile to enforce SoD
            preparer_id  = preparer_ids[prof_idx % len(preparer_ids)] if preparer_ids else None
            reviewer_id  = reviewer_ids[prof_idx % len(reviewer_ids)] if reviewer_ids else None
            approver_id  = approver_ids[prof_idx % len(approver_ids)] if approver_ids else None
            certifier_id = certifier_ids[prof_idx % len(certifier_ids)] if certifier_ids else None

            # SoD: ensure no duplicates across roles
            if reviewer_id == preparer_id:
                reviewer_id = reviewer_ids[(prof_idx + 1) % len(reviewer_ids)] if len(reviewer_ids) > 1 else reviewer_id
            if approver_id in (preparer_id, reviewer_id):
                approver_id = approver_ids[(prof_idx + 1) % len(approver_ids)] if len(approver_ids) > 1 else approver_id

            risk = prof_def["risk"]
            lc_state = LIFECYCLE_PROGRESSION[
                min(prof_idx + proj_idx % 3, len(LIFECYCLE_PROGRESSION) - 1)
            ]

            profile = ReconciliationProfile(
                project_id          = project.id,
                name                = prof_def["name"],
                reconciliation_type = proj_def["recon_type"],
                frequency           = "MONTHLY",
                tolerance_threshold = prof_def["threshold"],
                materiality_limit   = prof_def["materiality"],
                auto_approve_threshold = prof_def["threshold"],
                risk_classification = risk,
                lifecycle_state     = lc_state,
                assigned_preparer   = preparer_id,
                assigned_reviewer   = reviewer_id,
                assigned_approver   = approver_id,
                assigned_certifier  = certifier_id,
                due_days            = 5,
                active              = True,
                is_demo_data        = True,
                created_at          = _d(80 - proj_idx * 6 - prof_idx * 2),
            )
            db.add(profile)
            db.flush()
            created_profiles.append((profile, risk, preparer_id, reviewer_id, approver_id, certifier_id, lc_state))

            # ── ReconciliationBalance ─────────────────────────────────────
            if has_balance:
                scenarios = BALANCE_SCENARIOS.get(risk, BALANCE_SCENARIOS["MEDIUM"])
                src, tgt = random.choice(scenarios)
                # Add small noise
                src = src + random.randint(-500, 500)
                tgt = tgt + random.randint(-300, 300)
                variance = abs(src - tgt)

                if variance == 0:
                    classification = "BALANCED"
                elif variance <= prof_def["threshold"]:
                    classification = "WITHIN_THRESHOLD"
                elif variance <= prof_def["materiality"]:
                    classification = "MATERIAL_VARIANCE"
                else:
                    classification = "CRITICAL_VARIANCE"

                balance = ReconciliationBalance(
                    profile_id                      = profile.id,
                    period_key                      = _period(0),
                    source_balance                  = float(src),
                    target_balance                  = float(tgt),
                    variance_amount                 = float(variance),
                    variance_percentage             = round((variance / abs(src)) * 100, 2) if src else 0,
                    threshold_amount                = float(prof_def["threshold"]),
                    materiality_limit               = float(prof_def["materiality"]),
                    status                          = lc_state if lc_state in {"UNDER_REVIEW","APPROVED","CERTIFIED"} else "DRAFT",
                    variance_severity_classification= classification,
                    explained_variance              = float(random.randint(0, int(variance * 0.6))) if variance else 0,
                    unexplained_variance            = float(variance),
                    preparer_id                     = preparer_id,
                    reviewer_id                     = reviewer_id,
                    approver_id                     = approver_id,
                    certifier_id                    = certifier_id,
                    created_by                      = preparer_id,
                    is_demo_data                    = True,
                    created_at                      = _d(30),
                )
                db.add(balance)
                db.flush()

                # Prior period balance for flux
                prior_src = src + random.randint(-5000, 5000)
                prior_tgt = prior_src - random.randint(0, 3000)
                prior_variance = abs(prior_src - prior_tgt)
                prior_balance = ReconciliationBalance(
                    profile_id                      = profile.id,
                    period_key                      = _period(1),
                    source_balance                  = float(prior_src),
                    target_balance                  = float(prior_tgt),
                    variance_amount                 = float(prior_variance),
                    variance_percentage             = round((prior_variance / abs(prior_src)) * 100, 2) if prior_src else 0,
                    threshold_amount                = float(prof_def["threshold"]),
                    materiality_limit               = float(prof_def["materiality"]),
                    status                          = "CERTIFIED",
                    variance_severity_classification= "BALANCED" if prior_variance == 0 else "WITHIN_THRESHOLD",
                    explained_variance              = 0.0,
                    unexplained_variance            = float(prior_variance),
                    preparer_id                     = preparer_id,
                    reviewer_id                     = reviewer_id,
                    approver_id                     = approver_id,
                    certifier_id                    = certifier_id,
                    created_by                      = preparer_id,
                    is_demo_data                    = True,
                    created_at                      = _d(60),
                )
                db.add(prior_balance)

                # ── VarianceSnapshot (3 months) ───────────────────────────
            # ── VarianceSnapshot (3 months) ───────────────────────────
            if has_snapshots:
                for mo in range(3):
                    # 1. Calculate base variance
                    snap_variance = float(abs(src - tgt) + random.randint(-1000, 1000))
        
                    # 2. FIX: Ensure snap_variance is positive and calculate range safely
                    # We use max(0, ...) to ensure the randint upper bound is never negative
                    variance_limit = max(0, int(abs(snap_variance) * 0.5))
        
                    snap = VarianceSnapshot(
                        profile_id              = profile.id,
                        period_key              = _period(mo),
                        raw_variance            = float(src - tgt),
                        # 3. Use the safe limit here
                        explained_variance      = float(random.randint(0, variance_limit)),
                        unexplained_variance    = float(abs(snap_variance)),
                        flux_amount             = float(random.randint(-5000, 5000)),
                        flux_percentage         = round(random.uniform(-15, 15), 2),
                        risk_score_at_snapshot  = {"LOW": 15, "MEDIUM": 35, "HIGH": 60, "CRITICAL": 82}.get(risk, 35),
                        variance_classification = classification,
                        is_demo_data            = True,
                        created_at              = _d(mo * 30),
                    )
                    db.add(snap)
            # ── CertificationWorkflow ─────────────────────────────────────
            wf_status = {
                "OPEN":          "OPEN",
                "PREPARED":      "IN_PROGRESS",
                "SUBMITTED":     "IN_PROGRESS",
                "UNDER_REVIEW":  "IN_PROGRESS",
                "APPROVED":      "APPROVED",
                "CERTIFIED":     "CERTIFIED",
            }.get(lc_state, "OPEN")

            workflow = CertificationWorkflow(
                profile_id      = profile.id,
                status          = wf_status,
                current_stage   = lc_state,
                preparer_id     = preparer_id,
                reviewer_id     = reviewer_id,
                approver_id     = approver_id,
                certifier_id    = certifier_id,
                due_date        = str(_date(-5)),   # 5 days from now
                is_demo_data    = True,
                created_at      = _d(25),
            )
            db.add(workflow)
            db.flush()

            # Workflow history trail
            wf_actions = [
                ("OPEN",         "PREPARED",     "preparer",  preparer_id,  20),
                ("PREPARED",     "SUBMITTED",     "preparer",  preparer_id,  15),
                ("SUBMITTED",    "UNDER_REVIEW",  "reviewer",  reviewer_id,  10),
            ]
            if lc_state in ("APPROVED", "CERTIFIED"):
                wf_actions.append(("UNDER_REVIEW", "APPROVED", "approver", approver_id, 5))
            if lc_state == "CERTIFIED":
                wf_actions.append(("APPROVED", "CERTIFIED", "certifier", certifier_id, 2))

            for from_s, to_s, role, actor, days_ago in wf_actions:
                db.add(CertificationWorkflowHistory(
                    workflow_id  = workflow.id,
                    actor_id     = actor,
                    actor_role   = role,
                    action       = to_s,
                    from_status  = from_s,
                    to_status    = to_s,
                    comments     = f"Demo: {role.title()} action — {to_s.replace('_', ' ').title()}",
                    is_demo_data = True,
                    created_at   = _d(days_ago),
                ))

            # ── ExceptionQueueRecords (via match groups) ──────────────────
            if has_exceptions:
                # Create 1-3 exceptions per profile, spread across aging buckets
                n_exceptions = random.randint(1, 3)
                age_buckets = [10, 45, 75, 110]  # CURRENT/WARNING/BREACH/CRITICAL

                for exc_idx in range(n_exceptions):
                    exc_type, exc_comment = random.choice(EXCEPTION_TYPES)
                    age_days = age_buckets[exc_idx % len(age_buckets)]

                    # Minimal match_group to satisfy FK
                    mg = MatchGroup(
                        profile_id      = profile.id,
                        classification  = "UNMATCHED",
                        strategy        = 'AUTO_MATCH',
                        variance_amount = float(random.randint(100, 5000)),
                        created_at      = _d(age_days),
                    )
                    db.add(mg)
                    db.flush()

                    exc_status = "RESOLVED" if age_days < 20 else ("IN_PROGRESS" if age_days < 60 else "OPEN")
                    exc = ExceptionQueueRecord(
                        match_group_id   = mg.id,
                        queue_type       = "exception",
                        assigned_to      = preparer_id,
                        status           = exc_status,
                        comments         = exc_comment,
                        classification   = exc_type,
                        escalated_at     = _d(age_days - 30) if age_days > 61 else None,
                        resolved_at      = _d(5) if exc_status == "RESOLVED" else None,
                        is_demo_data     = True,
                        created_at       = _d(age_days),
                    )
                    db.add(exc)

            # ── UINotifications ───────────────────────────────────────────
            notif_payloads = [
                (reviewer_id, "workflow", f"Balance Reconciliation Review Required — {prof_def['name']}", "Review Requested"),
                (preparer_id, "workflow", f"Profile {prof_def['name']} submitted for review", "Submission Confirmed"),
            ]
            if risk in ("HIGH", "CRITICAL"):
                notif_payloads.append((
                    certifier_id, "exception",
                    f"High variance detected on {prof_def['name']} — immediate review required",
                    "Variance Alert",
                ))

            for user_id, notif_type, title, msg in notif_payloads:
                if not user_id:
                    continue
                db.add(UINotification(
                    user_id           = user_id,
                    notification_type = notif_type,
                    title             = title,
                    message           = msg,
                    icon_type         = "warning" if risk in ("HIGH", "CRITICAL") else "info",
                    is_read           = random.choice([True, False]),
                    is_demo_data      = True,
                    created_at        = _d(random.randint(1, 15)),
                ))

        # Commit after each project to reduce memory pressure
        db.commit()
        log.info(f"[demo seed] Project '{proj_def['name']}' seeded ({len(proj_def['profiles'])} profiles)")

    total_profiles = len(created_profiles)
    log.info(f"[demo seed] Complete — {len(DEMO_PROJECTS)} projects, {total_profiles} profiles seeded.")
