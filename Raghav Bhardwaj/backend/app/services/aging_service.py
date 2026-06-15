"""
backend/app/services/aging_service.py

Exception Aging Engine — core service layer.

Responsibilities:
  - Age calculation from exception_queue_records.created_at
  - Bucket classification: CURRENT / WARNING / BREACH / CRITICAL
  - Summary, detail, and trend aggregations
  - Automated escalation with dedup (no repeat notifications same day)
  - Risk score trigger on BREACH / CRITICAL transitions
  - Monthly snapshot writes for trend data
  - Full audit logging via existing audit_service
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.models import (
    ExceptionQueueRecord,
    ExceptionAgingSnapshot,
    ExceptionEscalationLog,
    MatchGroup,
    ReconciliationProfile,
    UINotification,
    User,
)
from ..services import audit_service

# ── Bucket definitions ────────────────────────────────────────────────────────
BUCKET_CURRENT  = "CURRENT"    # 0-30 days
BUCKET_WARNING  = "WARNING"    # 31-60 days
BUCKET_BREACH   = "BREACH"     # 61-90 days
BUCKET_CRITICAL = "CRITICAL"   # 90+ days

BUCKET_ORDER = [BUCKET_CURRENT, BUCKET_WARNING, BUCKET_BREACH, BUCKET_CRITICAL]

BUCKET_COLOR = {
    BUCKET_CURRENT:  "#22c55e",
    BUCKET_WARNING:  "#eab308",
    BUCKET_BREACH:   "#f97316",
    BUCKET_CRITICAL: "#ef4444",
}

ESCALATION_RULES = [
    # (min_age_days, level,    notified_role,  icon,      title_tpl)
    (61,  "BREACH",   "reviewer",  "warning", "Exception Aging Alert — Review Required"),
    (90,  "CRITICAL", "certifier", "error",   "Exception Escalation — Certifier Attention Required"),
    (120, "SEVERE",   "admin",     "error",   "Exception Escalation — Immediate Action Required (120+ Days)"),
]

EXCLUDED_STATUSES = {"RESOLVED", "CLOSED"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bucket_for(age_days: int) -> str:
    if age_days <= 30:
        return BUCKET_CURRENT
    if age_days <= 60:
        return BUCKET_WARNING
    if age_days <= 90:
        return BUCKET_BREACH
    return BUCKET_CRITICAL


def _age_days(created_at: Optional[datetime]) -> int:
    if not created_at:
        return 0
    today = date.today()
    delta = today - created_at.date()
    return max(0, delta.days)


def _empty_bucket_summary(bucket: str) -> dict:
    return {
        "bucket":                bucket,
        "color":                 BUCKET_COLOR[bucket],
        "exception_count":       0,
        "total_exception_amount": 0.0,
        "average_age_days":      0.0,
        "oldest_exception_days": 0,
    }


def _notify(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    icon_type: str = "warning",
    action_url: Optional[str] = None,
) -> None:
    if not user_id:
        return
    db.add(UINotification(
        user_id           = user_id,
        notification_type = notification_type,
        title             = title,
        message           = message,
        icon_type         = icon_type,
        action_url        = action_url,
        is_read           = False,
        created_at        = datetime.utcnow(),
    ))


def _already_escalated_today(
    db: Session,
    exception_id: int,
    level: str,
) -> bool:
    """Prevent duplicate escalation notifications within the same calendar day."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    existing = db.query(ExceptionEscalationLog).filter(
        ExceptionEscalationLog.exception_id    == exception_id,
        ExceptionEscalationLog.escalation_level == level,
        ExceptionEscalationLog.escalated_at    >= today_start,
    ).first()
    return existing is not None


def _get_profile_for_exception(
    db: Session,
    exc: ExceptionQueueRecord,
) -> Optional[ReconciliationProfile]:
    """
    Walk: exception → match_group → profile.
    Returns None gracefully if the chain is broken.
    """
    mg = db.query(MatchGroup).filter(
        MatchGroup.id == exc.match_group_id
    ).first()
    if not mg or not mg.profile_id:
        return None
    return db.query(ReconciliationProfile).filter(
        ReconciliationProfile.id == mg.profile_id
    ).first()


def _get_users_by_role(db: Session, role: str) -> list[User]:
    return db.query(User).filter(
        func.lower(User.role) == role.lower()
    ).all()


# ── Build enriched exception list ─────────────────────────────────────────────

def _enrich_exceptions(
    db: Session,
    include_resolved: bool = False,
    profile_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    risk_classification: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[dict]:
    """
    Fetch exceptions and compute age + bucket + profile context.
    Returns a list of dicts ready for aggregation.
    """
    q = db.query(ExceptionQueueRecord)

    if not include_resolved:
        q = q.filter(ExceptionQueueRecord.status.notin_(EXCLUDED_STATUSES))

    if owner_id is not None:
        q = q.filter(ExceptionQueueRecord.assigned_to == owner_id)

    if status_filter:
        q = q.filter(ExceptionQueueRecord.status == status_filter.upper())

    if date_from:
        q = q.filter(ExceptionQueueRecord.created_at >= datetime.combine(date_from, datetime.min.time()))

    if date_to:
        q = q.filter(ExceptionQueueRecord.created_at <= datetime.combine(date_to, datetime.max.time()))

    exceptions = q.all()

    # Build profile lookup: match_group_id → profile
    mg_ids = [e.match_group_id for e in exceptions if e.match_group_id]
    match_groups = {}
    if mg_ids:
        mgs = db.query(MatchGroup).filter(MatchGroup.id.in_(mg_ids)).all()
        match_groups = {mg.id: mg for mg in mgs}

    profile_ids = list({mg.profile_id for mg in match_groups.values() if mg.profile_id})
    profiles = {}
    if profile_ids:
        profs = db.query(ReconciliationProfile).filter(
            ReconciliationProfile.id.in_(profile_ids)
        ).all()
        profiles = {p.id: p for p in profs}

    enriched = []
    for exc in exceptions:
        mg      = match_groups.get(exc.match_group_id)
        profile = profiles.get(mg.profile_id) if mg else None

        # Apply profile_id filter here (post join)
        if profile_id is not None:
            if not profile or profile.id != profile_id:
                continue

        # Apply risk_classification filter
        if risk_classification and profile:
            if (profile.risk_classification or "").upper() != risk_classification.upper():
                continue

        age  = _age_days(exc.created_at)
        buck = _bucket_for(age)

        enriched.append({
            "id":                   exc.id,
            "match_group_id":       exc.match_group_id,
            "queue_type":           exc.queue_type,
            "assigned_to":          exc.assigned_to,
            "status":               exc.status,
            "comments":             exc.comments,
            "classification":       exc.classification,
            "resolution_notes":     exc.resolution_notes,
            "escalated_at":         exc.escalated_at,
            "resolved_at":          exc.resolved_at,
            "created_at":           exc.created_at,
            "age_days":             age,
            "bucket":               buck,
            "bucket_color":         BUCKET_COLOR[buck],
            "variance_amount":      mg.variance_amount if mg else None,
            "profile_id":           profile.id if profile else None,
            "profile_name":         profile.name if profile else None,
            "risk_classification":  profile.risk_classification if profile else None,
            "assigned_reviewer":    profile.assigned_reviewer if profile else None,
            "assigned_certifier":   profile.assigned_certifier if profile else None,
        })

    return enriched


# ── Public API ────────────────────────────────────────────────────────────────

def get_aging_summary(
    db: Session,
    profile_id: Optional[int]           = None,
    owner_id: Optional[int]             = None,
    status_filter: Optional[str]        = None,
    risk_classification: Optional[str]  = None,
    date_from: Optional[date]           = None,
    date_to: Optional[date]             = None,
    include_resolved: bool              = False,
) -> dict:
    """
    Returns per-bucket KPI data:
      exception_count, total_exception_amount, average_age_days,
      oldest_exception_days, color.
    Also returns overall totals.
    """
    enriched = _enrich_exceptions(
        db,
        include_resolved    = include_resolved,
        profile_id          = profile_id,
        owner_id            = owner_id,
        status_filter       = status_filter,
        risk_classification = risk_classification,
        date_from           = date_from,
        date_to             = date_to,
    )

    buckets: dict[str, dict] = {b: _empty_bucket_summary(b) for b in BUCKET_ORDER}

    for exc in enriched:
        b = exc["bucket"]
        s = buckets[b]
        s["exception_count"]        += 1
        s["total_exception_amount"] += float(exc["variance_amount"] or 0)
        s["oldest_exception_days"]   = max(s["oldest_exception_days"], exc["age_days"])
        # accumulate age for average calc
        s.setdefault("_age_sum", 0)
        s["_age_sum"] += exc["age_days"]

    # Finalise averages
    for b, s in buckets.items():
        cnt = s["exception_count"]
        s["average_age_days"] = round(s.pop("_age_sum", 0) / cnt, 1) if cnt else 0.0
        s["total_exception_amount"] = round(s["total_exception_amount"], 2)

    total_count  = sum(s["exception_count"]        for s in buckets.values())
    total_amount = sum(s["total_exception_amount"]  for s in buckets.values())
    overall_avg  = (
        round(sum(e["age_days"] for e in enriched) / total_count, 1)
        if total_count else 0.0
    )
    oldest = max((e["age_days"] for e in enriched), default=0)

    return {
        "buckets":              list(buckets.values()),
        "total_count":          total_count,
        "total_amount":         round(total_amount, 2),
        "overall_average_age":  overall_avg,
        "oldest_exception_days": oldest,
        "generated_at":         datetime.utcnow().isoformat(),
    }


def get_aging_details(
    db: Session,
    bucket: Optional[str]               = None,
    profile_id: Optional[int]           = None,
    owner_id: Optional[int]             = None,
    status_filter: Optional[str]        = None,
    risk_classification: Optional[str]  = None,
    date_from: Optional[date]           = None,
    date_to: Optional[date]             = None,
    include_resolved: bool              = False,
    page: int                           = 1,
    page_size: int                      = 50,
    sort_by: str                        = "age_days",
    sort_desc: bool                     = True,
) -> dict:
    """
    Paginated, filterable exception list with aging metadata.
    Optional bucket filter (CURRENT / WARNING / BREACH / CRITICAL).
    """
    enriched = _enrich_exceptions(
        db,
        include_resolved    = include_resolved,
        profile_id          = profile_id,
        owner_id            = owner_id,
        status_filter       = status_filter,
        risk_classification = risk_classification,
        date_from           = date_from,
        date_to             = date_to,
    )

    if bucket:
        bucket_upper = bucket.upper()
        enriched = [e for e in enriched if e["bucket"] == bucket_upper]

    # Sort
    reverse = sort_desc
    try:
        enriched.sort(key=lambda x: (x.get(sort_by) or 0), reverse=reverse)
    except TypeError:
        enriched.sort(key=lambda x: str(x.get(sort_by) or ""), reverse=reverse)

    total = len(enriched)
    start = (page - 1) * page_size
    page_items = enriched[start: start + page_size]

    return {
        "items":     page_items,
        "total":     total,
        "page":      page,
        "page_size": page_size,
    }


def get_aging_trend(
    db: Session,
    profile_id: Optional[int]  = None,
    months: int                 = 6,
) -> list[dict]:
    """
    Month-over-month trend using exception_aging_snapshots.
    Falls back to live computation for the current month if no snapshots exist.
    Returns list of { period, CURRENT, WARNING, BREACH, CRITICAL } dicts.
    """
    today = date.today()

    # Build list of the last N periods
    periods = []
    for i in range(months - 1, -1, -1):
        d = today.replace(day=1) - timedelta(days=i * 28)
        periods.append(d.strftime("%Y-%m"))

    # Fetch snapshots
    q = db.query(ExceptionAgingSnapshot)
    if profile_id is not None:
        q = q.filter(ExceptionAgingSnapshot.profile_id == profile_id)
    q = q.filter(ExceptionAgingSnapshot.snapshot_period.in_(periods))
    snapshots = q.all()

    # Aggregate
    trend_map: dict[str, dict] = {
        p: {"period": p, BUCKET_CURRENT: 0, BUCKET_WARNING: 0, BUCKET_BREACH: 0, BUCKET_CRITICAL: 0}
        for p in periods
    }
    for snap in snapshots:
        if snap.snapshot_period in trend_map and snap.bucket in BUCKET_ORDER:
            trend_map[snap.snapshot_period][snap.bucket] += 1

    # If current period has no snapshots yet, compute live
    current_period = today.strftime("%Y-%m")
    row = trend_map.get(current_period, {})
    if all(row.get(b, 0) == 0 for b in BUCKET_ORDER):
        live = get_aging_summary(db, profile_id=profile_id)
        for b_data in live["buckets"]:
            row[b_data["bucket"]] = b_data["exception_count"]
        trend_map[current_period] = row

    return list(trend_map.values())


# ── Escalation engine ─────────────────────────────────────────────────────────

def run_escalations(
    db: Session,
    actor_id: Optional[int] = None,
) -> dict:
    """
    Scan all active (non-resolved) exceptions.
    For each one that crosses an escalation threshold and hasn't been
    notified today, fire a UINotification + write an EscalationLog entry
    + update exception.escalated_at + audit log.

    Returns a summary dict of how many escalations were triggered.
    """
    enriched = _enrich_exceptions(db, include_resolved=False)

    triggered = defaultdict(int)

    for exc in enriched:
        age   = exc["age_days"]
        exc_id = exc["id"]

        for min_age, level, role, icon, title in ESCALATION_RULES:
            if age < min_age:
                continue
            if _already_escalated_today(db, exc_id, level):
                continue

            # Determine who to notify
            if role == "reviewer" and exc.get("assigned_reviewer"):
                notify_user_id = exc["assigned_reviewer"]
            elif role == "certifier" and exc.get("assigned_certifier"):
                notify_user_id = exc["assigned_certifier"]
            else:
                # Fall back: notify all users with that role
                role_users = _get_users_by_role(db, role)
                notify_user_id = role_users[0].id if role_users else None

            msg = (
                f"Exception #{exc_id} on profile '{exc.get('profile_name', 'Unknown')}' "
                f"has been open for {age} days. "
                f"Classification: {exc.get('classification') or 'Unclassified'}. "
                f"Immediate action required."
            )

            # Write notification
            _notify(
                db, notify_user_id,
                notification_type = "exception",
                title             = title,
                message           = msg,
                icon_type         = icon,
                action_url        = f"/exceptions/{exc_id}",
            )

            # Write escalation log
            db.add(ExceptionEscalationLog(
                exception_id      = exc_id,
                escalation_level  = level,
                age_days          = age,
                notified_user_id  = notify_user_id,
                notified_role     = role,
                escalated_at      = datetime.utcnow(),
                notification_sent = notify_user_id is not None,
            ))

            # Update exception.escalated_at
            raw_exc = db.query(ExceptionQueueRecord).filter(
                ExceptionQueueRecord.id == exc_id
            ).first()
            if raw_exc and not raw_exc.escalated_at:
                raw_exc.escalated_at = datetime.utcnow()

            # Audit log
            audit_service.log_action(
                db, "EXCEPTION_ESCALATED",
                user_id     = actor_id,
                entity_type = "exception_queue_record",
                entity_id   = exc_id,
                metadata    = {
                    "age_days":         age,
                    "level":            level,
                    "notified_role":    role,
                    "notified_user_id": notify_user_id,
                },
            )

            triggered[level] += 1

        # Risk rescore if BREACH or CRITICAL
        if age >= 61 and exc.get("profile_id"):
            try:
                from ..services.risk_scoring_engine import score_profile
                score_profile(db, exc["profile_id"], persist=True)
            except Exception:
                pass

    db.commit()

    return {
        "BREACH_escalations":   triggered.get("BREACH", 0),
        "CRITICAL_escalations": triggered.get("CRITICAL", 0),
        "SEVERE_escalations":   triggered.get("SEVERE", 0),
        "total":                sum(triggered.values()),
        "run_at":               datetime.utcnow().isoformat(),
    }


# ── Snapshot writer ───────────────────────────────────────────────────────────

def write_monthly_snapshot(
    db: Session,
    actor_id: Optional[int] = None,
) -> dict:
    """
    Write ExceptionAgingSnapshot rows for the current period.
    Called by the scheduler monthly (or on-demand).
    Skips if snapshots for this period already exist.
    """
    period = datetime.utcnow().strftime("%Y-%m")

    # Check if already snapshotted this period
    existing = db.query(ExceptionAgingSnapshot).filter(
        ExceptionAgingSnapshot.snapshot_period == period
    ).first()
    if existing:
        return {"skipped": True, "reason": f"Snapshot for {period} already exists."}

    enriched = _enrich_exceptions(db, include_resolved=False)

    count = 0
    for exc in enriched:
        db.add(ExceptionAgingSnapshot(
            exception_id        = exc["id"],
            profile_id          = exc.get("profile_id"),
            snapshot_period     = period,
            age_days            = exc["age_days"],
            bucket              = exc["bucket"],
            exception_amount    = exc.get("variance_amount"),
            status              = exc.get("status"),
            risk_classification = exc.get("risk_classification"),
            created_at          = datetime.utcnow(),
        ))
        count += 1

    audit_service.log_action(
        db, "AGING_SNAPSHOT_WRITTEN",
        user_id     = actor_id,
        entity_type = "system",
        entity_id   = 0,
        metadata    = {"period": period, "exception_count": count},
    )

    db.commit()
    return {"written": count, "period": period}
