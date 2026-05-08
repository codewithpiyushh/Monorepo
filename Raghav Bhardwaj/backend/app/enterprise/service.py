import json
import logging
import uuid
from pathlib import Path
from datetime import datetime
from rapidfuzz import fuzz
from sqlalchemy.orm import Session
from fastapi import UploadFile

from ..models.models import (
    IngestionBatch,
    ReconciliationAttachment,
    ExceptionQueueRecord,
    ReconciliationRecord,
    MatchGroupItem,
    MatchGroup,
    ValidationErrorRecord,
    ReconciliationProfile,
)
from ..services import audit_service
from . import repository

logger = logging.getLogger(__name__)
EVIDENCE_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "evidence"

STATUS = {
    "NEW": "NEW",
    "TRANSFORMED": "TRANSFORMED",
    "VALIDATED": "VALIDATED",
    "MATCHED": "MATCHED",
    "PARTIAL_MATCH": "PARTIAL_MATCH",
    "UNMATCHED": "UNMATCHED",
    "ASSIGNED": "ASSIGNED",
    "IN_PROGRESS": "IN_PROGRESS",
    "SUBMITTED": "SUBMITTED",
    "UNDER_REVIEW": "UNDER_REVIEW",
    "REJECTED": "REJECTED",
    "APPROVED": "APPROVED",
    "FINALIZED": "FINALIZED",
    "RECONCILED": "RECONCILED",
}


def create_ingestion_batch(db: Session, source_system: str, metadata: dict, records: list[dict], user_id: int | None):
    batch_id = f"BATCH-{uuid.uuid4().hex[:10].upper()}"
    batch = repository.create_batch(db, batch_id, source_system, metadata, user_id)
    repository.add_raw_records(db, batch_id, source_system, records)
    batch.ingestion_status = STATUS["NEW"]
    db.commit()
    audit_service.log_action(db, "INGESTION_CREATED", user_id=user_id, entity_type="batch", entity_id=batch.id, metadata={"batch_id": batch_id})
    return batch


def _normalize_record(record: dict):
    out = {}
    for k, v in record.items():
        nk = str(k).strip().lower()
        if isinstance(v, str):
            nv = v.strip()
            if nv == "":
                nv = None
        else:
            nv = v
        out[nk] = nv

    # common normalization
    if out.get("amount") is not None:
        try:
            out["amount"] = float(str(out["amount"]).replace(",", ""))
        except Exception:
            pass
    if out.get("currency"):
        out["currency"] = str(out["currency"]).upper()
    if out.get("date"):
        out["tx_date"] = str(out["date"])[:10]
    if out.get("debit") is not None and out.get("credit") is not None and out.get("amount") is None:
        try:
            out["amount"] = float(out["debit"] or 0) - float(out["credit"] or 0)
        except Exception:
            pass
    if out.get("amount") is not None:
        out["normalized_sign"] = "NEG" if float(out["amount"]) < 0 else "POS"
    return out


def _validate_record(record: dict, seen: set):
    missing = [f for f in ("entity", "account", "currency", "period", "amount") if record.get(f) in (None, "")]
    if missing:
        return False, {"record": record, "reason": f"Mandatory field(s) missing: {missing}", "stage": "mandatory_field_validation"}
    if not isinstance(record.get("amount"), (int, float)):
        return False, {"record": record, "reason": "Invalid datatype for amount", "stage": "datatype_validation"}
    if record.get("currency") and len(str(record["currency"])) != 3:
        return False, {"record": record, "reason": "Invalid currency code", "stage": "currency_validation"}
    dup_key = (record.get("entity"), record.get("account"), record.get("reference"), record.get("amount"), record.get("period"))
    if dup_key in seen:
        return False, {"record": record, "reason": "Duplicate record", "stage": "duplicate_detection"}
    seen.add(dup_key)
    return True, None


def _parse_iso_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except Exception:
        return None


def transform_batch(db: Session, batch_id: str, user_id: int | None):
    batch = db.query(IngestionBatch).filter(IngestionBatch.batch_id == batch_id).first()
    if not batch:
        raise ValueError("Batch not found")
    raw = repository.get_raw_records(db, batch_id)
    transformed = [_normalize_record(json.loads(r.payload_json)) for r in raw]
    repository.replace_transformed_records(db, batch_id, batch.source_system, transformed)
    batch.ingestion_status = STATUS["TRANSFORMED"]
    db.commit()
    audit_service.log_action(db, "TRANSFORM_COMPLETED", user_id=user_id, entity_type="batch", entity_id=batch.id, metadata={"batch_id": batch_id, "count": len(transformed)})
    return {"batch_id": batch_id, "transformed_count": len(transformed)}


def validate_batch(db: Session, batch_id: str, user_id: int | None):
    batch = db.query(IngestionBatch).filter(IngestionBatch.batch_id == batch_id).first()
    if not batch:
        raise ValueError("Batch not found")
    records = [json.loads(r.payload_json) for r in repository.get_transformed_records(db, batch_id)]
    valid = []
    errors = []
    seen = set()
    db.query(ValidationErrorRecord).filter(ValidationErrorRecord.batch_id == batch_id).delete()
    for r in records:
        is_valid, error = _validate_record(r, seen)
        if is_valid:
            valid.append(r)
        else:
            errors.append(error)

    repository.add_validation_errors(db, batch_id, batch.source_system, errors)
    batch.ingestion_status = STATUS["VALIDATED"] if not errors else STATUS["PARTIAL_MATCH"]
    db.commit()
    audit_service.log_action(db, "VALIDATION_COMPLETED", user_id=user_id, entity_type="batch", entity_id=batch.id, metadata={"valid_count": len(valid), "error_count": len(errors)})
    return {"batch_id": batch_id, "valid_count": len(valid), "error_count": len(errors)}


def load_validated_to_reconciliation(db: Session, batch_id: str, profile_id: int, user_id: int | None):
    batch = db.query(IngestionBatch).filter(IngestionBatch.batch_id == batch_id).first()
    if not batch:
        raise ValueError("Batch not found")
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not profile:
        raise ValueError("Reconciliation profile not found")
    records = [json.loads(r.payload_json) for r in repository.get_transformed_records(db, batch_id)]
    if not records:
        raise ValueError("No transformed records found for batch")
    if db.query(ValidationErrorRecord).filter(ValidationErrorRecord.batch_id == batch_id).count() > 0:
        raise ValueError("Batch contains validation errors. Fix rejected records before loading.")
    if batch.ingestion_status != STATUS["VALIDATED"]:
        raise ValueError("Batch is not fully validated")
    seen = set()
    rows = []
    for r in records:
        is_valid, _ = _validate_record(r, seen)
        if not is_valid:
            continue
        rows.append(
            {
                "batch_id": batch_id,
                "profile_id": profile_id,
                "source_system": batch.source_system,
                "entity": r.get("entity"),
                "account": r.get("account"),
                "period": r.get("period"),
                "currency": r.get("currency"),
                "amount": float(r.get("amount")) if r.get("amount") is not None else None,
                "reference": r.get("reference"),
                "tx_date": r.get("tx_date"),
                "normalized_sign": r.get("normalized_sign"),
                "status": STATUS["VALIDATED"],
                "payload_json": json.dumps(r),
            }
        )
    if not rows:
        raise ValueError("No valid records available to load")
    repository.load_reconciliation_records(db, rows)
    audit_service.log_action(db, "RECON_LOADING_COMPLETED", user_id=user_id, entity_type="batch", entity_id=batch.id, metadata={"loaded_count": len(rows), "profile_id": profile_id})
    return {"loaded_count": len(rows), "profile_id": profile_id}


def run_matching(db: Session, profile_id: int, strategy: str, auto_match_threshold: float, user_id: int | None):
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not profile:
        raise ValueError("Reconciliation profile not found")
    records = repository.get_records_by_profile(db, profile_id)
    matched_groups = 0
    exception_count = 0
    consumed = set()
    for i, r1 in enumerate(records):
        if r1.id in consumed:
            continue
        pair = None
        for r2 in records[i + 1:]:
            if r2.id in consumed:
                continue
            if r1.entity == r2.entity and r1.account == r2.account:
                score = 0.0
                if strategy in {"exact", "rule_based"}:
                    score = 1.0 if (r1.amount == -r2.amount or r1.amount == r2.amount) and r1.reference == r2.reference else 0.0
                elif strategy == "tolerance":
                    delta = abs((r1.amount or 0) - (r2.amount or 0))
                    threshold = abs(float(profile.tolerance_threshold or 0))
                    if threshold <= 0:
                        score = 1.0 if delta == 0 else 0.0
                    elif delta <= threshold:
                        score = max(0.0, 1.0 - (delta / threshold))
                    else:
                        score = 0.0
                elif strategy == "fuzzy":
                    score = fuzz.token_sort_ratio(str(r1.reference or ""), str(r2.reference or "")) / 100.0
                elif strategy == "date_window":
                    d1 = _parse_iso_date(r1.tx_date)
                    d2 = _parse_iso_date(r2.tx_date)
                    if d1 and d2:
                        max_days = max(int(profile.date_window_days or 0), 0)
                        diff_days = abs((d1 - d2).days)
                        score = 1.0 if diff_days <= max_days else 0.0
                if score > 0:
                    pair = (r2, score)
                    break

        if pair:
            r2, score = pair
            consumed.add(r1.id)
            consumed.add(r2.id)
            classification = "FULL_MATCH" if score >= auto_match_threshold else "PARTIAL_MATCH"
            mg = repository.create_match_group(
                db,
                profile_id=profile_id,
                strategy=strategy,
                classification=classification,
                confidence=score,
                variance=abs((r1.amount or 0) - (r2.amount or 0)),
            )
            repository.add_match_items(db, mg.id, [r1.id, r2.id])
            if classification != "FULL_MATCH":
                repository.add_exception(db, mg.id, "exception")
                exception_count += 1
                r1.status = STATUS["PARTIAL_MATCH"]
                r2.status = STATUS["PARTIAL_MATCH"]
            else:
                r1.status = STATUS["RECONCILED"]
                r2.status = STATUS["RECONCILED"]
            matched_groups += 1

    # unmatched
    for r in records:
        if r.id not in consumed:
            mg = repository.create_match_group(db, profile_id, strategy, "UNMATCHED", 0.0, 0.0)
            repository.add_match_items(db, mg.id, [r.id])
            repository.add_exception(db, mg.id, "unresolved")
            r.status = STATUS["UNMATCHED"]
            exception_count += 1

    repository.commit(db)
    audit_service.log_action(db, "MATCHING_COMPLETED", user_id=user_id, entity_type="profile", entity_id=profile_id, metadata={"strategy": strategy, "match_groups": matched_groups, "exceptions": exception_count})
    return {"profile_id": profile_id, "match_groups": matched_groups, "exceptions": exception_count}


def list_exceptions(db: Session, queue_type: str | None = None, role: str | None = None, user_id: int | None = None):
    q = db.query(ExceptionQueueRecord)
    normalized_role = (role or "").lower()

    if queue_type == "actionable_preparer":
        q = q.filter(
            ExceptionQueueRecord.queue_type.in_(["unresolved", "assigned"])
        ).filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )
    elif queue_type == "actionable_reviewer":
        q = q.filter(
            ExceptionQueueRecord.queue_type.in_(["exception", "escalated", "assigned"])
        ).filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )
    elif queue_type:
        q = q.filter(ExceptionQueueRecord.queue_type == queue_type)

    # Role-scoped fallback for generic queue queries.
    if normalized_role == "preparer":
        q = q.filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )
    elif normalized_role == "reviewer":
        q = q.filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )

    return q.order_by(ExceptionQueueRecord.updated_at.desc()).all()


def get_ingestion_summary(db: Session):
    total_batches = db.query(IngestionBatch).count()
    status_counts = {}
    for status_value in STATUS.values():
        count = db.query(IngestionBatch).filter(IngestionBatch.ingestion_status == status_value).count()
        if count:
            status_counts[status_value] = count
    latest_batch = db.query(IngestionBatch).order_by(IngestionBatch.ingestion_timestamp.desc()).first()
    return {
        "total_batches": total_batches,
        "status_counts": status_counts,
        "latest_batch_id": latest_batch.batch_id if latest_batch else None,
        "latest_batch_status": latest_batch.ingestion_status if latest_batch else None,
    }


def assign_exception(db: Session, exception_id: int, assigned_to: int, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    ex.assigned_to = assigned_to
    ex.queue_type = "assigned"
    ex.status = STATUS["ASSIGNED"]
    ex.comments = comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_ASSIGNED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"assigned_to": assigned_to})
    return ex


def submit_exception(db: Session, exception_id: int, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    if not comments or not comments.strip():
        raise ValueError("Submission reason/comments are required")
    record_ids = [
        item.reconciliation_record_id
        for item in db.query(MatchGroupItem).filter(MatchGroupItem.match_group_id == ex.match_group_id).all()
    ]
    if not record_ids:
        raise ValueError("No reconciliation records found for this exception")
    has_evidence = (
        db.query(ReconciliationAttachment.id)
        .filter(ReconciliationAttachment.reconciliation_record_id.in_(record_ids))
        .first()
    )
    if not has_evidence:
        raise ValueError("At least one evidence attachment is required before submit")
    ex.queue_type = "exception"
    ex.status = STATUS["UNDER_REVIEW"]
    ex.comments = comments or ex.comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_SUBMITTED", user_id=actor_id, entity_type="exception", entity_id=ex.id)
    return ex


def review_exception(db: Session, exception_id: int, approved: bool, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    if approved:
        ex.status = STATUS["APPROVED"]
        ex.queue_type = "resolved"
        match_group = db.query(MatchGroup).filter(MatchGroup.id == ex.match_group_id).first()
        if match_group:
            match_group.reconciled = True
            match_group.finalized = True
        items = db.query(MatchGroupItem).filter(MatchGroupItem.match_group_id == ex.match_group_id).all()
        for item in items:
            rec = db.query(ReconciliationRecord).filter(ReconciliationRecord.id == item.reconciliation_record_id).first()
            if rec:
                rec.status = STATUS["FINALIZED"]
    else:
        ex.status = STATUS["REJECTED"]
        ex.queue_type = "assigned"
    ex.comments = comments or ex.comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_APPROVED" if approved else "EXCEPTION_REJECTED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"comments": comments})
    return ex


def finalize_reconciliation_record(db: Session, reconciliation_record_id: int, actor_id: int | None):
    rec = db.query(ReconciliationRecord).filter(ReconciliationRecord.id == reconciliation_record_id).first()
    if not rec:
        raise ValueError("Reconciliation record not found")
    rec.status = STATUS["FINALIZED"]
    db.commit()
    audit_service.log_action(db, "RECON_FINALIZED", user_id=actor_id, entity_type="reconciliation_record", entity_id=rec.id)
    return rec


def upload_attachment(
    db: Session,
    reconciliation_record_id: int,
    document_type: str,
    document_name: str,
    document_path: str | None,
    user_id: int | None,
    file: UploadFile | None = None,
):
    rec = db.query(ReconciliationRecord).filter(ReconciliationRecord.id == reconciliation_record_id).first()
    if not rec:
        raise ValueError("Reconciliation record not found")
    if rec.status in {STATUS["FINALIZED"], STATUS["RECONCILED"]}:
        raise ValueError("Attachments are immutable after finalization")
    final_document_path = document_path
    final_document_name = document_name
    if file is not None:
        EVIDENCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = file.filename or document_name or "evidence_file"
        unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}_{safe_name}"
        destination = EVIDENCE_UPLOAD_DIR / unique_name
        with destination.open("wb") as f:
            f.write(file.file.read())
        final_document_path = str(destination)
        final_document_name = safe_name

    att = ReconciliationAttachment(
        reconciliation_record_id=reconciliation_record_id,
        uploaded_by=user_id,
        document_type=document_type,
        document_name=final_document_name,
        document_path=final_document_path,
        document_status="ACTIVE",
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    audit_service.log_action(db, "ATTACHMENT_UPLOADED", user_id=user_id, entity_type="attachment", entity_id=att.id, metadata={"reconciliation_record_id": reconciliation_record_id, "document_type": document_type})
    return att
