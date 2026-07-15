"""
backend/app/services/risk_scoring_engine.py

Unified live risk scoring engine for DRMS.
Updated: Added aging penalty hook for BREACH (61-90d) and CRITICAL (90+d) exceptions.

Factor weights (sum to 100):
  ┌─────────────────────────────┬────────┐
  │ Factor                      │ Weight │
  ├─────────────────────────────┼────────┤
  │ Unmatched rate              │  25    │  ← reduced from 30 to make room
  │ Open exception count        │  20    │  ← reduced from 25
  │ Variance magnitude          │  20    │
  │ Exception age (avg days)    │  10    │
  │ Manual / override matches   │  10    │
  │ SoD violation               │   5    │
  │ Aging penalty (NEW)         │  10    │  ← BREACH/CRITICAL bucket penalties
  └─────────────────────────────┴────────┘

Aging penalty rules:
  - Each BREACH exception (61-90d)   → +1.5 points (capped at weight ceiling)
  - Each CRITICAL exception (90+d)   → +3.0 points
  - Each SEVERE exception (120+d)    → +5.0 points (forces profile to CRITICAL tier)
  - Penalty is additive and capped at weight ceiling (10 pts)
  - At 120+ days unresolved: minimum score floor of 75 enforced (forces CRITICAL)
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

# ─────────────────────────────────────────────────────────────────────────────
# Weight table
# ─────────────────────────────────────────────────────────────────────────────
WEIGHTS = {
    "unmatched_rate":       25,   # was 30
    "open_exceptions":      20,   # was 25
    "variance_magnitude":   20,
    "exception_age":        10,
    "manual_overrides":     10,
    "sod_violation":         5,
    "aging_penalty":        10,   # NEW — breach/critical aging
}

assert sum(WEIGHTS.values()) == 100, "Risk factor weights must sum to 100"

# ─────────────────────────────────────────────────────────────────────────────
# Aging penalty configuration — tune here, not in logic
# ─────────────────────────────────────────────────────────────────────────────
AGING_PENALTY_PER_BREACH   = 1.5   # 61-90 days
AGING_PENALTY_PER_CRITICAL = 3.0   # 90-119 days
AGING_PENALTY_PER_SEVERE   = 5.0   # 120+ days
SEVERE_FLOOR_SCORE         = 75.0  # minimum score when ANY exception is 120+ days


def _risk_level(score: float) -> str:
    if score < 25:
        return "LOW"
    if score < 50:
        return "MEDIUM"
    if score < 75:
        return "HIGH"
    return "CRITICAL"


def _cap(value: float, ceiling: float) -> float:
    return min(value, ceiling)


def _compute_aging_penalty(open_exceptions: list, today: date) -> tuple[float, dict]:
    """
    Compute the aging penalty contribution and a breakdown dict.

    Returns:
        (penalty_score, breakdown_dict)

    breakdown contains:
        breach_count, critical_count, severe_count,
        has_severe (bool for floor enforcement),
        penalty_contribution (float)
    """
    breach_count   = 0
    critical_count = 0
    severe_count   = 0

    for exc in open_exceptions:
        if not exc.created_at:
            continue
        age_days = (today - exc.created_at.date()).days
        if age_days >= 120:
            severe_count += 1
        elif age_days >= 90:
            critical_count += 1
        elif age_days >= 61:
            breach_count += 1

    raw_penalty = (
        breach_count   * AGING_PENALTY_PER_BREACH +
        critical_count * AGING_PENALTY_PER_CRITICAL +
        severe_count   * AGING_PENALTY_PER_SEVERE
    )
    penalty_contribution = _cap(raw_penalty, WEIGHTS["aging_penalty"])

    return penalty_contribution, {
        "breach_count":          breach_count,
        "critical_count":        critical_count,
        "severe_count":          severe_count,
        "has_severe":            severe_count > 0,
        "raw_penalty":           round(raw_penalty, 2),
        "penalty_contribution":  round(penalty_contribution, 1),
    }


def score_profile(
    db: Session,
    profile_id: int,
    *,
    persist: bool = True,
) -> dict:
    """
    Compute a live risk score for a single ReconciliationProfile.

    Returns a dict with:
        profile_id, risk_score (0-100), risk_classification,
        factors (per-factor contribution + raw value),
        scored_at (ISO string)

    If persist=True the score + classification are written back to the
    profile row (risk_score, risk_classification, risk_scored_at).
    """
    from ..models.models import (
        ReconciliationProfile,
        MatchGroup,
        ExceptionQueueRecord,
    )

    profile = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.id == profile_id
    ).first()
    if not profile:
        raise ValueError(f"ReconciliationProfile {profile_id} not found")

    today = date.today()

    # ── Raw data queries ──────────────────────────────────────────────────
    match_groups = (
        db.query(MatchGroup)
        .filter(MatchGroup.profile_id == profile_id)
        .all()
    )

    open_exceptions = (
        db.query(ExceptionQueueRecord)
        .join(MatchGroup, MatchGroup.id == ExceptionQueueRecord.match_group_id)
        .filter(
            MatchGroup.profile_id == profile_id,
            ExceptionQueueRecord.status.notin_(["RESOLVED", "CLOSED"]),
        )
        .all()
    )

    total_mg      = len(match_groups)
    unmatched_mg  = sum(1 for mg in match_groups if mg.classification == "UNMATCHED")
    variance_sum  = sum(abs(float(mg.variance_amount or 0)) for mg in match_groups)
    manual_mg     = sum(
        1 for mg in match_groups
        if (mg.strategy or "").lower() in {"manual", "rule_override", "override"}
    )

    exc_ages = []
    for exc in open_exceptions:
        if exc.created_at:
            exc_ages.append((today - exc.created_at.date()).days)

    avg_exc_age = (sum(exc_ages) / len(exc_ages)) if exc_ages else 0

    sod_hit = (
        (profile.assigned_preparer and profile.assigned_preparer == profile.assigned_reviewer)
        or (profile.assigned_reviewer and profile.assigned_reviewer == profile.assigned_approver)
    )

    # ── Standard factor contributions ─────────────────────────────────────

    # 1. Unmatched rate
    unmatched_rate = (unmatched_mg / total_mg) if total_mg else 0.0
    f_unmatched = _cap(unmatched_rate * WEIGHTS["unmatched_rate"], WEIGHTS["unmatched_rate"])

    # 2. Open exceptions (log scale)
    f_exceptions = _cap(
        math.log1p(len(open_exceptions)) / math.log1p(20) * WEIGHTS["open_exceptions"],
        WEIGHTS["open_exceptions"],
    )

    # 3. Variance magnitude
    VARIANCE_CEILING = 500_000
    f_variance = _cap(
        (variance_sum / VARIANCE_CEILING) * WEIGHTS["variance_magnitude"],
        WEIGHTS["variance_magnitude"],
    )

    # 4. Exception age — avg age, ceiling at 30 days (coarse baseline)
    #    The aging PENALTY (below) handles the fine-grained BREACH/CRITICAL impact
    f_age = _cap(
        (min(avg_exc_age, 30) / 30) * WEIGHTS["exception_age"],
        WEIGHTS["exception_age"],
    )

    # 5. Manual overrides
    f_manual = _cap(
        (manual_mg / 10) * WEIGHTS["manual_overrides"],
        WEIGHTS["manual_overrides"],
    )

    # 6. SoD violation (binary)
    f_sod = WEIGHTS["sod_violation"] if sod_hit else 0.0

    # ── Aging penalty (NEW) ───────────────────────────────────────────────
    f_aging_penalty, aging_breakdown = _compute_aging_penalty(open_exceptions, today)

    # ── Composite score ───────────────────────────────────────────────────
    raw_score = (
        f_unmatched + f_exceptions + f_variance +
        f_age + f_manual + f_sod + f_aging_penalty
    )
    score = round(min(raw_score, 100.0), 1)

    # ── SEVERE FLOOR: any 120+ day exception forces score ≥ 75 (CRITICAL) ─
    if aging_breakdown["has_severe"] and score < SEVERE_FLOOR_SCORE:
        score = SEVERE_FLOOR_SCORE

    classification = _risk_level(score)

    # ── Persist ───────────────────────────────────────────────────────────
    if persist:
        profile.risk_score          = score
        profile.risk_classification = classification
        profile.risk_scored_at      = datetime.utcnow()
        db.commit()

    scored_at = datetime.utcnow().isoformat()

    return {
        "profile_id":          profile_id,
        "profile_name":        profile.name,
        "risk_score":          score,
        "risk_classification": classification,
        "scored_at":           scored_at,
        "factors": {
            "unmatched_rate": {
                "weight":       WEIGHTS["unmatched_rate"],
                "raw_value":    round(unmatched_rate * 100, 1),
                "contribution": round(f_unmatched, 1),
                "label":        "Unmatched rate",
                "unit":         "%",
            },
            "open_exceptions": {
                "weight":       WEIGHTS["open_exceptions"],
                "raw_value":    len(open_exceptions),
                "contribution": round(f_exceptions, 1),
                "label":        "Open exceptions",
                "unit":         "count",
            },
            "variance_magnitude": {
                "weight":       WEIGHTS["variance_magnitude"],
                "raw_value":    round(variance_sum, 2),
                "contribution": round(f_variance, 1),
                "label":        "Variance amount",
                "unit":         "$",
            },
            "exception_age": {
                "weight":       WEIGHTS["exception_age"],
                "raw_value":    round(avg_exc_age, 1),
                "contribution": round(f_age, 1),
                "label":        "Avg exception age",
                "unit":         "days",
            },
            "manual_overrides": {
                "weight":       WEIGHTS["manual_overrides"],
                "raw_value":    manual_mg,
                "contribution": round(f_manual, 1),
                "label":        "Manual overrides",
                "unit":         "count",
            },
            "sod_violation": {
                "weight":       WEIGHTS["sod_violation"],
                "raw_value":    1 if sod_hit else 0,
                "contribution": round(f_sod, 1),
                "label":        "SoD violation",
                "unit":         "bool",
            },
            # ── NEW factor ──────────────────────────────────────────────
            "aging_penalty": {
                "weight":          WEIGHTS["aging_penalty"],
                "raw_value":       aging_breakdown["raw_penalty"],
                "contribution":    aging_breakdown["penalty_contribution"],
                "label":           "Aging penalty",
                "unit":            "pts",
                "breach_count":    aging_breakdown["breach_count"],
                "critical_count":  aging_breakdown["critical_count"],
                "severe_count":    aging_breakdown["severe_count"],
                "severe_floor_applied": aging_breakdown["has_severe"] and score == SEVERE_FLOOR_SCORE,
            },
        },
        "stats": {
            "total_match_groups": total_mg,
            "unmatched":          unmatched_mg,
            "open_exceptions":    len(open_exceptions),
            "variance_amount":    round(variance_sum, 2),
            "avg_exception_age":  round(avg_exc_age, 1),
            "manual_overrides":   manual_mg,
            "sod_hit":            sod_hit,
            # NEW aging stats
            "breach_exceptions":  aging_breakdown["breach_count"],
            "critical_exceptions": aging_breakdown["critical_count"],
            "severe_exceptions":  aging_breakdown["severe_count"],
            "severe_floor_applied": aging_breakdown["has_severe"] and score == SEVERE_FLOOR_SCORE,
        },
    }


def score_all_profiles(
    db: Session,
    *,
    active_only: bool = True,
    persist: bool = True,
) -> tuple[list[dict], list[dict]]:
    """
    Batch-score all profiles.
    Called by POST /enterprise/risk/calculate and the APScheduler nightly job.
    Returns (results_sorted_by_risk_desc, errors).
    """
    from ..models.models import ReconciliationProfile

    query = db.query(ReconciliationProfile)
    if active_only:
        query = query.filter(ReconciliationProfile.active == True)
    profiles = query.all()

    results = []
    errors  = []
    for p in profiles:
        try:
            results.append(score_profile(db, p.id, persist=persist))
        except Exception as exc:
            errors.append({"profile_id": p.id, "error": str(exc)})

    results.sort(key=lambda x: -x["risk_score"])
    return results, errors


def get_risk_dashboard(db: Session, current_user: Optional[User] = None) -> dict:
    """
    Full dashboard payload for GET /enterprise/dashboard/risk-real.
    Uses cached score when fresh (< 10 min), else re-scores live.
    """
    from ..models.models import (
        ReconciliationProfile,
        CertificationWorkflow,
        ExceptionQueueRecord,
        MatchGroup
    )
    from ..rbac.rls import apply_profile_rls

    today = date.today()
    now   = datetime.utcnow()
    STALE_MINUTES = 10

    profile_query = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True)
    if current_user:
        profile_query = apply_profile_rls(profile_query, current_user, profile_model=ReconciliationProfile)
        
    profiles = profile_query.all()

    profile_risk = []
    for p in profiles:
        scored_at   = getattr(p, "risk_scored_at", None)
        is_stale    = (
            scored_at is None
            or (now - scored_at).total_seconds() > STALE_MINUTES * 60
        )
        cached_score = getattr(p, "risk_score", None)

        if is_stale or cached_score is None:
            result = score_profile(db, p.id, persist=True)
        else:
            result = {
                "profile_id":          p.id,
                "profile_name":        p.name,
                "risk_score":          cached_score,
                "risk_classification": p.risk_classification or "MEDIUM",
                "factors":             {},
                "stats":               {},
            }

        profile_risk.append({
            "id":                     p.id,
            "name":                   p.name,
            "risk_classification":    result["risk_classification"],
            "risk_score":             result["risk_score"],
            "total_records":          result.get("stats", {}).get("total_match_groups", 0),
            "unmatched":              result.get("stats", {}).get("unmatched", 0),
            "open_exceptions":        result.get("stats", {}).get("open_exceptions", 0),
            "variance_amount":        result.get("stats", {}).get("variance_amount", 0),
            "breach_exceptions":      result.get("stats", {}).get("breach_exceptions", 0),
            "critical_exceptions":    result.get("stats", {}).get("critical_exceptions", 0),
            "severe_exceptions":      result.get("stats", {}).get("severe_exceptions", 0),
            "severe_floor_applied":   result.get("stats", {}).get("severe_floor_applied", False),
            "lifecycle_state":        p.lifecycle_state or "OPEN",
            "reconciliation_type":    p.reconciliation_type or "",
            "factors":                result.get("factors", {}),
            "scored_at":              result.get("scored_at"),
        })

    profile_risk.sort(key=lambda x: -x["risk_score"])

    # ── Exception aging by risk tier ──────────────────────────────────────
    all_exceptions   = db.query(ExceptionQueueRecord).all()
    all_mgs          = db.query(MatchGroup).all()
    mg_profile_map   = {mg.id: mg.profile_id for mg in all_mgs}
    profile_risk_map = {p.id: (p.risk_classification or "MEDIUM").upper() for p in profiles}

    aging_by_risk: dict[str, list[int]] = {
        "LOW": [], "MEDIUM": [], "HIGH": [], "CRITICAL": []
    }
    for exc in all_exceptions:
        if (exc.status or "").upper() in ("RESOLVED", "CLOSED"):
            continue
        if not exc.created_at:
            continue
        profile_id = mg_profile_map.get(exc.match_group_id)
        risk       = profile_risk_map.get(profile_id, "MEDIUM")
        days       = (today - exc.created_at.date()).days
        if risk in aging_by_risk:
            aging_by_risk[risk].append(days)

    aging_summary = {
        risk: {
            "count":    len(days),
            "avg_days": round(sum(days) / len(days), 1) if days else 0,
            "max_days": max(days) if days else 0,
        }
        for risk, days in aging_by_risk.items()
    }

    # ── SoD violations ────────────────────────────────────────────────────
    sod_violations = []
    for p in profiles:
        if p.assigned_preparer and p.assigned_preparer == p.assigned_reviewer:
            sod_violations.append({
                "profile_id":   p.id,
                "profile_name": p.name,
                "violation":    "Preparer equals Reviewer",
                "severity":     "HIGH",
            })
        if p.assigned_reviewer and p.assigned_reviewer == p.assigned_approver:
            sod_violations.append({
                "profile_id":   p.id,
                "profile_name": p.name,
                "violation":    "Reviewer equals Approver",
                "severity":     "HIGH",
            })
        if p.assigned_approver and p.assigned_approver == p.assigned_certifier:
            sod_violations.append({
                "profile_id":   p.id,
                "profile_name": p.name,
                "violation":    "Approver equals Certifier",
                "severity":     "MEDIUM",
            })

    # ── Overdue high risk ─────────────────────────────────────────────────
    overdue_high_risk = []
    certs       = db.query(CertificationWorkflow).filter(
        CertificationWorkflow.status.notin_(["CERTIFIED", "CLOSED"])
    ).all()
    profile_map = {p.id: p for p in profiles}
    for c in certs:
        if not c.due_date:
            continue
        try:
            due = date.fromisoformat(str(c.due_date))
            if today <= due:
                continue
        except Exception:
            continue
        prof = profile_map.get(c.profile_id)
        if prof and (prof.risk_classification or "").upper() in ("HIGH", "CRITICAL"):
            overdue_high_risk.append({
                "profile_id":   c.profile_id,
                "profile_name": prof.name,
                "due_date":     str(c.due_date),
                "days_overdue": (today - due).days,
                "risk":         prof.risk_classification or "HIGH",
            })

    risk_breakdown = {
        k: len([p for p in profiles if (p.risk_classification or "MEDIUM").upper() == k])
        for k in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    }

    total_score = (
        round(sum(p["risk_score"] for p in profile_risk) / len(profile_risk), 1)
        if profile_risk else 0
    )

    return {
        "profile_risk_scores":      profile_risk[:50],
        "risk_breakdown":           risk_breakdown,
        "exception_aging_by_risk":  aging_summary,
        "sod_violations":           sod_violations[:20],
        "overdue_high_risk":        overdue_high_risk[:20],
        "total_risk_score":         total_score,
        "scored_at":                now.isoformat() + "Z",
        "profile_count":            len(profiles),
    }
