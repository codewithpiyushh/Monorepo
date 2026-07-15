from datetime import datetime, timedelta

from app.models.models import ReconciliationBalance, ReconciliationProfile, SLAViolation
from app.services.sla_monitoring_service import ensure_default_policies, run_sla_scan


def test_run_sla_scan_creates_violation_for_out_of_balance_state(db):
    profile = ReconciliationProfile(
        name="SLA Test Profile",
        reconciliation_type="GL",
        frequency="MONTHLY",
        risk_classification="HIGH",
        assigned_preparer=1,
        assigned_approver=1,
        assigned_certifier=1,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    balance = ReconciliationBalance(
        profile_id=profile.id,
        period_key="2026-07",
        source_balance=100.0,
        target_balance=80.0,
        variance_amount=20.0,
        status="OUT_OF_BALANCE",
        created_at=datetime.utcnow() - timedelta(days=3),
    )
    db.add(balance)
    db.commit()
    db.refresh(balance)

    ensure_default_policies(db, commit=True)
    result = run_sla_scan(db)

    assert result["scanned_balances"] == 1
    violation = db.query(SLAViolation).filter(SLAViolation.balance_id == balance.id).first()
    assert violation is not None
    assert violation.status == "OPEN"
    assert violation.days_overdue >= 1
    assert violation.violation_type == "SLA_BREACH"
