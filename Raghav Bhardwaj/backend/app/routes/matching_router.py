"""
backend/app/routes/matching_router.py
Full Transaction Matching API — Phase 3

New endpoints that complete the matching workflow:

  GET  /api/v1/matching/profile/{profile_id}/records   All raw records, split by side
  GET  /api/v1/matching/profile/{profile_id}/groups    Match groups with full record detail
  GET  /api/v1/matching/group/{id}                     Single group full detail
  POST /api/v1/matching/manual                         Create manual match from selected IDs
  POST /api/v1/matching/group/{id}/confirm             Approve a match
  POST /api/v1/matching/group/{id}/reject              Reject / unmatch
  POST /api/v1/matching/group/{id}/notes               Add/update notes
  POST /api/v1/matching/group/{id}/assign              Assign exception to user
  POST /api/v1/matching/bulk-confirm                   Bulk confirm multiple groups
  GET  /api/v1/matching/profile/{id}/summary           Match summary statistics
  GET  /api/v1/matching/profile/{id}/audit             Match audit trail
"""
import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import get_db
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..rbac.dependencies import role_required

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/matching", tags=["matching-full"])

_ALL     = [ADMIN, PREPARER, APPROVER, CERTIFIER]
_ACTIONERS = [ADMIN, PREPARER, APPROVER]


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class ManualMatchRequest(BaseModel):
    profile_id:  int
    source_ids:  List[int]   # GL-side record IDs
    target_ids:  List[int]   # Bank-side record IDs
    notes:       Optional[str] = None

class RejectRequest(BaseModel):
    reason: Optional[str] = None

class NoteRequest(BaseModel):
    notes: str

class AssignRequest(BaseModel):
    user_id: int

class BulkConfirmRequest(BaseModel):
    group_ids: List[int]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _record_row(row) -> dict:
    payload = {}
    if row.payload_json:
        try:
            payload = json.loads(row.payload_json)
        except Exception:
            pass
    return {
        "id":            row.id,
        "source_system": row.source_system,
        "entity":        row.entity,
        "account":       row.account,
        "period":        row.period,
        "currency":      row.currency,
        "amount":        float(row.amount or 0),
        "reference":     row.reference,
        "tx_date":       row.tx_date,
        "status":        row.status,
        "description":   payload.get("description") or payload.get("desc") or "",
        "counterparty":  payload.get("counterparty") or payload.get("vendor") or "",
        "batch_id":      row.batch_id,
    }


def _is_source_side(source_system: str) -> bool:
    ss = (source_system or "").upper()
    return "GL" in ss or "ERP" in ss or "SOURCE" in ss or "SAP" in ss or "ORACLE" in ss


def _group_detail(db: Session, mg_id: int) -> dict:
    """Return full match group detail with all linked records and exception."""
    from ..models.models import MatchGroup as MG, MatchGroupItem as MGI, ReconciliationRecord as RR, ExceptionQueueRecord as EQR, User

    mg = db.query(MG).filter(MG.id == mg_id).first()
    if not mg:
        return None

    items = db.query(MGI).filter(MGI.match_group_id == mg_id).all()
    records = []
    for item in items:
        rec = db.query(RR).filter(RR.id == item.reconciliation_record_id).first()
        if rec:
            d = _record_row(rec)
            d["side"] = item.side or ("SOURCE" if _is_source_side(rec.source_system) else "TARGET")
            records.append(d)

    exc = db.query(EQR).filter(EQR.match_group_id == mg_id).first()

    # Resolve confirmer/rejecter names
    confirmed_by_name = None
    rejected_by_name  = None
    manual_by_name    = None
    try:
        if getattr(mg, "confirmed_by", None):
            u = db.query(User).filter(User.id == mg.confirmed_by).first()
            confirmed_by_name = u.email if u else None
        if getattr(mg, "rejected_by", None):
            u = db.query(User).filter(User.id == mg.rejected_by).first()
            rejected_by_name = u.email if u else None
        if getattr(mg, "manual_by", None):
            u = db.query(User).filter(User.id == mg.manual_by).first()
            manual_by_name = u.email if u else None
    except Exception:
        pass

    source_records = [r for r in records if r["side"] == "SOURCE"]
    target_records = [r for r in records if r["side"] == "TARGET"]

    source_total = sum(r["amount"] for r in source_records)
    target_total = sum(r["amount"] for r in target_records)

    return {
        "id":             mg.id,
        "profile_id":     mg.profile_id,
        "strategy":       mg.strategy,
        "classification": mg.classification,
        "confidence":     float(mg.confidence or 0),
        "variance_amount": float(mg.variance_amount or 0),
        "reconciled":     mg.reconciled,
        "finalized":      mg.finalized,
        "review_status":  getattr(mg, "review_status", "PENDING") or "PENDING",
        "notes":          getattr(mg, "notes", None),
        "is_manual":      bool(getattr(mg, "is_manual", False)),
        "confirmed_by":   getattr(mg, "confirmed_by", None),
        "confirmed_by_name": confirmed_by_name,
        "confirmed_at":   mg.confirmed_at.isoformat() if getattr(mg, "confirmed_at", None) else None,
        "rejected_by":    getattr(mg, "rejected_by", None),
        "rejected_by_name": rejected_by_name,
        "rejected_at":    mg.rejected_at.isoformat() if getattr(mg, "rejected_at", None) else None,
        "rejected_reason": getattr(mg, "rejected_reason", None),
        "manual_by":      getattr(mg, "manual_by", None),
        "manual_by_name": manual_by_name,
        "created_at":     mg.created_at.isoformat() if mg.created_at else None,
        "records":        records,
        "source_records": source_records,
        "target_records": target_records,
        "source_total":   source_total,
        "target_total":   target_total,
        "net_variance":   round(source_total - target_total, 4),
        "item_count":     len(records),
        "exception": {
            "id":              exc.id,
            "status":          exc.status,
            "queue_type":      exc.queue_type,
            "assigned_to":     exc.assigned_to,
            "comments":        exc.comments,
            "classification":  exc.classification,
            "resolution_notes": exc.resolution_notes,
        } if exc else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /profile/{id}/records — raw records split by side
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/profile/{profile_id}/records")
def get_profile_records(
    profile_id: int,
    status_filter: Optional[str] = Query(None, description="UNMATCHED|RECONCILED|PARTIAL_MATCH|all"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    """
    Return all reconciliation records for a profile, split into source_side and target_side arrays.
    Optionally filter by status (default: all).
    """
    from ..models.models import ReconciliationRecord as RR

    q = db.query(RR).filter(RR.profile_id == profile_id)
    if status_filter and status_filter.upper() != "ALL":
        q = q.filter(RR.status == status_filter.upper())
    records = q.order_by(RR.id.desc()).limit(limit).all()

    source_side = []
    target_side = []
    for rec in records:
        d = _record_row(rec)
        if _is_source_side(rec.source_system):
            source_side.append(d)
        else:
            target_side.append(d)

    return {
        "profile_id":   profile_id,
        "source_count": len(source_side),
        "target_count": len(target_side),
        "source_side":  source_side,
        "target_side":  target_side,
        "total":        len(records),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /profile/{id}/groups — match groups with full detail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/profile/{profile_id}/groups")
def get_profile_groups(
    profile_id:     int,
    classification: Optional[str] = Query(None),
    review_status:  Optional[str] = Query(None),
    limit:          int = Query(200, ge=1, le=1000),
    offset:         int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    """Return match groups with embedded records for a profile."""
    from ..models.models import MatchGroup as MG

    q = db.query(MG).filter(MG.profile_id == profile_id)
    if classification:
        q = q.filter(MG.classification == classification.upper())
    if review_status:
        q = q.filter(text(f"review_status = :rs")).params(rs=review_status.upper())

    total = q.count()
    mgs = q.order_by(MG.id.desc()).offset(offset).limit(limit).all()

    result = []
    for mg in mgs:
        d = _group_detail(db, mg.id)
        if d:
            result.append(d)

    return {"groups": result, "total": total, "profile_id": profile_id}


# ─────────────────────────────────────────────────────────────────────────────
# GET /group/{id} — single group full detail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/group/{group_id}")
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    detail = _group_detail(db, group_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Match group {group_id} not found")
    return detail


# ─────────────────────────────────────────────────────────────────────────────
# POST /manual — create manual match
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/manual")
def create_manual_match(
    payload: ManualMatchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ACTIONERS)),
):
    """
    Manually match selected source and target records.
    Creates a new MatchGroup with strategy='manual', review_status='CONFIRMED'.
    """
    from ..models.models import MatchGroup as MG, MatchGroupItem as MGI, ReconciliationRecord as RR

    if not payload.source_ids and not payload.target_ids:
        raise HTTPException(status_code=400, detail="Must provide at least one source or target record ID")

    all_ids = list(set(payload.source_ids + payload.target_ids))

    # Validate all records belong to profile
    records = db.query(RR).filter(
        RR.id.in_(all_ids),
        RR.profile_id == payload.profile_id,
    ).all()
    if len(records) != len(all_ids):
        raise HTTPException(status_code=400, detail="Some record IDs don't belong to this profile or don't exist")

    # Calculate variance
    src_total = sum(float(r.amount or 0) for r in records if r.id in payload.source_ids)
    tgt_total = sum(float(r.amount or 0) for r in records if r.id in payload.target_ids)
    variance  = round(src_total - tgt_total, 4)

    # Create match group
    mg = MG(
        profile_id      = payload.profile_id,
        strategy        = "manual",
        classification  = "FULL_MATCH" if abs(variance) < 0.01 else "PARTIAL_MATCH",
        confidence      = 1.0 if abs(variance) < 0.01 else 0.8,
        variance_amount = abs(variance),
        reconciled      = True,
        finalized       = False,
    )
    # Set workflow columns safely
    now = datetime.utcnow()
    try:
        mg.review_status  = "CONFIRMED"
        mg.notes          = payload.notes
        mg.confirmed_by   = current_user.id
        mg.confirmed_at   = now
        mg.is_manual      = True
        mg.manual_by      = current_user.id
    except Exception:
        pass

    db.add(mg)
    db.flush()

    # Add items with side
    for rid in payload.source_ids:
        db.add(MGI(match_group_id=mg.id, reconciliation_record_id=rid, side="SOURCE"))
        db.query(RR).filter(RR.id == rid).update({"status": "RECONCILED"})

    for rid in payload.target_ids:
        db.add(MGI(match_group_id=mg.id, reconciliation_record_id=rid, side="TARGET"))
        db.query(RR).filter(RR.id == rid).update({"status": "RECONCILED"})

    db.commit()
    db.refresh(mg)

    # Audit
    try:
        from ..services import audit_service
        audit_service.log_action(
            db, "MANUAL_MATCH_CREATED",
            user_id=current_user.id,
            entity_type="match_group",
            entity_id=mg.id,
            metadata={
                "profile_id":  payload.profile_id,
                "source_ids":  payload.source_ids,
                "target_ids":  payload.target_ids,
                "variance":    variance,
            },
        )
    except Exception:
        pass

    return _group_detail(db, mg.id)


# ─────────────────────────────────────────────────────────────────────────────
# POST /group/{id}/confirm — confirm/approve a match
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/group/{group_id}/confirm")
def confirm_match(
    group_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ACTIONERS)),
):
    from ..models.models import MatchGroup as MG, ReconciliationRecord as RR, MatchGroupItem as MGI

    mg = db.query(MG).filter(MG.id == group_id).first()
    if not mg:
        raise HTTPException(status_code=404, detail="Match group not found")

    now = datetime.utcnow()
    update_data = {
        "reconciled": True,
    }
    try:
        update_data["review_status"] = "CONFIRMED"
        update_data["confirmed_by"]  = current_user.id
        update_data["confirmed_at"]  = now
    except Exception:
        pass

    db.query(MG).filter(MG.id == group_id).update(update_data)

    # Mark all records as RECONCILED
    items = db.query(MGI).filter(MGI.match_group_id == group_id).all()
    for item in items:
        db.query(RR).filter(RR.id == item.reconciliation_record_id).update({"status": "RECONCILED"})

    db.commit()

    try:
        from ..services import audit_service
        audit_service.log_action(db, "MATCH_CONFIRMED", user_id=current_user.id,
                                  entity_type="match_group", entity_id=group_id, metadata={})
    except Exception:
        pass

    return {"success": True, "group_id": group_id, "review_status": "CONFIRMED"}


# ─────────────────────────────────────────────────────────────────────────────
# POST /group/{id}/reject — reject / break a match
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/group/{group_id}/reject")
def reject_match(
    group_id: int,
    payload:  RejectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ACTIONERS)),
):
    from ..models.models import MatchGroup as MG, ReconciliationRecord as RR, MatchGroupItem as MGI

    mg = db.query(MG).filter(MG.id == group_id).first()
    if not mg:
        raise HTTPException(status_code=404, detail="Match group not found")

    now = datetime.utcnow()
    update_data = {"reconciled": False, "classification": "UNMATCHED"}
    try:
        update_data["review_status"]  = "REJECTED"
        update_data["rejected_by"]    = current_user.id
        update_data["rejected_at"]    = now
        update_data["rejected_reason"] = payload.reason
    except Exception:
        pass

    db.query(MG).filter(MG.id == group_id).update(update_data)

    # Return records to UNMATCHED
    items = db.query(MGI).filter(MGI.match_group_id == group_id).all()
    for item in items:
        db.query(RR).filter(RR.id == item.reconciliation_record_id).update({"status": "UNMATCHED"})

    db.commit()

    try:
        from ..services import audit_service
        audit_service.log_action(db, "MATCH_REJECTED", user_id=current_user.id,
                                  entity_type="match_group", entity_id=group_id,
                                  metadata={"reason": payload.reason})
    except Exception:
        pass

    return {"success": True, "group_id": group_id, "review_status": "REJECTED"}


# ─────────────────────────────────────────────────────────────────────────────
# POST /group/{id}/notes — add/update match notes
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/group/{group_id}/notes")
def update_notes(
    group_id: int,
    payload:  NoteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    from ..models.models import MatchGroup as MG

    mg = db.query(MG).filter(MG.id == group_id).first()
    if not mg:
        raise HTTPException(status_code=404, detail="Match group not found")

    try:
        db.query(MG).filter(MG.id == group_id).update({"notes": payload.notes})
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "group_id": group_id}


# ─────────────────────────────────────────────────────────────────────────────
# POST /group/{id}/assign — assign exception to a user
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/group/{group_id}/assign")
def assign_exception(
    group_id: int,
    payload:  AssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ACTIONERS)),
):
    from ..models.models import ExceptionQueueRecord as EQR

    exc = db.query(EQR).filter(EQR.match_group_id == group_id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="No exception for this match group")

    db.query(EQR).filter(EQR.match_group_id == group_id).update({
        "assigned_to": payload.user_id,
        "status":      "IN_PROGRESS",
    })
    db.commit()
    return {"success": True, "assigned_to": payload.user_id}


# ─────────────────────────────────────────────────────────────────────────────
# POST /bulk-confirm — bulk confirm match groups
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/bulk-confirm")
def bulk_confirm(
    payload:  BulkConfirmRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ACTIONERS)),
):
    from ..models.models import MatchGroup as MG, ReconciliationRecord as RR, MatchGroupItem as MGI

    if not payload.group_ids:
        raise HTTPException(status_code=400, detail="No group IDs provided")

    now = datetime.utcnow()
    confirmed = 0

    for gid in payload.group_ids:
        mg = db.query(MG).filter(MG.id == gid).first()
        if not mg:
            continue

        update_data = {"reconciled": True}
        try:
            update_data["review_status"] = "CONFIRMED"
            update_data["confirmed_by"]  = current_user.id
            update_data["confirmed_at"]  = now
        except Exception:
            pass

        db.query(MG).filter(MG.id == gid).update(update_data)

        items = db.query(MGI).filter(MGI.match_group_id == gid).all()
        for item in items:
            db.query(RR).filter(RR.id == item.reconciliation_record_id).update({"status": "RECONCILED"})
        confirmed += 1

    db.commit()

    try:
        from ..services import audit_service
        audit_service.log_action(db, "BULK_MATCH_CONFIRMED", user_id=current_user.id,
                                  entity_type="profile", entity_id=None,
                                  metadata={"group_ids": payload.group_ids, "confirmed": confirmed})
    except Exception:
        pass

    return {"success": True, "confirmed": confirmed, "total_requested": len(payload.group_ids)}


# ─────────────────────────────────────────────────────────────────────────────
# GET /profile/{id}/summary — match statistics for dashboard
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/profile/{profile_id}/summary")
def profile_summary(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    from ..models.models import MatchGroup as MG, ReconciliationRecord as RR

    total_records  = db.query(RR).filter(RR.profile_id == profile_id).count()
    reconciled     = db.query(RR).filter(RR.profile_id == profile_id, RR.status == "RECONCILED").count()
    partial        = db.query(RR).filter(RR.profile_id == profile_id, RR.status == "PARTIAL_MATCH").count()
    unmatched      = db.query(RR).filter(RR.profile_id == profile_id, RR.status.in_(["UNMATCHED", "VALIDATED"])).count()

    total_groups   = db.query(MG).filter(MG.profile_id == profile_id).count()
    full_match     = db.query(MG).filter(MG.profile_id == profile_id, MG.classification == "FULL_MATCH").count()
    partial_match  = db.query(MG).filter(MG.profile_id == profile_id, MG.classification == "PARTIAL_MATCH").count()
    unmatched_grp  = db.query(MG).filter(MG.profile_id == profile_id, MG.classification == "UNMATCHED").count()
    variance_flagged = db.query(MG).filter(MG.profile_id == profile_id, MG.classification == "VARIANCE_FLAGGED").count()

    # Review workflow stats
    confirmed_row = db.execute(
        text("SELECT COUNT(*) FROM match_groups WHERE profile_id = :pid AND review_status = 'CONFIRMED'"),
        {"pid": profile_id}
    ).scalar()
    rejected_row = db.execute(
        text("SELECT COUNT(*) FROM match_groups WHERE profile_id = :pid AND review_status = 'REJECTED'"),
        {"pid": profile_id}
    ).scalar()
    pending_row = db.execute(
        text("SELECT COUNT(*) FROM match_groups WHERE profile_id = :pid AND (review_status IS NULL OR review_status = 'PENDING')"),
        {"pid": profile_id}
    ).scalar()
    manual_row = db.execute(
        text("SELECT COUNT(*) FROM match_groups WHERE profile_id = :pid AND is_manual = 1"),
        {"pid": profile_id}
    ).scalar()

    match_rate = round(reconciled / total_records * 100, 1) if total_records else 0.0
    auto_rate  = round(full_match / total_groups * 100, 1) if total_groups else 0.0

    # Total variance exposure
    var_row = db.execute(
        text("SELECT COALESCE(SUM(ABS(variance_amount)), 0) FROM match_groups WHERE profile_id = :pid"),
        {"pid": profile_id}
    ).scalar()

    return {
        "profile_id":       profile_id,
        "records": {
            "total":        total_records,
            "reconciled":   reconciled,
            "partial":      partial,
            "unmatched":    unmatched,
            "match_rate":   match_rate,
        },
        "groups": {
            "total":         total_groups,
            "full_match":    full_match,
            "partial_match": partial_match,
            "unmatched":     unmatched_grp,
            "variance_flagged": variance_flagged,
            "auto_rate":     auto_rate,
        },
        "workflow": {
            "confirmed":  int(confirmed_row or 0),
            "rejected":   int(rejected_row or 0),
            "pending":    int(pending_row or 0),
            "manual":     int(manual_row or 0),
        },
        "total_variance_exposure": float(var_row or 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /profile/{id}/audit — match audit trail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/profile/{profile_id}/audit")
def matching_audit_trail(
    profile_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    """Audit trail: confirm/reject/manual events for this profile's match groups."""
    from ..models.models import MatchGroup as MG

    rows = db.execute(
        text("""
            SELECT mg.id, mg.strategy, mg.classification, mg.review_status,
                   mg.is_manual, mg.confirmed_by, mg.confirmed_at,
                   mg.rejected_by, mg.rejected_at, mg.rejected_reason,
                   mg.notes, mg.variance_amount, mg.confidence,
                   u1.email AS confirmed_by_email,
                   u2.email AS rejected_by_email,
                   mg.created_at
            FROM match_groups mg
            LEFT JOIN users u1 ON u1.id = mg.confirmed_by
            LEFT JOIN users u2 ON u2.id = mg.rejected_by
            WHERE mg.profile_id = :pid
              AND (mg.review_status IN ('CONFIRMED','REJECTED') OR mg.is_manual = 1)
            ORDER BY GREATEST(
                COALESCE(mg.confirmed_at, '1970-01-01'),
                COALESCE(mg.rejected_at, '1970-01-01'),
                mg.created_at
            ) DESC
            LIMIT :lim
        """),
        {"pid": profile_id, "lim": limit},
    ).fetchall()

    return [
        {
            "group_id":       r.id,
            "strategy":       r.strategy,
            "classification": r.classification,
            "review_status":  r.review_status,
            "is_manual":      bool(r.is_manual),
            "confidence":     float(r.confidence or 0),
            "variance":       float(r.variance_amount or 0),
            "notes":          r.notes,
            "confirmed_by":   r.confirmed_by_email,
            "confirmed_at":   r.confirmed_at.isoformat() if r.confirmed_at else None,
            "rejected_by":    r.rejected_by_email,
            "rejected_at":    r.rejected_at.isoformat() if r.rejected_at else None,
            "rejected_reason": r.rejected_reason,
            "created_at":     r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────────────────
# GET /profile/{id}/unmatched-records — records not in any CONFIRMED group
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/profile/{profile_id}/unmatched-records")
def get_unmatched_records(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL)),
):
    """Return records that have no confirmed match — available for manual matching."""
    from ..models.models import ReconciliationRecord as RR

    records = db.query(RR).filter(
        RR.profile_id == profile_id,
        RR.status.in_(["UNMATCHED", "VALIDATED", "PARTIAL_MATCH"]),
    ).order_by(RR.id.desc()).limit(1000).all()

    source = []
    target = []
    for rec in records:
        d = _record_row(rec)
        if _is_source_side(rec.source_system):
            source.append(d)
        else:
            target.append(d)

    return {
        "profile_id":   profile_id,
        "source_side":  source,
        "target_side":  target,
        "source_count": len(source),
        "target_count": len(target),
    }
