import json
import logging
import uuid
import io
import asyncio
import csv
import hashlib
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, date
from sqlalchemy import create_engine, text
from rapidfuzz import fuzz
from sqlalchemy.orm import Session
from fastapi import UploadFile
import pandas as pd
import httpx

from ..models.models import (
    IngestionBatch,
    ReconciliationAttachment,
    ExceptionQueueRecord,
    ReconciliationRecord,
    MatchGroupItem,
    MatchGroup,
    ValidationErrorRecord,
    ReconciliationProfile,
    FinancialCloseCalendar,
    CertificationWorkflow,
    CertificationWorkflowHistory,
    ValidationRuleResult,
    ExceptionComment,
    EvidenceVersionHistory,
    AuditPackage,
    ReconciliationSnapshot,
    Execution,
    MatchGroup,
    MatchGroupItem,
    ExchangeRate,
    JournalAdjustment,
    JournalAdjustmentHistory,
    ReconciliationComment,
    ScheduledReport,
    ScheduledReportRun,
)
from ..services import audit_service, notification_service, dataset_service
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
    "OPEN": "OPEN",
    "PREPARED": "PREPARED",
    "SUBMITTED": "SUBMITTED",
    "REVIEWED": "REVIEWED",
    "CERTIFIED": "CERTIFIED",
    "CLOSED": "CLOSED",
    "REOPENED": "REOPENED",
    "FORCE_CLOSED": "FORCE_CLOSED",
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
    tolerance = abs(float(profile.tolerance_threshold or 0))
    date_window_days = max(int(profile.date_window_days or 0), 0)

    def evaluate_score(group_a: list, group_b: list):
        amount_a = sum((r.amount or 0) for r in group_a)
        amount_b = sum((r.amount or 0) for r in group_b)
        abs_delta = abs(amount_a + amount_b) if strategy != "tolerance" else abs(amount_a - amount_b)
        ref_a = " ".join(str(r.reference or "") for r in group_a)
        ref_b = " ".join(str(r.reference or "") for r in group_b)
        score = 0.0
        if strategy in {"exact", "rule_based", "one_to_one", "one_to_many", "many_to_many"}:
            score = 1.0 if abs_delta == 0 else 0.0
            if score > 0 and ref_a and ref_b:
                score = max(score, fuzz.token_sort_ratio(ref_a, ref_b) / 100.0)
        elif strategy == "tolerance":
            if tolerance <= 0:
                score = 1.0 if abs_delta == 0 else 0.0
            elif abs_delta <= tolerance:
                score = max(0.0, 1.0 - (abs_delta / tolerance))
        elif strategy in {"fuzzy", "fuzzy_text"}:
            score = fuzz.token_sort_ratio(ref_a, ref_b) / 100.0
        elif strategy in {"date_window", "date_tolerance"}:
            dates_a = [_parse_iso_date(r.tx_date) for r in group_a]
            dates_b = [_parse_iso_date(r.tx_date) for r in group_b]
            dates_a = [d for d in dates_a if d]
            dates_b = [d for d in dates_b if d]
            if dates_a and dates_b:
                diff = abs((min(dates_a) - max(dates_b)).days)
                score = 1.0 if diff <= date_window_days else 0.0
        return score, abs_delta

    def create_group_match(group_a: list, group_b: list):
        nonlocal matched_groups, exception_count
        score, variance = evaluate_score(group_a, group_b)
        if score <= 0:
            return False
        all_ids = [r.id for r in group_a + group_b]
        classification = "FULL_MATCH" if score >= auto_match_threshold else "PARTIAL_MATCH"
        mg = repository.create_match_group(
            db,
            profile_id=profile_id,
            strategy=strategy,
            classification=classification,
            confidence=score,
            variance=variance,
        )
        repository.add_match_items(db, mg.id, all_ids)
        for rec in group_a + group_b:
            consumed.add(rec.id)
            rec.status = STATUS["RECONCILED"] if classification == "FULL_MATCH" else STATUS["PARTIAL_MATCH"]
        if classification != "FULL_MATCH":
            repository.add_exception(db, mg.id, "exception")
            exception_count += 1
        matched_groups += 1
        return True

    grouped = {}
    for rec in records:
        key = (rec.entity, rec.account)
        grouped.setdefault(key, []).append(rec)

    for _, group_records in grouped.items():
        pending = [r for r in group_records if r.id not in consumed]
        # 1:1 pass
        for i, r1 in enumerate(pending):
            if r1.id in consumed:
                continue
            for r2 in pending[i + 1:]:
                if r2.id in consumed:
                    continue
                if create_group_match([r1], [r2]):
                    break
        # 1:many pass
        pending = [r for r in group_records if r.id not in consumed]
        for r1 in pending:
            if r1.id in consumed:
                continue
            candidates = [r for r in pending if r.id != r1.id and r.id not in consumed]
            for r2 in candidates:
                if create_group_match([r1], [r2]):
                    break
            if r1.id in consumed:
                continue
            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    if create_group_match([r1], [candidates[i], candidates[j]]):
                        break
                if r1.id in consumed:
                    break
        # many:many pass (2x2 bounded)
        pending = [r for r in group_records if r.id not in consumed]
        for i in range(len(pending)):
            if pending[i].id in consumed:
                continue
            for j in range(i + 1, len(pending)):
                if pending[j].id in consumed:
                    continue
                for k in range(j + 1, len(pending)):
                    if pending[k].id in consumed:
                        continue
                    create_group_match([pending[i], pending[j]], [pending[k]])

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


def _parse_date_safe(raw: str | None):
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except Exception:
        return None


def _aging_bucket(days_overdue: int):
    if days_overdue <= 0:
        return "CURRENT"
    if days_overdue <= 7:
        return "1-7"
    if days_overdue <= 15:
        return "8-15"
    if days_overdue <= 30:
        return "16-30"
    return "31+"


def get_dashboard_metrics(db: Session, role: str, user_id: int | None):
    profiles = repository.list_profiles(db)
    workflows = repository.list_certification_workflows(db)
    exceptions = list_exceptions(db, None, role, user_id)
    calendars = repository.list_close_calendars(db)
    today = date.today()

    total_profiles = len(profiles)
    completed_profiles = len([p for p in profiles if (p.lifecycle_state or "").upper() in {"CLOSED", "CERTIFIED", "FORCE_CLOSED"}])
    completion_pct = round((completed_profiles / total_profiles) * 100, 2) if total_profiles else 0.0

    auto_matched = db.query(MatchGroup).filter(MatchGroup.classification == "FULL_MATCH").count()
    total_groups = db.query(MatchGroup).count()
    auto_match_pct = round((auto_matched / total_groups) * 100, 2) if total_groups else 0.0

    overdue = 0
    aging = {"CURRENT": 0, "1-7": 0, "8-15": 0, "16-30": 0, "31+": 0}
    for c in calendars:
        due = _parse_date_safe(c.due_date)
        if not due:
            continue
        days = (today - due).days
        bucket = _aging_bucket(days)
        aging[bucket] = aging.get(bucket, 0) + 1
        if days > 0 and not c.is_locked:
            overdue += 1

    high_risk = len([p for p in profiles if (p.risk_classification or "").upper() == "HIGH"])
    pending_approvals = len([w for w in workflows if (w.status or "").upper() in {"SUBMITTED", "REVIEWED", "APPROVED"}])
    rejected_items = len([e for e in exceptions if (e.status or "").upper() == "REJECTED"])
    pending_submissions = len([e for e in exceptions if (e.status or "").upper() in {"ASSIGNED", "IN_PROGRESS"}])

    escalation_alerts = len([e for e in exceptions if (e.queue_type or "").lower() == "escalated"])
    exception_trend = {
        "open": len([e for e in exceptions if (e.status or "").upper() in {"OPEN", "ASSIGNED", "UNDER_REVIEW"}]),
        "approved": len([e for e in exceptions if (e.status or "").upper() == "APPROVED"]),
        "rejected": rejected_items,
    }

    return {
        "completion_pct": completion_pct,
        "aging_summary": aging,
        "overdue_reconciliations": overdue,
        "high_risk_accounts": high_risk,
        "pending_approvals": pending_approvals,
        "auto_match_pct": auto_match_pct,
        "exception_trends": exception_trend,
        "assigned_tasks": len([e for e in exceptions if e.assigned_to == user_id]),
        "pending_submissions": pending_submissions,
        "rejected_items": rejected_items,
        "escalation_alerts": escalation_alerts,
    }


def build_reconciliation_templates():
    return [
        {"template_type": "BANK", "name": "Bank Statement vs GL", "conditions": {"keys": ["account", "reference"], "amount_mode": "opposite_sign"}, "thresholds": {"tolerance": 0, "date_window_days": 2}},
        {"template_type": "PAYROLL", "name": "Payroll Register vs Cash", "conditions": {"keys": ["entity", "period"], "aggregation": "many_to_many"}, "thresholds": {"tolerance": 5}},
        {"template_type": "VENDOR", "name": "Vendor Ledger vs AP", "conditions": {"keys": ["vendor", "invoice_no"], "fuzzy_fields": ["invoice_desc"]}, "thresholds": {"fuzzy_score": 0.85}},
        {"template_type": "INTERCOMPANY", "name": "Intercompany Mirror Match", "conditions": {"keys": ["counterparty", "reference"], "amount_mode": "opposite_sign"}, "thresholds": {"tolerance": 10}},
        {"template_type": "SUSPENSE", "name": "Suspense Clearance", "conditions": {"keys": ["account"], "aggregation": "one_to_many"}, "thresholds": {"age_days": 30}},
        {"template_type": "CLEARING", "name": "Clearing Account Net-off", "conditions": {"keys": ["account", "period"], "aggregation": "many_to_many"}, "thresholds": {"tolerance": 1}},
        {"template_type": "ACCRUAL", "name": "Accrual Reverse & Settle", "conditions": {"keys": ["account", "period"], "date_logic": "date_window"}, "thresholds": {"date_window_days": 31, "tolerance": 20}},
    ]


def create_rule_definition(db: Session, payload: dict, actor_id: int | None):
    row = repository.create_rule_definition(
        db,
        {
            "name": payload["name"],
            "template_type": payload["template_type"].upper(),
            "profile_id": payload.get("profile_id"),
            "is_reusable": payload.get("is_reusable", True),
            "conditions_json": json.dumps(payload.get("conditions") or {}),
            "filters_json": json.dumps(payload.get("filters") or {}),
            "thresholds_json": json.dumps(payload.get("thresholds") or {}),
            "created_by": actor_id,
        },
    )
    return row


def update_rule_definition(db: Session, rule_id: int, payload: dict):
    row = repository.get_rule_definition(db, rule_id)
    if not row:
        raise ValueError("Rule definition not found")
    normalized = {}
    for key, value in payload.items():
        if key == "conditions":
            normalized["conditions_json"] = json.dumps(value or {})
        elif key == "filters":
            normalized["filters_json"] = json.dumps(value or {})
        elif key == "thresholds":
            normalized["thresholds_json"] = json.dumps(value or {})
        elif key == "template_type":
            normalized[key] = str(value).upper()
        else:
            normalized[key] = value
    return repository.update_rule_definition(db, row, normalized)


def delete_rule_definition(db: Session, rule_id: int):
    row = repository.get_rule_definition(db, rule_id)
    if not row:
        raise ValueError("Rule definition not found")
    repository.delete_rule_definition(db, row)
    return {"deleted": True}


def list_rule_definitions(db: Session, profile_id: int | None, template_type: str | None):
    return repository.list_rule_definitions(db, profile_id=profile_id, template_type=template_type.upper() if template_type else None)


def generate_aging_and_reminders(db: Session):
    today = date.today()
    workflows = repository.list_certification_workflows(db)
    created = []
    for wf in workflows:
        due = _parse_date_safe(wf.due_date)
        if not due:
            continue
        days_overdue = (today - due).days
        if days_overdue > 0 and (wf.status or "").upper() not in {"CLOSED", "CERTIFIED", "FORCE_CLOSED"}:
            severity = "HIGH" if days_overdue > 30 else "MEDIUM" if days_overdue > 7 else "LOW"
            message = f"Workflow {wf.id} is overdue by {days_overdue} day(s)."
            created.append(
                repository.create_reminder_log(
                    db,
                    {
                        "workflow_id": wf.id,
                        "reminder_type": "OVERDUE",
                        "severity": severity,
                        "message": message,
                        "sent_to_role": wf.current_stage,
                    },
                )
            )
    return {"generated": len(created)}


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
    notification_service.send_email(
        db,
        event_type="APPROVAL" if approved else "REJECT",
        workflow_id=None,
        recipient_email=None,
        subject=f"Exception {ex.id} {'approved' if approved else 'rejected'}",
        body=f"Exception {ex.id} status is now {ex.status}. Comments: {comments or '-'}",
    )
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

    previous = (
        db.query(ReconciliationAttachment)
        .filter(
            ReconciliationAttachment.reconciliation_record_id == reconciliation_record_id,
            ReconciliationAttachment.document_name == final_document_name,
            ReconciliationAttachment.document_status == "ACTIVE",
        )
        .order_by(ReconciliationAttachment.version.desc())
        .first()
    )
    next_version = (previous.version + 1) if previous else 1
    att = ReconciliationAttachment(
        reconciliation_record_id=reconciliation_record_id,
        uploaded_by=user_id,
        document_type=document_type,
        document_name=final_document_name,
        document_path=final_document_path,
        document_status="ACTIVE",
        version=next_version,
    )
    db.add(att)
    db.flush()
    if previous:
        previous.document_status = "SUPERSEDED"
        previous.replaced_by_id = att.id
        db.add(
            EvidenceVersionHistory(
                attachment_id=previous.id,
                previous_version=previous.version,
                new_version=att.version,
                changed_by=user_id,
                change_note="Evidence file version updated",
            )
        )
    db.commit()
    db.refresh(att)
    audit_service.log_action(db, "ATTACHMENT_UPLOADED", user_id=user_id, entity_type="attachment", entity_id=att.id, metadata={"reconciliation_record_id": reconciliation_record_id, "document_type": document_type})
    return att


def update_profile(db: Session, profile_id: int, payload: dict, actor_id: int | None):
    profile = repository.get_profile(db, profile_id)
    if not profile:
        raise ValueError("Reconciliation profile not found")
    if "workflow_config" in payload:
        payload["workflow_config_json"] = json.dumps(payload.pop("workflow_config") or {})
    if "matching_rules" in payload:
        payload["matching_rules_json"] = json.dumps(payload.pop("matching_rules") or {})
    updated = repository.update_profile(db, profile, payload)
    audit_service.log_action(db, "PROFILE_UPDATED", user_id=actor_id, entity_type="profile", entity_id=profile_id)
    return updated


def delete_profile(db: Session, profile_id: int, actor_id: int | None):
    profile = repository.get_profile(db, profile_id)
    if not profile:
        raise ValueError("Reconciliation profile not found")
    repository.delete_profile(db, profile)
    audit_service.log_action(db, "PROFILE_DELETED", user_id=actor_id, entity_type="profile", entity_id=profile_id)
    return {"deleted": True, "profile_id": profile_id}


def create_close_calendar(db: Session, payload: dict, actor_id: int | None):
    profile = repository.get_profile(db, payload["profile_id"])
    if not profile:
        raise ValueError("Reconciliation profile not found")
    row = repository.create_close_calendar(db, payload)
    audit_service.log_action(db, "CLOSE_CALENDAR_CREATED", user_id=actor_id, entity_type="close_calendar", entity_id=row.id)
    return row


def lock_period(db: Session, calendar_id: int, actor_id: int | None):
    row = repository.get_close_calendar(db, calendar_id)
    if not row:
        raise ValueError("Calendar period not found")
    row.is_locked = True
    row.locked_by = actor_id
    row.locked_at = datetime.utcnow()
    row.status = "CLOSED"
    db.commit()
    db.refresh(row)
    return row


def unlock_period(db: Session, calendar_id: int, actor_id: int | None):
    row = repository.get_close_calendar(db, calendar_id)
    if not row:
        raise ValueError("Calendar period not found")
    row.is_locked = False
    row.locked_by = None
    row.locked_at = None
    row.status = "REOPENED"
    db.commit()
    db.refresh(row)
    return row


def create_certification_workflow(db: Session, payload: dict, actor_id: int | None):
    profile = repository.get_profile(db, payload["profile_id"])
    if not profile:
        raise ValueError("Reconciliation profile not found")
    row = repository.create_certification_workflow(
        db,
        {
            "profile_id": payload["profile_id"],
            "calendar_id": payload.get("calendar_id"),
            "status": STATUS["OPEN"],
            "current_stage": "PREPARER",
            "preparer_id": profile.assigned_preparer,
            "reviewer_id": profile.assigned_reviewer,
            "approver_id": profile.assigned_approver,
            "certifier_id": profile.assigned_certifier,
            "due_date": payload.get("due_date"),
        },
    )
    repository.add_certification_history(
        db, row.id, actor_id, "admin", "CREATE", None, STATUS["OPEN"], "Workflow created"
    )
    return row


def action_certification_workflow(
    db: Session,
    workflow_id: int,
    action: str,
    actor_id: int | None,
    actor_role: str | None,
    comments: str | None,
):
    wf = repository.get_certification_workflow(db, workflow_id)
    if not wf:
        raise ValueError("Certification workflow not found")
    current = wf.status
    normalized_action = action.upper().strip()
    normalized_role = (actor_role or "").lower()

    transitions = {
        "PREPARE": ("preparer", STATUS["PREPARED"], "REVIEWER"),
        "SUBMIT": ("preparer", STATUS["SUBMITTED"], "REVIEWER"),
        "REVIEW": ("reviewer", STATUS["REVIEWED"], "APPROVER"),
        "APPROVE": ("approver", STATUS["APPROVED"], "CERTIFIER"),
        "CERTIFY": ("certifier", STATUS["CERTIFIED"], "ADMIN"),
        "CLOSE": ("admin", STATUS["CLOSED"], "DONE"),
        "REOPEN": ("admin", STATUS["REOPENED"], "PREPARER"),
        "FORCE_CLOSE": ("admin", STATUS["FORCE_CLOSED"], "DONE"),
    }
    if normalized_action not in transitions:
        raise ValueError("Unsupported action")
    required_role, target_status, stage = transitions[normalized_action]
    if normalized_role != required_role and normalized_role != "admin":
        raise ValueError(f"{required_role} role required")

    wf.status = target_status
    wf.current_stage = stage
    wf.last_comment = comments
    wf.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(wf)
    repository.add_certification_history(
        db, wf.id, actor_id, normalized_role, normalized_action, current, target_status, comments
    )
    event_type = "CERT_COMPLETE" if normalized_action == "CERTIFY" else "APPROVAL"
    notification_service.send_email(
        db,
        event_type=event_type,
        workflow_id=wf.id,
        recipient_email=None,
        subject=f"Workflow {wf.id} moved to {target_status}",
        body=f"Action: {normalized_action}, actor role: {normalized_role}, stage: {wf.current_stage}.",
    )
    return wf


def get_certification_history(db: Session, workflow_id: int):
    return (
        db.query(CertificationWorkflowHistory)
        .filter(CertificationWorkflowHistory.workflow_id == workflow_id)
        .order_by(CertificationWorkflowHistory.created_at.desc())
        .all()
    )


def process_overdue_workflows(db: Session):
    today = date.today()
    workflows = repository.list_certification_workflows(db)
    overdue_ids = []
    for wf in workflows:
        due = _parse_date_safe(wf.due_date)
        if due and (today - due).days > 0 and (wf.status or "").upper() not in {"CLOSED", "CERTIFIED", "FORCE_CLOSED"}:
            overdue_ids.append(wf.id)
    return {"overdue_count": len(overdue_ids), "workflow_ids": overdue_ids}


def process_escalations(db: Session):
    exceptions = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.status == "UNDER_REVIEW").all()
    escalated = 0
    for ex in exceptions:
        ex.queue_type = "escalated"
        ex.updated_at = datetime.utcnow()
        escalated += 1
        notification_service.send_email(
            db,
            event_type="ESCALATION",
            workflow_id=None,
            recipient_email=None,
            subject=f"Escalation for exception {ex.id}",
            body=f"Exception {ex.id} escalated due to under-review aging.",
        )
    db.commit()
    return {"escalated": escalated}


def process_workflow_notifications(db: Session):
    workflows = repository.list_certification_workflows(db)
    sent = 0
    for wf in workflows:
        state = (wf.status or "").upper()
        if state in {"SUBMITTED", "REVIEWED", "APPROVED"}:
            notification_service.send_email(
                db,
                event_type="APPROVAL",
                workflow_id=wf.id,
                recipient_email=None,
                subject=f"Workflow {wf.id} pending action",
                body=f"Workflow {wf.id} is pending action in status {wf.status}.",
            )
            sent += 1
    return {"notifications_sent": sent}


def calculate_risk_score(db: Session, profile_id: int):
    profile = repository.get_profile(db, profile_id)
    if not profile:
        raise ValueError("Reconciliation profile not found")
    records = repository.get_records_by_profile(db, profile_id)
    groups = db.query(MatchGroup).filter(MatchGroup.profile_id == profile_id).all()
    unresolved = (
        db.query(ExceptionQueueRecord)
        .join(MatchGroup, MatchGroup.id == ExceptionQueueRecord.match_group_id)
        .filter(MatchGroup.profile_id == profile_id, ExceptionQueueRecord.status.in_(["OPEN", "ASSIGNED", "UNDER_REVIEW"]))
        .count()
    )
    balance_size = sum(abs(r.amount or 0) for r in records)
    aged_items = len([r for r in records if (r.status or "").upper() == "UNMATCHED"])
    manual_adjustments = len([g for g in groups if (g.strategy or "").lower() in {"manual", "rule_override"}])
    historical_findings = (
        db.query(ExceptionQueueRecord)
        .join(MatchGroup, MatchGroup.id == ExceptionQueueRecord.match_group_id)
        .filter(MatchGroup.profile_id == profile_id, ExceptionQueueRecord.status == "REJECTED")
        .count()
    )

    score = 0.0
    score += min(balance_size / 1_000_000, 30)
    score += min(unresolved * 2, 25)
    score += min(aged_items * 1.5, 15)
    score += min(manual_adjustments * 3, 15)
    score += min(historical_findings * 2, 15)
    score = round(min(score, 100.0), 2)

    profile.risk_classification = "HIGH" if score >= 70 else "MEDIUM" if score >= 40 else "LOW"
    db.commit()
    return {
        "profile_id": profile_id,
        "risk_score": score,
        "risk_classification": profile.risk_classification,
        "factors": {
            "balance_size": balance_size,
            "unresolved_exceptions": unresolved,
            "aged_items": aged_items,
            "manual_adjustments": manual_adjustments,
            "historical_audit_findings": historical_findings,
        },
    }


def import_transactions(
    db: Session,
    *,
    source_type: str,
    project_id: int,
    dataset_type: str,
    payload: dict,
):
    st = source_type.lower().strip()
    if st == "csv":
        df = pd.read_csv(payload["file_path"])
    elif st == "xlsx":
        df = pd.read_excel(payload["file_path"])
    elif st == "json":
        df = pd.read_json(payload["file_path"])
    elif st == "xml":
        tree = ET.parse(payload["file_path"])
        root = tree.getroot()
        row_path = payload.get("row_path", ".//row")
        rows = [{child.tag: child.text for child in row} for row in root.findall(row_path)]
        df = pd.DataFrame(rows)
    elif st == "database":
        engine = create_engine(payload["connection_url"])
        with engine.connect() as conn:
            df = pd.read_sql(text(payload["query"]), conn)
    elif st == "api":
        method = payload.get("method", "GET").upper()
        with httpx.Client(timeout=30) as client:
            res = client.request(method, payload["endpoint"], headers=payload.get("headers") or {}, json=payload.get("body"))
            res.raise_for_status()
            data = res.json()
        data_path = payload.get("data_path")
        if data_path:
            for part in str(data_path).split("."):
                if isinstance(data, dict):
                    data = data.get(part, {})
        if isinstance(data, dict):
            data = [data]
        df = pd.DataFrame(data)
    else:
        raise ValueError("Unsupported source_type")

    file_bytes = io.BytesIO(df.to_csv(index=False).encode("utf-8"))
    filename = f"import_{st}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.csv"

    class InMemoryUpload:
        def __init__(self, name: str, content: bytes):
            self.filename = name
            self._content = content
        async def read(self):
            return self._content

    upload = InMemoryUpload(filename, file_bytes.getvalue())
    dataset = asyncio.run(dataset_service.upload_dataset(db, project_id, dataset_type, upload))
    return {"dataset_id": dataset.id, "row_count": dataset.row_count, "source_type": st}


def run_enterprise_validations(db: Session, batch_id: str, profile_id: int | None = None):
    rows = [json.loads(r.payload_json) for r in repository.get_transformed_records(db, batch_id)]
    results = []
    seen = set()
    required_schema = {"entity", "account", "period", "currency", "amount"}
    for row in rows:
        # duplicate detection
        key = (row.get("entity"), row.get("account"), row.get("reference"), row.get("amount"), row.get("period"))
        dup_pass = key not in seen
        seen.add(key)
        results.append(("duplicate_detection", dup_pass, "Duplicate record detected" if not dup_pass else "No duplicate"))
        # invalid GL codes
        account = str(row.get("account") or "")
        gl_pass = account.isdigit() and len(account) >= 4
        results.append(("invalid_gl_codes", gl_pass, "Invalid GL code format" if not gl_pass else "Valid GL"))
        # missing balances
        bal_pass = row.get("amount") not in (None, "")
        results.append(("missing_balances", bal_pass, "Missing amount/balance" if not bal_pass else "Balance present"))
        # invalid dates
        date_val = row.get("tx_date") or row.get("date")
        date_pass = _parse_iso_date(str(date_val) if date_val else None) is not None
        results.append(("invalid_dates", date_pass, "Invalid date format" if not date_pass else "Date valid"))
        # schema mismatch
        schema_pass = required_schema.issubset(set(map(str.lower, row.keys())))
        results.append(("schema_mismatch", schema_pass, "Missing required columns" if not schema_pass else "Schema valid"))
    # reconciliation integrity checks
    integrity_pass = len(rows) > 0
    results.append(("reconciliation_integrity_checks", integrity_pass, "No transformed rows for reconciliation" if not integrity_pass else "Integrity check passed"))

    created = 0
    failed = 0
    for rule_name, passed, message in results:
        db.add(
            ValidationRuleResult(
                batch_id=batch_id,
                profile_id=profile_id,
                rule_name=rule_name,
                severity="HIGH" if not passed else "LOW",
                passed=passed,
                message=message,
                payload_json=None,
            )
        )
        created += 1
        if not passed:
            failed += 1
    db.commit()
    return {"batch_id": batch_id, "checks_run": created, "failed": failed}


def classify_exception(db: Session, exception_id: int, classification: str, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    ex.classification = classification
    if comments:
        ex.comments = comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_CLASSIFIED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"classification": classification})
    return ex


def add_exception_comment(db: Session, exception_id: int, comment: str, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    row = ExceptionComment(exception_id=exception_id, user_id=actor_id, comment=comment)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resolve_exception(db: Session, exception_id: int, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    ex.status = "RESOLVED"
    ex.queue_type = "resolved"
    ex.resolution_notes = comments
    ex.resolved_at = datetime.utcnow()
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_RESOLVED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"comments": comments})
    return ex


def escalate_exception(db: Session, exception_id: int, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    ex.status = "ESCALATED"
    ex.queue_type = "escalated"
    ex.escalated_at = datetime.utcnow()
    ex.comments = comments or ex.comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_ESCALATED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"comments": comments})
    return ex


def reopen_exception(db: Session, exception_id: int, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    ex.status = "REOPENED"
    ex.queue_type = "assigned"
    ex.resolved_at = None
    ex.comments = comments or ex.comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_REOPENED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={"comments": comments})
    return ex


def ocr_extract_evidence(db: Session, attachment_id: int):
    att = db.query(ReconciliationAttachment).filter(ReconciliationAttachment.id == attachment_id).first()
    if not att:
        raise ValueError("Attachment not found")
    path = Path(att.document_path or "")
    if not path.exists():
        raise ValueError("Evidence file path not found")
    extracted_text = ""
    try:
        suffix = path.suffix.lower()
        if suffix in {".txt", ".csv"}:
            extracted_text = path.read_text(encoding="utf-8", errors="ignore")
        elif suffix in {".json"}:
            extracted_text = json.dumps(json.loads(path.read_text(encoding="utf-8", errors="ignore")), indent=2)
        else:
            # Optional OCR libs if available.
            try:
                import pytesseract
                from PIL import Image
                if suffix in {".png", ".jpg", ".jpeg", ".bmp", ".tiff"}:
                    extracted_text = pytesseract.image_to_string(Image.open(path))
            except Exception:
                extracted_text = f"OCR fallback: content type {suffix} recognized but OCR engine unavailable."
    except Exception as exc:
        extracted_text = f"Extraction failed: {exc}"
    return {"attachment_id": attachment_id, "document_name": att.document_name, "extracted_text_preview": extracted_text[:4000]}


def preview_evidence(db: Session, attachment_id: int):
    att = db.query(ReconciliationAttachment).filter(ReconciliationAttachment.id == attachment_id).first()
    if not att:
        raise ValueError("Attachment not found")
    path = Path(att.document_path or "")
    if not path.exists():
        raise ValueError("Evidence file not found")
    suffix = path.suffix.lower()
    preview = {"attachment_id": attachment_id, "name": att.document_name, "type": suffix, "size_bytes": path.stat().st_size}
    if suffix in {".txt", ".csv", ".json", ".xml"}:
        preview["content_preview"] = path.read_text(encoding="utf-8", errors="ignore")[:4000]
    else:
        preview["content_preview"] = f"Binary preview available for {suffix}. Download/open in supported viewer."
    preview["supported_preview"] = suffix in {".pdf", ".xlsx", ".docx", ".csv", ".png", ".jpg", ".jpeg", ".txt", ".json", ".xml"}
    return preview


def create_evidence_version(db: Session, attachment_id: int, payload: dict, actor_id: int | None):
    att = db.query(ReconciliationAttachment).filter(ReconciliationAttachment.id == attachment_id).first()
    if not att:
        raise ValueError("Attachment not found")
    new_att = ReconciliationAttachment(
        reconciliation_record_id=att.reconciliation_record_id,
        uploaded_by=actor_id,
        document_type=payload.get("document_type") or att.document_type,
        document_name=payload.get("document_name") or att.document_name,
        document_path=payload.get("document_path") or att.document_path,
        document_status="ACTIVE",
        version=(att.version or 1) + 1,
    )
    db.add(new_att)
    db.flush()
    att.document_status = "SUPERSEDED"
    att.replaced_by_id = new_att.id
    db.add(
        EvidenceVersionHistory(
            attachment_id=att.id,
            previous_version=att.version or 1,
            new_version=new_att.version,
            changed_by=actor_id,
            change_note=payload.get("change_note"),
        )
    )
    db.commit()
    db.refresh(new_att)
    return new_att


def list_evidence_history(db: Session, attachment_id: int):
    return db.query(EvidenceVersionHistory).filter(EvidenceVersionHistory.attachment_id == attachment_id).order_by(EvidenceVersionHistory.changed_at.desc()).all()


def build_audit_package(db: Session, reconciliation_id: int, actor_id: int | None):
    execution = db.query(Execution).filter(Execution.id == reconciliation_id).first()
    if not execution:
        raise ValueError("Reconciliation execution not found")
    package_dir = EVIDENCE_UPLOAD_DIR.parent / "audit_packages"
    package_dir.mkdir(parents=True, exist_ok=True)
    package_name = f"audit_package_recon_{reconciliation_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.zip"
    package_path = package_dir / package_name
    results = db.query(ReconciliationRecord).all()
    workflows = db.query(CertificationWorkflowHistory).all()
    comments = db.query(ExceptionComment).all()
    attachments = db.query(ReconciliationAttachment).all()
    with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("reconciliation_records.json", json.dumps([{"id": r.id, "status": r.status, "amount": r.amount} for r in results], indent=2))
        zf.writestr("workflow_history.json", json.dumps([{"id": h.id, "action": h.action, "from": h.from_status, "to": h.to_status} for h in workflows], indent=2))
        zf.writestr("exception_comments.json", json.dumps([{"id": c.id, "exception_id": c.exception_id, "comment": c.comment} for c in comments], indent=2))
        zf.writestr("attachments.json", json.dumps([{"id": a.id, "name": a.document_name, "version": a.version} for a in attachments], indent=2))
    checksum = hashlib.sha256(package_path.read_bytes()).hexdigest()
    row = AuditPackage(reconciliation_id=reconciliation_id, generated_by=actor_id, package_path=str(package_path), checksum=checksum)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_snapshot(db: Session, profile_id: int, period_key: str, snapshot_name: str, actor_id: int | None):
    records = db.query(ReconciliationRecord).filter(ReconciliationRecord.profile_id == profile_id, ReconciliationRecord.period == period_key).all()
    payload = [
        {"id": r.id, "entity": r.entity, "account": r.account, "amount": r.amount, "status": r.status, "reference": r.reference}
        for r in records
    ]
    row = ReconciliationSnapshot(
        profile_id=profile_id,
        period_key=period_key,
        snapshot_name=snapshot_name,
        snapshot_json=json.dumps(payload),
        created_by=actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def restore_snapshot(db: Session, snapshot_id: int, actor_id: int | None):
    snap = db.query(ReconciliationSnapshot).filter(ReconciliationSnapshot.id == snapshot_id).first()
    if not snap:
        raise ValueError("Snapshot not found")
    rows = json.loads(snap.snapshot_json or "[]")
    restored = 0
    for item in rows:
        rec = db.query(ReconciliationRecord).filter(ReconciliationRecord.id == item.get("id")).first()
        if rec:
            rec.status = item.get("status", rec.status)
            rec.amount = item.get("amount", rec.amount)
            restored += 1
    db.commit()
    audit_service.log_action(db, "SNAPSHOT_RESTORED", user_id=actor_id, entity_type="snapshot", entity_id=snapshot_id, metadata={"restored_records": restored})
    return {"snapshot_id": snapshot_id, "restored_records": restored}


def compare_snapshots(db: Session, base_snapshot_id: int, compare_snapshot_id: int):
    base = db.query(ReconciliationSnapshot).filter(ReconciliationSnapshot.id == base_snapshot_id).first()
    comp = db.query(ReconciliationSnapshot).filter(ReconciliationSnapshot.id == compare_snapshot_id).first()
    if not base or not comp:
        raise ValueError("Snapshot not found")
    base_map = {str(item["id"]): item for item in json.loads(base.snapshot_json or "[]")}
    comp_map = {str(item["id"]): item for item in json.loads(comp.snapshot_json or "[]")}
    changes = []
    keys = set(base_map.keys()).union(comp_map.keys())
    for key in keys:
        b = base_map.get(key)
        c = comp_map.get(key)
        if b != c:
            changes.append({"record_id": key, "base": b, "compare": c})
    return {"base_snapshot_id": base_snapshot_id, "compare_snapshot_id": compare_snapshot_id, "changes": changes, "change_count": len(changes)}


def create_exchange_rate(db: Session, payload: dict):
    row = ExchangeRate(
        from_currency=payload["from_currency"].upper(),
        to_currency=payload["to_currency"].upper(),
        rate=float(payload["rate"]),
        rate_date=payload["rate_date"],
        source=payload.get("source"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def convert_currency(db: Session, amount: float, from_currency: str, to_currency: str, conversion_date: str | None = None):
    if from_currency.upper() == to_currency.upper():
        return {"converted_amount": amount, "rate": 1.0, "rate_date": conversion_date, "fx_variance": 0.0}
    q = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_currency.upper(),
        ExchangeRate.to_currency == to_currency.upper(),
    )
    if conversion_date:
        q = q.filter(ExchangeRate.rate_date <= conversion_date)
    rate_row = q.order_by(ExchangeRate.rate_date.desc()).first()
    if not rate_row:
        raise ValueError("Exchange rate not found")
    converted = amount * rate_row.rate
    return {"converted_amount": converted, "rate": rate_row.rate, "rate_date": rate_row.rate_date, "fx_variance": converted - amount}


def fx_reconciliation(db: Session, profile_id: int, reporting_currency: str):
    records = repository.get_records_by_profile(db, profile_id)
    details = []
    total_source = 0.0
    total_converted = 0.0
    for rec in records:
        src_amt = rec.amount or 0.0
        total_source += src_amt
        conv = convert_currency(db, src_amt, rec.currency or reporting_currency, reporting_currency, rec.period)
        total_converted += conv["converted_amount"]
        details.append({"record_id": rec.id, "from_currency": rec.currency, "to_currency": reporting_currency, "source_amount": src_amt, "converted_amount": conv["converted_amount"], "fx_variance": conv["fx_variance"]})
    return {"profile_id": profile_id, "reporting_currency": reporting_currency, "source_total": total_source, "converted_total": total_converted, "fx_variance_total": total_converted - total_source, "details": details}


def create_journal_adjustment(db: Session, payload: dict, actor_id: int | None):
    converted = None
    if payload.get("reporting_currency") and payload.get("reporting_currency") != payload["currency"]:
        conv = convert_currency(db, payload["amount"], payload["currency"], payload["reporting_currency"], payload.get("period_key"))
        converted = conv["converted_amount"]
    row = JournalAdjustment(
        profile_id=payload["profile_id"],
        period_key=payload["period_key"],
        account=payload["account"],
        currency=payload["currency"],
        amount=payload["amount"],
        functional_currency=payload.get("functional_currency"),
        reporting_currency=payload.get("reporting_currency"),
        converted_amount=converted,
        reason=payload.get("reason"),
        status="DRAFT",
        created_by=actor_id,
    )
    db.add(row)
    db.flush()
    db.add(JournalAdjustmentHistory(adjustment_id=row.id, action="CREATE", actor_id=actor_id, comments=payload.get("reason")))
    db.commit()
    db.refresh(row)
    return row


def journal_action(db: Session, adjustment_id: int, action: str, actor_id: int | None, comments: str | None):
    row = db.query(JournalAdjustment).filter(JournalAdjustment.id == adjustment_id).first()
    if not row:
        raise ValueError("Journal adjustment not found")
    act = action.upper()
    if act == "SUBMIT":
        row.status = "SUBMITTED"
    elif act == "APPROVE":
        row.status = "APPROVED"
        row.approved_by = actor_id
    elif act == "REJECT":
        row.status = "REJECTED"
    elif act == "ERP_POST":
        row.status = "POSTED"
        row.erp_posting_reference = f"ERP-SIM-{row.id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    else:
        raise ValueError("Unsupported journal action")
    row.updated_at = datetime.utcnow()
    db.add(JournalAdjustmentHistory(adjustment_id=row.id, action=act, actor_id=actor_id, comments=comments))
    db.commit()
    db.refresh(row)
    return row


def variance_analysis(db: Session, profile_id: int):
    records = repository.get_records_by_profile(db, profile_id)
    src_total = sum((r.amount or 0.0) for r in records)
    unmatched = [r for r in records if (r.status or "").upper() in {"UNMATCHED", "PARTIAL_MATCH"}]
    unmatched_total = sum((r.amount or 0.0) for r in unmatched)
    return {
        "profile_id": profile_id,
        "source_balance_difference": src_total,
        "unmatched_amount": unmatched_total,
        "adjustment_recommendation": "Create journal adjustment" if abs(unmatched_total) > 0 else "No adjustment needed",
    }


def advanced_search(db: Session, filters: dict):
    q = db.query(ReconciliationProfile)
    if filters.get("risk_level"):
        q = q.filter(ReconciliationProfile.risk_classification == filters["risk_level"].upper())
    if filters.get("status"):
        q = q.filter(ReconciliationProfile.lifecycle_state == filters["status"].upper())
    if filters.get("preparer_id"):
        q = q.filter(ReconciliationProfile.assigned_preparer == filters["preparer_id"])
    if filters.get("reviewer_id"):
        q = q.filter(ReconciliationProfile.assigned_reviewer == filters["reviewer_id"])
    if filters.get("reconciliation_type"):
        q = q.filter(ReconciliationProfile.reconciliation_type == filters["reconciliation_type"])
    rows = q.order_by(ReconciliationProfile.updated_at.desc()).all()
    account = filters.get("account_number")
    min_b = filters.get("min_balance")
    max_b = filters.get("max_balance")
    period = filters.get("period")
    if account or min_b is not None or max_b is not None or period:
        kept = []
        for p in rows:
            rq = db.query(ReconciliationRecord).filter(ReconciliationRecord.profile_id == p.id)
            if account:
                rq = rq.filter(ReconciliationRecord.account == account)
            if min_b is not None:
                rq = rq.filter(ReconciliationRecord.amount >= min_b)
            if max_b is not None:
                rq = rq.filter(ReconciliationRecord.amount <= max_b)
            if period:
                rq = rq.filter(ReconciliationRecord.period == period)
            if rq.first():
                kept.append(p)
        rows = kept
    return rows


def bulk_action(db: Session, payload: dict, actor_id: int | None):
    act = (payload.get("action") or "").upper()
    ids = payload.get("profile_ids") or []
    target_user = payload.get("target_user_id")
    rows = db.query(ReconciliationProfile).filter(ReconciliationProfile.id.in_(ids)).all()
    for row in rows:
        if act == "ASSIGN" and target_user:
            row.assigned_reviewer = target_user
        elif act == "APPROVE":
            row.lifecycle_state = "APPROVED"
        elif act == "EXPORT":
            pass
        elif act == "CLOSE":
            row.lifecycle_state = "CLOSED"
        elif act == "ESCALATE":
            row.lifecycle_state = "REOPENED"
        audit_service.log_action(db, f"BULK_{act}", user_id=actor_id, entity_type="profile", entity_id=row.id, metadata={"target_user": target_user, "comments": payload.get("comments")})
    db.commit()
    return {"processed": len(rows)}


def add_comment(db: Session, payload: dict, actor_id: int | None):
    row = ReconciliationComment(
        profile_id=payload["profile_id"],
        parent_id=payload.get("parent_id"),
        author_id=actor_id,
        message=payload["message"],
        mentions_json=json.dumps(payload.get("mentions") or []),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_comments(db: Session, profile_id: int):
    return db.query(ReconciliationComment).filter(ReconciliationComment.profile_id == profile_id).order_by(ReconciliationComment.created_at.asc()).all()


def create_scheduled_report(db: Session, payload: dict, actor_id: int | None):
    row = ScheduledReport(
        report_type=payload["report_type"],
        cron_expression=payload["cron_expression"],
        recipients_json=json.dumps(payload.get("recipients") or []),
        active=True,
        created_by=actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_scheduled_reports(db: Session):
    return db.query(ScheduledReport).order_by(ScheduledReport.created_at.desc()).all()


def run_scheduled_report(db: Session, report_id: int):
    report = db.query(ScheduledReport).filter(ScheduledReport.id == report_id, ScheduledReport.active == True).first()
    if not report:
        return {"skipped": True}
    out_dir = EVIDENCE_UPLOAD_DIR.parent / "scheduled_reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_type = (report.report_type or "executive").lower()
    filename_base = f"{report_type}_{report.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    rows = []
    summary = {}
    if report_type == "executive":
        metrics = get_dashboard_metrics(db, "admin", report.created_by)
        rows = [{"transaction_id": "KPI", "source_amount": metrics.get("completion_pct"), "target_amount": metrics.get("auto_match_pct"), "difference": metrics.get("overdue_reconciliations"), "status": "EXECUTIVE"}]
        summary = {"total_records": 1, "matched_count": 1, "unmatched_count": 0, "match_percentage": 100}
    else:
        profiles = db.query(ReconciliationProfile).all()
        rows = [{"transaction_id": p.id, "source_amount": None, "target_amount": None, "difference": None, "status": p.lifecycle_state} for p in profiles]
        summary = {"total_records": len(rows), "matched_count": 0, "unmatched_count": 0, "match_percentage": 0}
    pdf_io = __import__("app.services.export_service", fromlist=["generate_pdf_report"]).generate_pdf_report(rows, summary, title=f"Scheduled {report_type.title()} Report")
    pdf_path = out_dir / f"{filename_base}.pdf"
    with pdf_path.open("wb") as f:
        f.write(pdf_io.getvalue())
    run = ScheduledReportRun(report_id=report.id, output_path=str(pdf_path), status="COMPLETED", executed_at=datetime.utcnow())
    db.add(run)
    report.last_run_at = datetime.utcnow()
    db.commit()
    recipients = json.loads(report.recipients_json or "[]")
    for email in recipients:
        notification_service.send_email(
            db,
            event_type="REPORT",
            workflow_id=None,
            recipient_email=email,
            subject=f"Scheduled {report_type.title()} Report",
            body=f"Please find attached scheduled report generated at {run.executed_at}.",
            attachments=[str(pdf_path)],
        )
    return {"report_id": report.id, "output_path": str(pdf_path), "recipients": recipients}
