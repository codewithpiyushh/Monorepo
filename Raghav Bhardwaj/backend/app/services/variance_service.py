from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.models import ReconciliationBalance, ReconciliationProfile, VarianceSnapshot
from . import audit_service


CLASS_BALANCED = "BALANCED"
CLASS_WITHIN_THRESHOLD = "WITHIN_THRESHOLD"
CLASS_MATERIAL_VARIANCE = "MATERIAL_VARIANCE"
CLASS_CRITICAL_VARIANCE = "CRITICAL_VARIANCE"

ROOT_CAUSE_CATEGORIES = {
    "TIMING_DIFFERENCE",
    "DATA_MAPPING_ISSUE",
    "MISSING_TRANSACTION",
    "FX_ADJUSTMENT",
    "MANUAL_JOURNAL",
    "INTERCOMPANY_DIFFERENCE",
    "SYSTEM_ERROR",
    "OTHER",
}

RESOLUTION_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED"}
EXPLANATION_REQUIRED_CLASSES = {CLASS_MATERIAL_VARIANCE, CLASS_CRITICAL_VARIANCE}


def _classify_variance(unexplained: float, threshold_amount: float, materiality_limit: float) -> str:
    if unexplained == 0:
        return CLASS_BALANCED
    if unexplained <= threshold_amount:
        return CLASS_WITHIN_THRESHOLD
    if materiality_limit > 0 and unexplained <= materiality_limit:
        return CLASS_MATERIAL_VARIANCE
    return CLASS_CRITICAL_VARIANCE


def _safe_flux_pct(flux_amount: float, prior_balance: float) -> float:
    if prior_balance == 0:
        return 0.0
    return round((flux_amount / abs(prior_balance)) * 100, 2)


def _flux_penalty(flux_pct: float) -> float:
    abs_flux = abs(flux_pct or 0.0)
    if abs_flux > 50:
        return 20.0
    if abs_flux > 25:
        return 10.0
    if abs_flux > 15:
        return 5.0
    return 0.0


def _get_supporting_items_net(db: Session, balance_id: int) -> float:
    try:
        result = db.execute(
            text(
                """
                SELECT COALESCE(SUM(
                    CASE
                        WHEN impact_direction = 'POSITIVE' THEN amount
                        WHEN impact_direction = 'NEGATIVE' THEN -amount
                        ELSE 0
                    END
                ), 0.0)
                FROM supporting_items
                WHERE balance_id = :bid
                  AND is_resolved = 0
                """
            ),
            {"bid": balance_id},
        ).scalar()
        return float(result or 0.0)
    except Exception:
        return 0.0


def compute_full_variance(db: Session, balance: ReconciliationBalance) -> dict:
    raw_variance = float(balance.source_balance or 0) - float(balance.target_balance or 0)
    explained_variance = _get_supporting_items_net(db, balance.id)
    unexplained_variance = abs(raw_variance + explained_variance)
    classification = _classify_variance(
        unexplained_variance,
        float(balance.threshold_amount or 0),
        float(balance.materiality_limit or 0),
    )
    return {
        "raw_variance": round(raw_variance, 4),
        "explained_variance": round(explained_variance, 4),
        "unexplained_variance": round(unexplained_variance, 4),
        "classification": classification,
    }


def _get_prior_period_balance(db: Session, profile_id: int, current_period_key: str) -> Optional[ReconciliationBalance]:
    return (
        db.query(ReconciliationBalance)
        .filter(
            ReconciliationBalance.profile_id == profile_id,
            ReconciliationBalance.period_key < current_period_key,
        )
        .order_by(ReconciliationBalance.period_key.desc())
        .first()
    )


def compute_flux(db: Session, balance: ReconciliationBalance) -> dict:
    prior = _get_prior_period_balance(db, balance.profile_id, balance.period_key)
    if not prior:
        return {"flux_amount": None, "flux_percentage": None, "flux_penalty": 0.0, "prior_period_key": None}

    flux_amount = float(balance.source_balance or 0) - float(prior.source_balance or 0)
    flux_pct = _safe_flux_pct(flux_amount, float(prior.source_balance or 0))
    return {
        "flux_amount": round(flux_amount, 4),
        "flux_percentage": flux_pct,
        "flux_penalty": _flux_penalty(flux_pct),
        "prior_period_key": prior.period_key,
    }


def _apply_flux_risk_penalty(db: Session, profile_id: int, flux_penalty: float) -> None:
    if not flux_penalty:
        return
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not profile:
        return

    current = float(profile.risk_score or 0.0)
    next_score = min(current + float(flux_penalty), 100.0)
    if next_score >= 75:
        risk_classification = "CRITICAL"
    elif next_score >= 50:
        risk_classification = "HIGH"
    elif next_score >= 25:
        risk_classification = "MEDIUM"
    else:
        risk_classification = "LOW"

    profile.risk_score = round(next_score, 1)
    profile.risk_classification = risk_classification
    profile.risk_scored_at = datetime.utcnow()
    db.commit()

    try:
        from ..services.risk_scoring_engine import score_profile

        score_profile(db, profile_id, persist=True)
    except Exception:
        pass


def write_variance_snapshot(
    db: Session,
    balance: ReconciliationBalance,
    var_data: dict,
    flux_data: dict,
    actor_id: Optional[int] = None,
) -> VarianceSnapshot:
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == balance.profile_id).first()
    existing = (
        db.query(VarianceSnapshot)
        .filter(
            VarianceSnapshot.profile_id == balance.profile_id,
            VarianceSnapshot.period_key == balance.period_key,
        )
        .first()
    )

    payload = {
        "profile_id": balance.profile_id,
        "period_key": balance.period_key,
        "raw_variance": var_data.get("raw_variance"),
        "explained_variance": var_data.get("explained_variance"),
        "unexplained_variance": var_data.get("unexplained_variance"),
        "flux_amount": flux_data.get("flux_amount"),
        "flux_percentage": flux_data.get("flux_percentage"),
        "risk_score_at_snapshot": float(profile.risk_score or 0) if profile else None,
        "variance_classification": var_data.get("classification"),
        "created_at": datetime.utcnow(),
    }

    snap = existing or VarianceSnapshot(**payload)
    if existing:
        for key, value in payload.items():
            setattr(existing, key, value)
    else:
        db.add(snap)

    db.commit()
    db.refresh(snap)
    return snap


def refresh_balance_variance(
    db: Session,
    balance_id: int,
    actor_id: Optional[int] = None,
    persist: bool = True,
) -> dict:
    balance = db.query(ReconciliationBalance).filter(ReconciliationBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Balance record not found")

    var = compute_full_variance(db, balance)
    flux = compute_flux(db, balance)

    if persist:
        balance.explained_variance = var["explained_variance"]
        balance.unexplained_variance = var["unexplained_variance"]
        balance.variance_severity_classification = var["classification"]
        balance.flux_amount = flux.get("flux_amount")
        balance.flux_percentage = flux.get("flux_percentage")
        balance.updated_at = datetime.utcnow()

        audit_service.log_action(
            db,
            "VARIANCE_RECALCULATED",
            user_id=actor_id,
            entity_type="reconciliation_balance",
            entity_id=balance_id,
            metadata={**var, **flux},
        )
        db.commit()

        if flux.get("flux_penalty", 0):
            _apply_flux_risk_penalty(db, balance.profile_id, float(flux["flux_penalty"]))

        if var["classification"] in EXPLANATION_REQUIRED_CLASSES and balance.profile_id:
            try:
                from ..services.risk_scoring_engine import score_profile

                score_profile(db, balance.profile_id, persist=True)
            except Exception:
                pass

        try:
            write_variance_snapshot(db, balance, var, flux, actor_id=actor_id)
        except Exception:
            pass

    return {**var, **flux}


def save_explanation(
    db: Session,
    balance_id: int,
    root_cause_category: Optional[str],
    variance_explanation: Optional[str],
    resolution_target_date: Optional[date],
    resolution_status: Optional[str],
    actor_id: Optional[int],
) -> ReconciliationBalance:
    balance = db.query(ReconciliationBalance).filter(ReconciliationBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Balance record not found")

    if root_cause_category and root_cause_category not in ROOT_CAUSE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid root_cause_category. Must be one of {sorted(ROOT_CAUSE_CATEGORIES)}")
    if resolution_status and resolution_status not in RESOLUTION_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid resolution_status. Must be one of {sorted(RESOLUTION_STATUSES)}")

    if root_cause_category is not None:
        balance.root_cause_category = root_cause_category
    if variance_explanation is not None:
        balance.variance_explanation = variance_explanation
    if resolution_target_date is not None:
        balance.resolution_target_date = resolution_target_date
    if resolution_status is not None:
        balance.resolution_status = resolution_status

    balance.updated_by = actor_id
    balance.updated_at = datetime.utcnow()

    audit_service.log_action(
        db,
        "VARIANCE_EXPLANATION_SAVED",
        user_id=actor_id,
        entity_type="reconciliation_balance",
        entity_id=balance_id,
        metadata={
            "root_cause_category": root_cause_category,
            "resolution_status": resolution_status,
        },
    )

    db.commit()
    db.refresh(balance)
    return balance


def check_explanation_required(balance: ReconciliationBalance) -> bool:
    cls = balance.variance_severity_classification or ""
    if cls not in EXPLANATION_REQUIRED_CLASSES:
        return False
    return not bool(balance.root_cause_category and balance.variance_explanation)


def _period_keys(months: int) -> list[str]:
    today = date.today().replace(day=1)
    keys = []
    year, month = today.year, today.month
    for _ in range(months):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month < 1:
            month = 12
            year -= 1
    return list(reversed(keys))


def get_variance_flux_summary(
    db: Session,
    profile_id: Optional[int] = None,
    period_key: Optional[str] = None,
    top_n: int = 10,
) -> dict:
    query = db.query(ReconciliationBalance).filter(ReconciliationBalance.status != "DRAFT")
    if profile_id is not None:
        query = query.filter(ReconciliationBalance.profile_id == profile_id)
    if period_key:
        query = query.filter(ReconciliationBalance.period_key == period_key)

    balances = query.all()
    profile_ids = sorted({b.profile_id for b in balances if b.profile_id})
    profiles = {
        p.id: p
        for p in db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(profile_ids)).all()
    } if profile_ids else {}

    enriched = []
    for balance in balances:
        profile = profiles.get(balance.profile_id)
        enriched.append({
            "balance_id": balance.id,
            "profile_id": balance.profile_id,
            "profile_name": profile.name if profile else f"Profile #{balance.profile_id}",
            "period_key": balance.period_key,
            "source_balance": float(balance.source_balance or 0),
            "target_balance": float(balance.target_balance or 0),
            "raw_variance": float(balance.source_balance or 0) - float(balance.target_balance or 0),
            "explained_variance": float(balance.explained_variance or 0),
            "unexplained_variance": float(balance.unexplained_variance or 0),
            "flux_amount": balance.flux_amount,
            "flux_percentage": balance.flux_percentage,
            "classification": balance.variance_severity_classification or CLASS_BALANCED,
            "risk_classification": profile.risk_classification if profile else None,
            "explanation_provided": bool(balance.root_cause_category and balance.variance_explanation),
        })

    top_unexplained = sorted(enriched, key=lambda row: abs(row["unexplained_variance"]), reverse=True)[:top_n]
    top_flux_shifts = sorted(
        [row for row in enriched if row["flux_percentage"] is not None],
        key=lambda row: abs(row["flux_percentage"] or 0),
        reverse=True,
    )[:top_n]

    total_unexplained = sum(abs(row["unexplained_variance"]) for row in enriched)
    missing_narratives = sum(
        1
        for row in enriched
        if row["classification"] in EXPLANATION_REQUIRED_CLASSES and not row["explanation_provided"]
    )
    waterfall = []
    cumulative = 0.0
    for row in sorted(enriched, key=lambda item: abs(item["unexplained_variance"]), reverse=True):
        contribution = abs(row["unexplained_variance"])
        cumulative += contribution
        waterfall.append({
            "profile_id": row["profile_id"],
            "profile_name": row["profile_name"],
            "period_key": row["period_key"],
            "contribution": round(contribution, 2),
            "cumulative": round(cumulative, 2),
            "pct_of_total": round((contribution / total_unexplained * 100) if total_unexplained else 0, 1),
            "classification": row["classification"],
        })

    return {
        "top_unexplained": top_unexplained,
        "top_flux_shifts": top_flux_shifts,
        "waterfall": waterfall,
        "total_unexplained": round(total_unexplained, 2),
        "total_profiles": len(enriched),
        "missing_narratives": missing_narratives,
        "generated_at": datetime.utcnow().isoformat(),
    }


def get_variance_trends(
    db: Session,
    profile_id: Optional[int] = None,
    months: int = 6,
) -> list[dict]:
    period_keys = _period_keys(months)
    query = db.query(VarianceSnapshot).filter(VarianceSnapshot.period_key.in_(period_keys))
    if profile_id is not None:
        query = query.filter(VarianceSnapshot.profile_id == profile_id)

    snapshots = query.order_by(VarianceSnapshot.period_key.asc()).all()
    rows = {
        period: {
            "period_key": period,
            "raw_variance": 0.0,
            "explained_variance": 0.0,
            "unexplained_variance": 0.0,
            "flux_amount": 0.0,
            "flux_percentage": 0.0,
            "risk_score": 0.0,
            "classification": CLASS_BALANCED,
            "_count": 0,
            "_flux_pct_count": 0,
        }
        for period in period_keys
    }
    rank = {
        CLASS_BALANCED: 0,
        CLASS_WITHIN_THRESHOLD: 1,
        CLASS_MATERIAL_VARIANCE: 2,
        CLASS_CRITICAL_VARIANCE: 3,
    }

    for snap in snapshots:
        row = rows.get(snap.period_key)
        if not row:
            continue
        row["raw_variance"] += float(snap.raw_variance or 0)
        row["explained_variance"] += float(snap.explained_variance or 0)
        row["unexplained_variance"] += float(snap.unexplained_variance or 0)
        row["flux_amount"] += float(snap.flux_amount or 0)
        if snap.flux_percentage is not None:
            row["flux_percentage"] += float(snap.flux_percentage or 0)
            row["_flux_pct_count"] += 1
        row["risk_score"] += float(snap.risk_score_at_snapshot or 0)
        row["_count"] += 1
        snap_class = snap.variance_classification or CLASS_BALANCED
        if rank.get(snap_class, 0) > rank.get(row["classification"], 0):
            row["classification"] = snap_class

    result = []
    for period in period_keys:
        row = rows[period]
        count = row.pop("_count") or 1
        flux_count = row.pop("_flux_pct_count") or 0
        row["risk_score"] = round(row["risk_score"] / count, 1)
        row["flux_percentage"] = round(row["flux_percentage"] / flux_count, 2) if flux_count else 0.0
        row["raw_variance"] = round(row["raw_variance"], 2)
        row["explained_variance"] = round(row["explained_variance"], 2)
        row["unexplained_variance"] = round(row["unexplained_variance"], 2)
        row["flux_amount"] = round(row["flux_amount"], 2)
        result.append(row)
    return result
