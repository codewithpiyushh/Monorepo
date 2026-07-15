import json
import logging
import uuid
import io
import asyncio
import hashlib
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse
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
    EnterpriseSetting,
    ReconciliationRetentionPolicy,
    ReconciliationDependency,
    ReconciliationArchive,
    BackupRecord,
    JobMetric,
    AuditLog,
    CompliancePolicy,
    ApprovalRule,
)
from ..core.config import settings
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


def _normalize_currency_code(value: str | None, field_label: str):
    code = (value or "").strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise ValueError(f"{field_label} must be a 3-letter ISO currency code")
    return code


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
        threshold = float(profile.auto_approve_threshold or auto_match_threshold or 1.0)
        materiality_limit = abs(float(profile.materiality_limit or 0.0))
        classification = "FULL_MATCH" if score >= threshold else "PARTIAL_MATCH"
        if materiality_limit and abs(variance) > materiality_limit:
            classification = "VARIANCE_FLAGGED"
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


def match_suggestions(db: Session, profile_id: int, top_k: int = 20, min_confidence: float = 0.6):
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not profile:
        raise ValueError("Reconciliation profile not found")
    records = repository.get_records_by_profile(db, profile_id)
    candidates = [r for r in records if (r.status or "").upper() in {"UNMATCHED", "PARTIAL_MATCH", "VALIDATED"}]
    suggestions = []
    tolerance = abs(float(profile.tolerance_threshold or 0.0))
    date_window_days = max(int(profile.date_window_days or 0), 0)

    for left in candidates:
        for right in candidates:
            if left.id >= right.id:
                continue
            if left.entity != right.entity or left.account != right.account:
                continue
            left_amt = float(left.amount or 0.0)
            right_amt = float(right.amount or 0.0)
            amount_delta = abs(left_amt + right_amt)
            if amount_delta == 0:
                amount_score = 1.0
            elif tolerance > 0 and amount_delta <= tolerance:
                amount_score = max(0.0, 1.0 - (amount_delta / tolerance))
            else:
                amount_score = max(0.0, 1.0 - (amount_delta / max(abs(left_amt) + abs(right_amt), 1.0)))
            ref_score = fuzz.token_sort_ratio(str(left.reference or ""), str(right.reference or "")) / 100.0
            date_score = 0.0
            d1 = _parse_iso_date(left.tx_date)
            d2 = _parse_iso_date(right.tx_date)
            if d1 and d2:
                diff = abs((d1 - d2).days)
                window = max(date_window_days, 2)
                date_score = 1.0 if diff <= window else max(0.0, 1.0 - (diff / max(window * 5, 30)))
            confidence = round((amount_score * 0.55) + (ref_score * 0.35) + (date_score * 0.10), 4)
            if confidence < min_confidence:
                continue
            suggestions.append(
                {
                    "left_record_id": left.id,
                    "right_record_id": right.id,
                    "entity": left.entity,
                    "account": left.account,
                    "left_reference": left.reference,
                    "right_reference": right.reference,
                    "left_amount": left_amt,
                    "right_amount": right_amt,
                    "amount_delta": amount_delta,
                    "confidence": confidence,
                    "why": {
                        "amount_score": round(amount_score, 4),
                        "reference_score": round(ref_score, 4),
                        "date_score": round(date_score, 4),
                    },
                }
            )

    suggestions.sort(key=lambda x: (x["confidence"], -x["amount_delta"]), reverse=True)
    return {"profile_id": profile_id, "count": min(len(suggestions), top_k), "items": suggestions[:top_k]}


def _parse_date_safe(raw: str | None):
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except Exception:
        return None


def _host_allowlist(raw: str) -> set[str]:
    return {item.strip().lower() for item in (raw or "").split(",") if item.strip()}


def _enforce_allowed_host(url: str, allowed_hosts: set[str], label: str):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError(f"{label} host missing")
    if host not in allowed_hosts:
        raise ValueError(f"{label} host '{host}' is not allowed")


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
    # Each role sees its own scoped queue — no cross-role aliasing
    normalized_role = (role or "").lower().strip()

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
        # Reviewer sees items submitted for review
        q = q.filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )
    elif normalized_role == "approver":
        # Approver sees escalated / in-review items awaiting final approval
        q = q.filter(
            ExceptionQueueRecord.queue_type.in_(["exception", "escalated"])
        ).filter(
            (ExceptionQueueRecord.assigned_to.is_(None)) | (ExceptionQueueRecord.assigned_to == user_id)
        )
    elif normalized_role == "auditor":
        # Auditor sees all resolved/finalized exceptions (read-only scope)
        q = q.filter(ExceptionQueueRecord.queue_type.in_(["resolved", "finalized"]))

    return q.order_by(ExceptionQueueRecord.updated_at.desc()).all()


def list_notifications(db: Session, user_id: int, unread_only: bool = False, limit: int = 12, offset: int = 0):
    """Get paginated UINotifications for user with filtering support"""
    from ..models.models import UINotification
    
    query = db.query(UINotification).filter(UINotification.user_id == user_id)
    
    if unread_only:
        query = query.filter(UINotification.is_read == False)
    
    total_count = query.count()
    unread_count = db.query(UINotification).filter(
        UINotification.user_id == user_id,
        UINotification.is_read == False
    ).count()
    
    notifications = query.order_by(UINotification.created_at.desc()).offset(offset).limit(limit).all()
    
    items = [{
        "id": n.id,
        "user_id": n.user_id,
        "notification_type": n.notification_type,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "action_url": n.action_url,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    } for n in notifications]
    
    return {
        "total": total_count,
        "unread_count": unread_count,
        "read_count": total_count - unread_count,
        "limit": limit,
        "offset": offset,
        "items": items
    }



def mark_notification_read(db: Session, notification_id: int, user_id: int):
    """Mark single UINotification as read"""
    from ..models.models import UINotification
    from datetime import datetime
    
    notification = db.query(UINotification).filter(
        UINotification.id == notification_id,
        UINotification.user_id == user_id
    ).first()
    
    if not notification:
        raise Exception("Notification not found or access denied")
    
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    db.commit()
    db.refresh(notification)
    
    return {
        "id": notification.id,
        "is_read": notification.is_read,
        "read_at": notification.read_at.isoformat() if notification.read_at else None
    }


def mark_all_notifications_read(db: Session, user_id: int):
    """Mark all UINotifications as read for user"""
    from ..models.models import UINotification
    from datetime import datetime
    
    db.query(UINotification).filter(
        UINotification.user_id == user_id,
        UINotification.is_read == False
    ).update({
        UINotification.is_read: True,
        UINotification.read_at: datetime.utcnow()
    }, synchronize_session=False)
    
    db.commit()
    
    # Get updated count
    unread_count = db.query(UINotification).filter(
        UINotification.user_id == user_id,
        UINotification.is_read == False
    ).count()
    
    total_count = db.query(UINotification).filter(
        UINotification.user_id == user_id
    ).count()
    
    return {
        "message": "All notifications marked as read",
        "total": total_count,
        "unread_count": unread_count
    }


def delete_notification(db: Session, notification_id: int, user_id: int):
    """Delete a single notification"""
    from ..models.models import UINotification
    
    notification = db.query(UINotification).filter(
        UINotification.id == notification_id,
        UINotification.user_id == user_id
    ).first()
    
    if not notification:
        raise Exception("Notification not found or access denied")
    
    db.delete(notification)
    db.commit()
    
    return {"message": "Notification deleted successfully"}


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
    # Release ownership so reviewer queue filters can pick up the item immediately.
    ex.assigned_to = None
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
    if approved and actor_id is not None:
        submitted_log = (
            db.query(AuditLog)
            .filter(
                AuditLog.action_type == "EXCEPTION_SUBMITTED",
                AuditLog.entity_type == "exception",
                AuditLog.entity_id == ex.id,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )
        if submitted_log and submitted_log.user_id == actor_id:
            raise ValueError("Segregation of duties violation: submitter cannot approve the same exception")
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

def create_certification_workflow(db: Session, payload: dict, actor_id: int | None):
    profile = repository.get_profile(db, payload["profile_id"])
    if not profile:
        raise ValueError("Reconciliation profile not found")
    if profile.assigned_preparer is None or (profile.assigned_reviewer is None and profile.assigned_approver is None) or profile.assigned_certifier is None:
        raise ValueError("Profile must have preparer, reviewer/approver, and certifier assignments before creating workflow")
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
    # Each role is treated as a distinct identity.
    # APPROVER now handles both review and approval in the merged workflow.
    normalized_role = (actor_role or "").lower().strip()

    # ---------------------------------------------------------------------------
    # Transition table — (required_role, target_status, next_stage, allowed_from_statuses)
    # APPROVER handles both review and approval:
    #   • Can review submissions and check evidence (validates completeness)
    #   • Can approve after review (final sign-off, distinct SOX control)
    #   • Can return for rework or escalate if issues found
    # ---------------------------------------------------------------------------
    transitions = {
        "PREPARE":     ("preparer",  STATUS["PREPARED"],    "APPROVER",  {STATUS["OPEN"], STATUS["REOPENED"]}),
        "SUBMIT":      ("preparer",  STATUS["SUBMITTED"],   "APPROVER",  {STATUS["PREPARED"]}),
        "REVIEW":      ("approver",  STATUS["REVIEWED"],    "APPROVER",  {STATUS["SUBMITTED"]}),
        "APPROVE":     ("approver",  STATUS["APPROVED"],    "CERTIFIER", {STATUS["REVIEWED"]}),
        "CERTIFY":     ("certifier", STATUS["CERTIFIED"],   "ADMIN",     {STATUS["APPROVED"]}),
        "CLOSE":       ("admin",     STATUS["CLOSED"],      "DONE",      {STATUS["CERTIFIED"]}),
        "REOPEN":      ("admin",     STATUS["REOPENED"],    "PREPARER",  {
            STATUS["PREPARED"], STATUS["SUBMITTED"], STATUS["REVIEWED"],
            STATUS["APPROVED"], STATUS["CERTIFIED"], STATUS["CLOSED"], STATUS["FORCE_CLOSED"],
        }),
        "FORCE_CLOSE": ("admin",     STATUS["FORCE_CLOSED"],"DONE",      {
            STATUS["OPEN"], STATUS["PREPARED"], STATUS["SUBMITTED"],
            STATUS["REVIEWED"], STATUS["APPROVED"], STATUS["REOPENED"],
        }),
    }

    if normalized_action not in transitions:
        raise ValueError(f"Unsupported action '{normalized_action}'")
    required_role, target_status, stage, allowed_from = transitions[normalized_action]

    if current not in allowed_from:
        raise ValueError(
            f"Action '{normalized_action}' is not allowed from current status '{current}'. "
            f"Expected one of: {sorted(allowed_from)}"
        )

    # Role check — admin can bypass for operational overrides
    if normalized_role != required_role and normalized_role != "admin":
        raise ValueError(
            f"Role '{normalized_role}' cannot perform '{normalized_action}'. "
            f"Required role: '{required_role}'"
        )

    # Assignment check — only the designated person can act at each stage
    if normalized_role == required_role and actor_id is not None:
        if required_role == "preparer" and wf.preparer_id and actor_id != wf.preparer_id:
            raise ValueError("Only the assigned preparer can perform this action")
        if required_role == "approver" and wf.approver_id and actor_id != wf.approver_id:
            raise ValueError("Only the assigned approver can perform this action")
        if required_role == "certifier" and wf.certifier_id and actor_id != wf.certifier_id:
            raise ValueError("Only the assigned certifier can perform this action")

    if normalized_action in {"REOPEN", "FORCE_CLOSE"} and not (comments or "").strip():
        raise ValueError("Comments are required for reopen/force-close actions")

    # SoD: REVIEW, APPROVE, and CERTIFY must each be performed by a different person
    if normalized_action in {"REVIEW", "APPROVE", "CERTIFY"} and actor_id is not None:
        prior_actors = {
            h.actor_id
            for h in db.query(CertificationWorkflowHistory)
            .filter(CertificationWorkflowHistory.workflow_id == wf.id)
            .all()
            if h.actor_id is not None
        }
        if actor_id in prior_actors:
            raise ValueError(
                "Segregation of duties violation: each stage (REVIEW, APPROVE, CERTIFY) "
                "must be performed by a different user."
            )

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


def analytics_dashboard_summary(db: Session, period: str | None = None, entity: str | None = None, user_id: int | None = None):
    """Return business KPIs for the executive dashboard."""
    explorer = reconciliation_analytics_explorer(db, user_id=user_id)
    transactions = explorer.get("transactions") or []
    workflows = repository.list_certification_workflows(db)

    if period:
        transactions = [t for t in transactions if (t.get("period") or "") == period]
        workflows = [wf for wf in workflows if (wf.period_key or "") == period]
    if entity:
        transactions = [t for t in transactions if (t.get("entity") or "") == entity]

    total_transactions = len(transactions)
    matched_transactions = len([t for t in transactions if (t.get("status") or "").upper() in {"MATCHED", "RECONCILED", "FINALIZED", "APPROVED"}])
    open_exceptions = [t for t in transactions if t.get("exception_id") and (t.get("exception_status") or "OPEN").upper() not in {"RESOLVED", "APPROVED", "CLOSED"}]
    pending_approvals = len([wf for wf in workflows if (wf.status or "").upper() in {"SUBMITTED", "REVIEWED", "APPROVED"}])
    certified = len([wf for wf in workflows if (wf.status or "").upper() in {"CERTIFIED", "CLOSED", "FORCE_CLOSED"}])
    variance_amount = sum(abs(float(t.get("match_variance") or 0)) for t in transactions)

    account_risk = {}
    for row in transactions:
        account = row.get("account") or "Unassigned"
        risk = account_risk.setdefault(account, {"account": account, "exception_count": 0, "variance_amount": 0.0, "days_open": 0, "account_type": account, "historical_issues": 0})
        if row.get("exception_id"):
            risk["exception_count"] += 1
            risk["historical_issues"] += 1
        risk["variance_amount"] += abs(float(row.get("match_variance") or 0))
        tx_date = _parse_date_safe(row.get("tx_date"))
        if tx_date:
            risk["days_open"] = max(risk["days_open"], (date.today() - tx_date).days)

    scored_accounts = []
    for payload in account_risk.values():
        score = _risk_score_from_payload(payload)
        scored_accounts.append(
            {
                "account": payload["account"],
                "risk_score": score,
                "risk_level": _risk_level_from_score(score),
                "exception_count": payload["exception_count"],
                "variance_amount": round(payload["variance_amount"], 2),
            }
        )
    scored_accounts.sort(key=lambda item: (-item["risk_score"], -item["variance_amount"], item["account"]))

    return {
        "match_rate": round((matched_transactions / total_transactions) * 100, 2) if total_transactions else 0.0,
        "open_exceptions": len(open_exceptions),
        "pending_approvals": pending_approvals,
        "certification_pct": round((certified / len(workflows)) * 100, 2) if workflows else 0.0,
        "variance_amount": round(variance_amount, 2),
        "high_risk_accounts": scored_accounts[:6],
        "total_reconciliations": len(explorer.get("profiles") or []),
    }


def analytics_drilldown(db: Session, level: str = "entity", key: str | None = None, limit: int = 50, user_id: int | None = None):
    """Return drilldown data based on the explorer transaction grain."""
    explorer = reconciliation_analytics_explorer(db, user_id=user_id)
    transactions = explorer.get("transactions") or []
    normalized = (level or "entity").lower()

    if normalized == "entity":
        grouped = {}
        for row in transactions:
            entity_key = row.get("entity") or "Unassigned"
            item = grouped.setdefault(entity_key, {"entity": entity_key, "total_transactions": 0, "matched_transactions": 0, "exceptions": 0, "variance_amount": 0.0})
            item["total_transactions"] += 1
            if (row.get("status") or "").upper() in {"MATCHED", "RECONCILED", "FINALIZED", "APPROVED"}:
                item["matched_transactions"] += 1
            if row.get("exception_id"):
                item["exceptions"] += 1
            item["variance_amount"] += abs(float(row.get("match_variance") or 0))
        items = []
        for item in grouped.values():
            item["match_rate"] = round((item["matched_transactions"] / item["total_transactions"]) * 100, 2) if item["total_transactions"] else 0.0
            items.append(item)
        items.sort(key=lambda item: (-item["exceptions"], -item["variance_amount"], item["entity"]))
        return {"items": items[:limit], "total": len(items)}

    if normalized == "account":
        scoped = [row for row in transactions if not key or (row.get("entity") or "") == key]
        grouped = {}
        for row in scoped:
            account_key = row.get("account") or "Unassigned"
            item = grouped.setdefault(account_key, {"account": account_key, "entity": row.get("entity") or "Unassigned", "total_transactions": 0, "matched_transactions": 0, "exceptions": 0, "variance_amount": 0.0})
            item["total_transactions"] += 1
            if (row.get("status") or "").upper() in {"MATCHED", "RECONCILED", "FINALIZED", "APPROVED"}:
                item["matched_transactions"] += 1
            if row.get("exception_id"):
                item["exceptions"] += 1
            item["variance_amount"] += abs(float(row.get("match_variance") or 0))
        items = []
        for item in grouped.values():
            item["match_rate"] = round((item["matched_transactions"] / item["total_transactions"]) * 100, 2) if item["total_transactions"] else 0.0
            items.append(item)
        items.sort(key=lambda item: (-item["exceptions"], -item["variance_amount"], item["account"]))
        return {"items": items[:limit], "total": len(items)}

    if normalized == "reconciliation":
        scoped = [row for row in transactions if not key or (row.get("account") or "") == key or str(row.get("profile_id")) == str(key)]
        grouped = {}
        for row in scoped:
            recon_key = row.get("profile_id")
            item = grouped.setdefault(recon_key, {"profile_id": recon_key, "entity": row.get("entity"), "account": row.get("account"), "status": row.get("profile", {}).get("lifecycle_state") or row.get("status"), "total_transactions": 0, "matched_transactions": 0, "exceptions": 0, "variance_amount": 0.0})
            item["total_transactions"] += 1
            if (row.get("status") or "").upper() in {"MATCHED", "RECONCILED", "FINALIZED", "APPROVED"}:
                item["matched_transactions"] += 1
            if row.get("exception_id"):
                item["exceptions"] += 1
            item["variance_amount"] += abs(float(row.get("match_variance") or 0))
        items = []
        for item in grouped.values():
            item["match_rate"] = round((item["matched_transactions"] / item["total_transactions"]) * 100, 2) if item["total_transactions"] else 0.0
            items.append(item)
        items.sort(key=lambda item: (-item["exceptions"], -item["variance_amount"], str(item["profile_id"])))
        return {"items": items[:limit], "total": len(items)}

    if normalized == "exception":
        scoped = [row for row in transactions if row.get("exception_id") and (not key or str(row.get("profile_id")) == str(key))]
        items = [
            {
                "exception_id": row.get("exception_id"),
                "profile_id": row.get("profile_id"),
                "entity": row.get("entity"),
                "account": row.get("account"),
                "classification": row.get("exception_classification"),
                "status": row.get("exception_status") or "OPEN",
                "variance_amount": round(abs(float(row.get("match_variance") or 0)), 2),
                "record_id": row.get("record_id"),
            }
            for row in scoped[:limit]
        ]
        return {"items": items, "total": len(scoped)}

    if normalized == "transaction":
        scoped = [row for row in transactions if not key or str(row.get("exception_id")) == str(key)]
        return {"items": scoped[:limit], "total": len(scoped)}

    return {"items": [], "total": 0}


def calculate_risk_scores(db: Session, actor_id: int | None = None):
    profiles = repository.list_profiles(db)
    processed = 0
    updated = []
    for profile in profiles:
        scorecard = calculate_risk_score(db, profile.id)
        processed += 1
        updated.append(
            {
                "profile_id": profile.id,
                "profile_name": profile.name,
                "risk_score": scorecard["score"],
                "risk_level": scorecard["risk_level"],
            }
        )
    return {"status": "completed", "processed": processed, "updated": updated, "actor_id": actor_id}


def list_risk_heatmap(db: Session, entity: str | None = None):
    explorer = reconciliation_analytics_explorer(db)
    transactions = explorer.get("transactions") or []
    grouped = {}
    for row in transactions:
        entity_key = row.get("entity") or "Unassigned"
        if entity and entity_key != entity:
            continue
        account_key = row.get("account") or "Unassigned"
        bucket = grouped.setdefault(
            (entity_key, account_key),
            {
                "entity": entity_key,
                "account": account_key,
                "exception_count": 0,
                "variance_amount": 0.0,
                "days_open": 0,
                "account_type": account_key,
                "historical_issues": 0,
            },
        )
        if row.get("exception_id"):
            bucket["exception_count"] += 1
            bucket["historical_issues"] += 1
        bucket["variance_amount"] += abs(float(row.get("match_variance") or 0))
        tx_date = _parse_date_safe(row.get("tx_date"))
        if tx_date:
            bucket["days_open"] = max(bucket["days_open"], (date.today() - tx_date).days)

    entities = sorted({key[0] for key in grouped})
    accounts = sorted({key[1] for key in grouped})
    heatmap = []
    drilldown = []
    for (entity_key, account_key), payload in grouped.items():
        score = _risk_score_from_payload(payload)
        heatmap.append([entities.index(entity_key), accounts.index(account_key), score])
        drilldown.append(
            {
                "entity": entity_key,
                "account": account_key,
                "risk_score": score,
                "risk_level": _risk_level_from_score(score),
                "exception_count": payload["exception_count"],
                "variance_amount": round(payload["variance_amount"], 2),
            }
        )
    drilldown.sort(key=lambda item: (-item["risk_score"], -item["variance_amount"], item["entity"], item["account"]))
    return {"entities": entities, "accounts": accounts, "heatmap": heatmap, "drilldown": drilldown}


def get_governance_policies(db: Session):
    workflows = repository.list_certification_workflows(db)
    seen_users = {
        "preparer_ids": sorted({wf.preparer_id for wf in workflows if wf.preparer_id}),
        "reviewer_ids": sorted({wf.reviewer_id for wf in workflows if wf.reviewer_id}),
        "approver_ids": sorted({wf.approver_id for wf in workflows if wf.approver_id}),
        "certifier_ids": sorted({wf.certifier_id for wf in workflows if wf.certifier_id}),
    }

    # Query actual compliance policies from DB for approval_policies
    db_policies = db.query(CompliancePolicy).filter(CompliancePolicy.is_active == True).all()
    if db_policies:
        approval_policies = [
            {
                "risk_level": p.category.upper() if p.category else "LOW",
                "required_approvals": p.violation_threshold if p.violation_threshold else 1,
            }
            for p in db_policies
        ]
    else:
        # Fallback to static defaults when no policies exist in DB
        approval_policies = [
            {"risk_level": "LOW", "required_approvals": 1},
            {"risk_level": "MEDIUM", "required_approvals": 1},
            {"risk_level": "HIGH", "required_approvals": 2},
            {"risk_level": "CRITICAL", "required_approvals": 3},
        ]

    # Active compliance controls from DB
    compliance_controls = [
        {
            "id": p.id,
            "project_id": p.project_id,
            "control_name": p.control_name,
            "category": p.category,
            "violation_threshold": p.violation_threshold,
            "current_violations": p.current_violations,
            "is_active": p.is_active,
            "created_by": p.created_by,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in db_policies
    ]

    # Active approval rules from DB
    db_rules = db.query(ApprovalRule).filter(ApprovalRule.is_active == True).all()
    approval_rules = [
        {
            "id": r.id,
            "project_id": r.project_id,
            "condition_field": r.condition_field,
            "condition_operator": r.condition_operator,
            "condition_value": r.condition_value,
            "action": r.action,
            "target_role": r.target_role,
            "is_active": r.is_active,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in db_rules
    ]

    return {
        "segregation_of_duties": [
            {"rule": "Preparer != Reviewer", "field_a": "preparer_id", "field_b": "reviewer_id", "enabled": True},
            {"rule": "Reviewer != Approver", "field_a": "reviewer_id", "field_b": "approver_id", "enabled": True},
            {"rule": "Approver != Certifier", "field_a": "approver_id", "field_b": "certifier_id", "enabled": True},
        ],
        "approval_policies": approval_policies,
        "compliance_controls": compliance_controls,
        "approval_rules": approval_rules,
        "workflow_population": seen_users,
    }


def upsert_governance_policy(db: Session, payload: dict, actor_id: int | None = None):
    return {"status": "ok", "policy": payload, "updated_by": actor_id}


def enforce_approval_policy(db: Session, action: dict, actor_id: int | None = None):
    risk = (action.get("risk_level") or "LOW").upper()

    # Try to find a matching active ApprovalRule from the DB
    rule = (
        db.query(ApprovalRule)
        .filter(
            ApprovalRule.condition_field == "risk_level",
            ApprovalRule.condition_value == risk,
            ApprovalRule.is_active == True,
        )
        .first()
    )

    if rule:
        # Parse required approvals from the rule's action field
        try:
            required = int(rule.action)
        except (ValueError, TypeError):
            required = 1
    else:
        # Fallback to original hardcoded logic
        required = 1
        if risk == "HIGH":
            required = 2
        elif risk == "CRITICAL":
            required = 3

    current = int(action.get("current_approvals") or 0)
    return {
        "risk_level": risk,
        "required_approvals": required,
        "current_approvals": current,
        "is_satisfied": current >= required,
        "checked_by": actor_id,
    }


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


def _risk_level_from_score(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _risk_score_from_payload(payload: dict) -> float:
    exception_count = float(payload.get("exception_count") or 0)
    variance_amount = abs(float(payload.get("variance_amount") or 0))
    days_open = float(payload.get("days_open") or 0)
    historical_issues = float(payload.get("historical_issues") or 0)
    account_type = str(payload.get("account_type") or "").upper()

    score = 0.0
    score += min(exception_count * 8, 32)
    score += min(variance_amount / 10000, 28)
    score += min(days_open * 1.5, 20)
    score += min(historical_issues * 5, 15)
    if any(marker in account_type for marker in ["SUSPENSE", "INTERCOMPANY", "CLEARING", "PAYABLE", "RECEIVABLE"]):
        score += 8
    return round(min(score, 100.0), 2)


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

    profile.risk_classification = _risk_level_from_score(score)
    db.commit()
    return {
        "profile_id": profile_id,
        "risk_score": score,
        "score": score,
        "risk_classification": profile.risk_classification,
        "risk_level": profile.risk_classification,
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
    allowed_db_hosts = _host_allowlist(settings.ALLOWED_DB_IMPORT_HOSTS)
    allowed_api_hosts = _host_allowlist(settings.ALLOWED_API_IMPORT_HOSTS)
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
        _enforce_allowed_host(payload["connection_url"], allowed_db_hosts, "Database import")
        engine = create_engine(payload["connection_url"])
        with engine.connect() as conn:
            df = pd.read_sql(text(payload["query"]), conn)
    elif st == "api":
        method = payload.get("method", "GET").upper()
        _enforce_allowed_host(payload["endpoint"], allowed_api_hosts, "API import")
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


def classify_exception(db: Session, exception_id: int, classification: str | None, root_cause: str | None, severity: str | None, comments: str | None, actor_id: int | None):
    ex = db.query(ExceptionQueueRecord).filter(ExceptionQueueRecord.id == exception_id).first()
    if not ex:
        raise ValueError("Exception not found")
    if classification is not None:
        ex.classification = classification
    if root_cause is not None:
        ex.root_cause = root_cause
    if severity is not None:
        ex.severity = severity
    if comments:
        ex.comments = comments
        ex.root_cause_detail = comments
    ex.updated_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "EXCEPTION_CLASSIFIED", user_id=actor_id, entity_type="exception", entity_id=ex.id, metadata={
        "classification": classification,
        "root_cause": root_cause,
        "severity": severity,
    })
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


def list_exception_comments(db: Session, exception_id: int):
    return (
        db.query(ExceptionComment)
        .filter(ExceptionComment.exception_id == exception_id)
        .order_by(ExceptionComment.created_at.desc())
        .all()
    )


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
    from_ccy = _normalize_currency_code(payload["from_currency"], "from_currency")
    to_ccy = _normalize_currency_code(payload["to_currency"], "to_currency")
    if from_ccy == to_ccy:
        raise ValueError("from_currency and to_currency must be different")
    row = ExchangeRate(
        from_currency=from_ccy,
        to_currency=to_ccy,
        rate=float(payload["rate"]),
        rate_date=payload["rate_date"],
        source=payload.get("source"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def convert_currency(db: Session, amount: float, from_currency: str, to_currency: str, conversion_date: str | None = None):
    from_ccy = _normalize_currency_code(from_currency, "from_currency")
    to_ccy = _normalize_currency_code(to_currency, "to_currency")
    if from_ccy == to_ccy:
        return {"converted_amount": amount, "rate": 1.0, "rate_date": conversion_date, "fx_variance": 0.0}
    q = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_ccy,
        ExchangeRate.to_currency == to_ccy,
    )
    if conversion_date:
        q = q.filter(ExchangeRate.rate_date <= conversion_date)
    rate_row = q.order_by(ExchangeRate.rate_date.desc()).first()
    use_inverse = False
    if not rate_row:
        inverse_q = db.query(ExchangeRate).filter(
            ExchangeRate.from_currency == to_ccy,
            ExchangeRate.to_currency == from_ccy,
        )
        if conversion_date:
            inverse_q = inverse_q.filter(ExchangeRate.rate_date <= conversion_date)
        rate_row = inverse_q.order_by(ExchangeRate.rate_date.desc()).first()
        use_inverse = bool(rate_row)
    if not rate_row:
        raise ValueError("Exchange rate not found for selected currency pair")
    rate_value = (1.0 / float(rate_row.rate)) if use_inverse else float(rate_row.rate)
    converted = amount * rate_value
    return {"converted_amount": converted, "rate": rate_value, "rate_date": rate_row.rate_date, "fx_variance": converted - amount, "inverse_rate_used": use_inverse}


def fx_reconciliation(db: Session, profile_id: int, reporting_currency: str):
    report_ccy = _normalize_currency_code(reporting_currency, "reporting_currency")
    records = repository.get_records_by_profile(db, profile_id)
    details = []
    total_source = 0.0
    total_converted = 0.0
    for rec in records:
        src_amt = rec.amount or 0.0
        total_source += src_amt
        conv = convert_currency(db, src_amt, rec.currency or report_ccy, report_ccy, rec.period)
        total_converted += conv["converted_amount"]
        details.append({"record_id": rec.id, "from_currency": rec.currency, "to_currency": report_ccy, "source_amount": src_amt, "converted_amount": conv["converted_amount"], "fx_variance": conv["fx_variance"], "inverse_rate_used": conv.get("inverse_rate_used", False)})
    return {"profile_id": profile_id, "reporting_currency": report_ccy, "source_total": total_source, "converted_total": total_converted, "fx_variance_total": total_converted - total_source, "details": details}


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


def auto_generate_journal_adjustments(db: Session, payload: dict, actor_id: int | None):
    profile_id = int(payload["profile_id"])
    period_key = payload.get("period_key")
    reporting_currency = payload.get("reporting_currency")
    min_amount = abs(float(payload.get("min_amount") or 0.0))

    records = repository.get_records_by_profile(db, profile_id)
    scoped = [r for r in records if (r.status or "").upper() in {"UNMATCHED", "PARTIAL_MATCH"}]
    if period_key:
        scoped = [r for r in scoped if (r.period or "") == period_key]

    grouped = {}
    for rec in scoped:
        key = (rec.account or "UNASSIGNED", rec.currency or "USD", rec.period or period_key or "N/A")
        grouped[key] = grouped.get(key, 0.0) + float(rec.amount or 0.0)

    created = []
    for (account, currency, rec_period), total in grouped.items():
        if abs(total) < min_amount:
            continue
        row_payload = {
            "profile_id": profile_id,
            "period_key": rec_period,
            "account": account,
            "currency": currency,
            "amount": total,
            "functional_currency": currency,
            "reporting_currency": reporting_currency or currency,
            "reason": f"Auto-generated from unresolved reconciliation variance ({len(scoped)} records in scope)",
        }
        created_row = create_journal_adjustment(db, row_payload, actor_id)
        created.append(
            {
                "adjustment_id": created_row.id,
                "account": created_row.account,
                "currency": created_row.currency,
                "amount": created_row.amount,
                "converted_amount": created_row.converted_amount,
                "status": created_row.status,
            }
        )

    return {
        "profile_id": profile_id,
        "period_key": period_key,
        "created_count": len(created),
        "items": created,
    }


def variance_analysis(db: Session, profile_id: int):
    from ..models.models import ReconciliationBalance
    balance = db.query(ReconciliationBalance).filter(ReconciliationBalance.profile_id == profile_id).first()
    
    if balance:
        source_balance = float(balance.source_balance or 0.0)
        target_balance = float(balance.target_balance or 0.0)
        balance_delta = float(balance.variance_amount or 0.0)
    else:
        records = repository.get_records_by_profile(db, profile_id)
        source_balance = sum(max(float(r.amount or 0.0), 0.0) for r in records)
        target_balance = sum(abs(min(float(r.amount or 0.0), 0.0)) for r in records)
        balance_delta = source_balance - target_balance
        
    records = repository.get_records_by_profile(db, profile_id)
    unmatched = [r for r in records if (r.status or "").upper() in {"UNMATCHED", "PARTIAL_MATCH"}]
    unmatched_total = sum(abs(float(r.amount or 0.0)) for r in unmatched)
    
    return {
        "profile_id": profile_id,
        "source_balance_difference": balance_delta,
        "source_balance": round(source_balance, 2),
        "target_balance": round(target_balance, 2),
        "total_variance": round(abs(balance_delta), 2),
        "unmatched_amount": unmatched_total,
        "adjustment_recommendation": "Create journal adjustment" if abs(balance_delta) > 0 else "No adjustment needed",
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


def profile_transactions_analytics(db: Session, profile_id: int):
    profile = db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()
    if not profile:
        raise ValueError("Reconciliation profile not found")

    records = db.query(ReconciliationRecord).filter(ReconciliationRecord.profile_id == profile_id).all()
    if not records:
        return []

    record_ids = [r.id for r in records]
    mgi_rows = (
        db.query(MatchGroupItem, MatchGroup)
        .join(MatchGroup, MatchGroupItem.match_group_id == MatchGroup.id)
        .filter(MatchGroupItem.reconciliation_record_id.in_(record_ids))
        .all()
    )
    group_by_record = {
        mgi.reconciliation_record_id: mg
        for mgi, mg in mgi_rows
    }
    group_ids = list({mg.id for _, mg in mgi_rows})
    exceptions = (
        db.query(ExceptionQueueRecord)
        .filter(ExceptionQueueRecord.match_group_id.in_(group_ids))
        .all()
        if group_ids
        else []
    )
    exception_by_group = {e.match_group_id: e for e in exceptions}

    attachment_counts = {}
    for row in (
        db.query(
            ReconciliationAttachment.reconciliation_record_id,
            text("count(*) as cnt"),
        )
        .filter(ReconciliationAttachment.reconciliation_record_id.in_(record_ids))
        .group_by(ReconciliationAttachment.reconciliation_record_id)
        .all()
    ):
        attachment_counts[row[0]] = int(row[1] or 0)

    out = []
    for record in records:
        match_group = group_by_record.get(record.id)
        exception = exception_by_group.get(match_group.id) if match_group else None
        out.append(
            {
                "record_id": record.id,
                "profile_id": record.profile_id,
                "entity": record.entity,
                "account": record.account,
                "period": record.period,
                "reference": record.reference,
                "amount": record.amount,
                "currency": record.currency,
                "tx_date": record.tx_date,
                "status": record.status,
                "match_group_id": match_group.id if match_group else None,
                "match_classification": match_group.classification if match_group else None,
                "match_confidence": match_group.confidence if match_group else None,
                "match_variance": match_group.variance_amount if match_group else None,
                "exception_id": exception.id if exception else None,
                "exception_status": exception.status if exception else None,
                "exception_queue_type": exception.queue_type if exception else None,
                "exception_classification": exception.classification if exception else None,
                "evidence_count": attachment_counts.get(record.id, 0),
            }
        )
    return out


def reconciliation_analytics_explorer(db: Session, role: str | None = None, user_id: int | None = None):
    profiles = repository.list_profiles(db, role=role, user_id=user_id)
    if not profiles:
        return {"profiles": [], "transactions": [], "exceptions": []}

    profile_ids = [p.id for p in profiles]
    records = db.query(ReconciliationRecord).filter(ReconciliationRecord.profile_id.in_(profile_ids)).all()
    if not records:
        return {"profiles": profiles, "transactions": [], "exceptions": []}

    record_ids = [r.id for r in records]
    mgi_rows = (
        db.query(MatchGroupItem, MatchGroup)
        .join(MatchGroup, MatchGroupItem.match_group_id == MatchGroup.id)
        .filter(MatchGroupItem.reconciliation_record_id.in_(record_ids))
        .all()
    )
    group_by_record = {mgi.reconciliation_record_id: mg for mgi, mg in mgi_rows}
    group_ids = list({mg.id for _, mg in mgi_rows})

    all_exceptions = list_exceptions(db, None, role, user_id)
    exception_by_group = {e.match_group_id: e for e in all_exceptions if e.match_group_id in group_ids}
    scoped_exceptions = list(exception_by_group.values())

    attachment_counts = {}
    for row in (
        db.query(
            ReconciliationAttachment.reconciliation_record_id,
            text("count(*) as cnt"),
        )
        .filter(ReconciliationAttachment.reconciliation_record_id.in_(record_ids))
        .group_by(ReconciliationAttachment.reconciliation_record_id)
        .all()
    ):
        attachment_counts[row[0]] = int(row[1] or 0)

    profile_meta = {
        p.id: {
            "profile_id": p.id,
            "name": p.name,
            "risk_classification": p.risk_classification,
            "lifecycle_state": p.lifecycle_state,
            "reconciliation_type": p.reconciliation_type,
            "frequency": p.frequency,
            "due_days": p.due_days,
            "assigned_preparer": p.assigned_preparer,
            "assigned_reviewer": p.assigned_reviewer,
            "assigned_approver": p.assigned_approver,
            "assigned_certifier": p.assigned_certifier,
        }
        for p in profiles
    }

    # Load mappings
    from ..models.models import Mapping
    import json
    mappings_by_project = {}
    for p in profiles:
        if p.project_id not in mappings_by_project:
            mappings_by_project[p.project_id] = db.query(Mapping).filter(Mapping.project_id == p.project_id).all()

    transactions = []
    for record in records:
        match_group = group_by_record.get(record.id)
        exception = exception_by_group.get(match_group.id) if match_group else None
        
        entity = record.entity
        account = record.account
        
        p_obj = next((p for p in profiles if p.id == record.profile_id), None)
        if p_obj and p_obj.project_id in mappings_by_project:
            project_mappings = mappings_by_project[p_obj.project_id]
            if project_mappings:
                try:
                    payload = json.loads(record.payload_json) if record.payload_json else {}
                    entity_candidates = []
                    account_candidates = []
                    for m in project_mappings:
                        src_name = (m.source_column or "").lower()
                        tgt_name = (m.target_column or "").lower()
                        if any(token in src_name for token in ("entity", "company", "business_unit", "bu", "emp_id")):
                            entity_candidates.append(m.source_column)
                        if any(token in tgt_name for token in ("entity", "company", "business_unit", "bu", "emp_id")):
                            entity_candidates.append(m.target_column)
                        if any(token in src_name for token in ("account", "gl", "ledger", "acct")):
                            account_candidates.append(m.source_column)
                        if any(token in tgt_name for token in ("account", "gl", "ledger", "acct")):
                            account_candidates.append(m.target_column)

                    key_mappings = [m for m in project_mappings if m.is_key_field]
                    if key_mappings and not entity_candidates:
                        entity_candidates.append(key_mappings[0].source_column)
                        entity_candidates.append(key_mappings[0].target_column)

                    derived_entity = None
                    for col in entity_candidates:
                        if col and col in payload:
                            derived_entity = str(payload[col])
                            break
                    derived_account = None
                    for col in account_candidates:
                        if col and col in payload:
                            derived_account = str(payload[col])
                            break

                    entity = derived_entity or entity
                    account = derived_account or account
                except Exception:
                    pass

        transactions.append(
            {
                "record_id": record.id,
                "profile_id": record.profile_id,
                "entity": entity,
                "account": account,
                "period": record.period,
                "reference": record.reference,
                "amount": record.amount,
                "currency": record.currency,
                "tx_date": record.tx_date,
                "status": record.status,
                "match_group_id": match_group.id if match_group else None,
                "match_classification": match_group.classification if match_group else None,
                "match_confidence": match_group.confidence if match_group else None,
                "match_variance": match_group.variance_amount if match_group else None,
                "exception_id": exception.id if exception else None,
                "exception_status": exception.status if exception else None,
                "exception_queue_type": exception.queue_type if exception else None,
                "exception_classification": exception.classification if exception else None,
                "evidence_count": attachment_counts.get(record.id, 0),
                "profile": profile_meta.get(record.profile_id),
            }
        )

    return {
        "profiles": profiles,
        "transactions": transactions,
        "exceptions": scoped_exceptions,
    }


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


def upsert_enterprise_setting(db: Session, payload: dict, actor_id: int | None):
    row = db.query(EnterpriseSetting).filter(
        EnterpriseSetting.category == payload["category"],
        EnterpriseSetting.key == payload["key"],
    ).first()
    if not row:
        row = EnterpriseSetting(category=payload["category"], key=payload["key"])
        db.add(row)
    row.value_json = json.dumps(payload.get("value") or {})
    row.description = payload.get("description")
    row.updated_by = actor_id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def list_enterprise_settings(db: Session, category: str | None = None):
    q = db.query(EnterpriseSetting)
    if category:
        q = q.filter(EnterpriseSetting.category == category)
    return q.order_by(EnterpriseSetting.category.asc(), EnterpriseSetting.key.asc()).all()


def create_retention_policy(db: Session, payload: dict, actor_id: int | None):
    row = ReconciliationRetentionPolicy(
        name=payload["name"],
        retention_days=int(payload.get("retention_days", 365)),
        purge_after_days=int(payload.get("purge_after_days", 730)),
        preserve_for_compliance=bool(payload.get("preserve_for_compliance", True)),
        active=True,
        created_by=actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_retention_policies(db: Session):
    return db.query(ReconciliationRetentionPolicy).order_by(ReconciliationRetentionPolicy.created_at.desc()).all()


def create_dependency(db: Session, payload: dict, actor_id: int | None):
    row = ReconciliationDependency(
        parent_profile_id=payload["parent_profile_id"],
        child_profile_id=payload["child_profile_id"],
        dependency_type=payload.get("dependency_type", "close_process"),
        is_blocking=bool(payload.get("is_blocking", True)),
        created_by=actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_dependencies(db: Session, profile_id: int | None = None):
    q = db.query(ReconciliationDependency)
    if profile_id:
        q = q.filter(
            (ReconciliationDependency.parent_profile_id == profile_id) |
            (ReconciliationDependency.child_profile_id == profile_id)
        )
    return q.order_by(ReconciliationDependency.created_at.desc()).all()


def archive_period(db: Session, profile_id: int, period_key: str, actor_id: int | None):
    rows = db.query(ReconciliationRecord).filter(
        ReconciliationRecord.profile_id == profile_id,
        ReconciliationRecord.period == period_key,
    ).all()
    payload = [
        {"id": r.id, "status": r.status, "amount": r.amount, "payload_json": r.payload_json}
        for r in rows
    ]
    archive = ReconciliationArchive(
        profile_id=profile_id,
        period_key=period_key,
        archive_payload_json=json.dumps(payload),
        archived_by=actor_id,
    )
    db.add(archive)
    for r in rows:
        r.status = "ARCHIVED"
    db.commit()
    db.refresh(archive)
    return {"archive_id": archive.id, "records_archived": len(rows)}


def restore_archive(db: Session, archive_id: int, actor_id: int | None):
    archive = db.query(ReconciliationArchive).filter(ReconciliationArchive.id == archive_id).first()
    if not archive:
        raise ValueError("Archive not found")
    rows = json.loads(archive.archive_payload_json or "[]")
    restored = 0
    for item in rows:
        rec = db.query(ReconciliationRecord).filter(ReconciliationRecord.id == item.get("id")).first()
        if rec:
            rec.status = item.get("status") or "VALIDATED"
            rec.amount = item.get("amount", rec.amount)
            restored += 1
    archive.restore_count = int(archive.restore_count or 0) + 1
    archive.restored_at = datetime.utcnow()
    db.commit()
    audit_service.log_action(db, "ARCHIVE_RESTORED", user_id=actor_id, entity_type="archive", entity_id=archive_id, metadata={"restored": restored})
    return {"archive_id": archive_id, "restored_records": restored}


def create_backup(db: Session, actor_id: int | None, backup_type: str = "full"):
    backup_dir = EVIDENCE_UPLOAD_DIR.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    backup_path = backup_dir / f"drms_{backup_type}_{stamp}.zip"
    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
        db_url = settings.DATABASE_URL
        if db_url.startswith("sqlite:///"):
            db_file = Path(db_url.replace("sqlite:///", ""))
            if db_file.exists():
                zf.write(db_file, arcname=f"database/{db_file.name}")
        if EVIDENCE_UPLOAD_DIR.exists():
            for p in EVIDENCE_UPLOAD_DIR.rglob("*"):
                if p.is_file():
                    zf.write(p, arcname=f"evidence/{p.relative_to(EVIDENCE_UPLOAD_DIR)}")
    checksum = hashlib.sha256(backup_path.read_bytes()).hexdigest()
    row = BackupRecord(
        backup_type=backup_type,
        target_path=str(backup_path),
        checksum=checksum,
        status="COMPLETED",
        created_by=actor_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def run_retention_cycle(db: Session):
    policy = db.query(ReconciliationRetentionPolicy).filter(ReconciliationRetentionPolicy.active == True).order_by(ReconciliationRetentionPolicy.created_at.desc()).first()
    if not policy:
        return {"archived": 0, "purged": 0, "policy": None}
    now = datetime.utcnow()
    archived = 0
    purged = 0
    for rec in db.query(ReconciliationRecord).all():
        age_days = (now - rec.created_at).days if rec.created_at else 0
        if age_days >= policy.retention_days and (rec.status or "").upper() != "ARCHIVED":
            rec.status = "ARCHIVED"
            archived += 1
        if (not policy.preserve_for_compliance) and age_days >= policy.purge_after_days:
            db.delete(rec)
            purged += 1
    db.commit()
    return {"archived": archived, "purged": purged, "policy": policy.name}


def record_job_metric(db: Session, job_name: str, status: str, duration_ms: int | None = None, message: str | None = None):
    metric = JobMetric(job_name=job_name, status=status, duration_ms=duration_ms, message=message)
    db.add(metric)
    db.commit()
    return metric


def get_job_metrics(db: Session, limit: int = 100):
    rows = db.query(JobMetric).order_by(JobMetric.executed_at.desc()).limit(limit).all()
    dashboard = {}
    for row in rows:
        stats = dashboard.setdefault(row.job_name, {"runs": 0, "failed": 0, "avg_duration_ms": 0})
        stats["runs"] += 1
        if row.status.upper() != "COMPLETED":
            stats["failed"] += 1
        if row.duration_ms:
            prev_sum = stats["avg_duration_ms"] * (stats["runs"] - 1)
            stats["avg_duration_ms"] = round((prev_sum + row.duration_ms) / stats["runs"], 2)
    return {"recent_runs": rows, "dashboard": dashboard}


# ═══════════════════════════════════════════════════════════════
#  ADVANCED MATCHING ENGINE INTEGRATION
# ═══════════════════════════════════════════════════════════════

def run_advanced_matching(
    db: Session,
    profile_id: int,
    auto_match_threshold: float = 0.92,
    cross_period_days: int = 90,
    user_id: int | None = None,
) -> dict:
    """
    Runs the 4-phase advanced matching engine:
    Phase 1 — candidate generation with amount bucketing
    Phase 2 — 1:1 holistic scoring (amount + date + reference + description + entity)
    Phase 3a — many-to-one group resolution
    Phase 3b — one-to-many (split) resolution
    Phase 3c — cross-period settlement matching
    Phase 4 — unmatched → exception queue
    """
    from ..services.matching_engine import AdvancedMatchingEngine

    profile = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.id == profile_id
    ).first()
    if not profile:
        raise ValueError("Profile not found")

    # ── Period lock check ────────────────────────────────────
    cal = db.query(FinancialCloseCalendar).filter(
        FinancialCloseCalendar.profile_id == profile_id
    ).order_by(FinancialCloseCalendar.period_key.desc()).first()
    if cal and cal.is_locked:
        raise ValueError(
            f"Period {cal.period_key} is locked. Matching cannot be run on a locked period."
        )

    engine = AdvancedMatchingEngine(
        profile=profile,
        auto_match_threshold=auto_match_threshold,
        cross_period_days=cross_period_days,
    )
    return engine.run(db, profile_id=profile_id, user_id=user_id)


def get_match_suggestions_advanced(
    db: Session,
    profile_id: int,
    top_k: int = 25,
    min_confidence: float = 0.50,
) -> dict:
    """
    Surface AI-style suggestions for unmatched records without committing matches.
    """
    from ..services.matching_engine import (
        AdvancedMatchingEngine, RecordView
    )
    from ..models.models import ReconciliationRecord as RR

    profile = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.id == profile_id
    ).first()
    if not profile:
        raise ValueError("Profile not found")

    unmatched = (
        db.query(RR)
        .filter(RR.profile_id == profile_id, RR.status == "UNMATCHED")
        .all()
    )
    all_records = (
        db.query(RR)
        .filter(RR.profile_id == profile_id)
        .all()
    )

    engine = AdvancedMatchingEngine(profile)
    src_views = [RecordView.from_orm(r) for r in unmatched]
    tgt_views = [RecordView.from_orm(r) for r in all_records if r.status != "UNMATCHED"]
    consumed_tgt: set = set()

    items = engine.suggestions(src_views, tgt_views, consumed_tgt, top_k=top_k)
    items = [i for i in items if i["confidence"] >= min_confidence]
    return {"profile_id": profile_id, "items": items, "total": len(items)}


# ═══════════════════════════════════════════════════════════════
#  PERIOD LOCK ENFORCEMENT SERVICE
# ═══════════════════════════════════════════════════════════════

def _assert_period_unlocked(db: Session, profile_id: int, period_key: str | None = None):
    """
    Raise ValueError if the relevant close calendar period is locked.
    Called before any write operation on reconciliation data.
    """
    q = db.query(FinancialCloseCalendar).filter(
        FinancialCloseCalendar.profile_id == profile_id,
        FinancialCloseCalendar.is_locked == True,
    )
    if period_key:
        q = q.filter(FinancialCloseCalendar.period_key == period_key)
    locked = q.first()
    if locked:
        raise ValueError(
            f"Period {locked.period_key} is locked and cannot accept new data. "
            "Contact your administrator to unlock this period."
        )


def lock_period(db: Session, calendar_id: int, actor_id: int) -> dict:
    """Lock a close calendar period — prevents all writes."""
    cal = db.query(FinancialCloseCalendar).filter(
        FinancialCloseCalendar.id == calendar_id
    ).first()
    if not cal:
        raise ValueError("Calendar entry not found")
    if cal.is_locked:
        raise ValueError("Period is already locked")

    cal.is_locked    = True
    cal.locked_by    = actor_id
    cal.locked_at    = datetime.utcnow()
    cal.status       = "CLOSED"
    db.commit()

    audit_service.log_action(
        db, "PERIOD_LOCKED",
        user_id=actor_id,
        entity_type="close_calendar",
        entity_id=calendar_id,
        metadata={"period_key": cal.period_key, "profile_id": cal.profile_id},
    )
    return {"calendar_id": calendar_id, "period_key": cal.period_key, "locked": True}


def unlock_period(db: Session, calendar_id: int, actor_id: int, reason: str) -> dict:
    """Unlock a period — requires ADMIN role and an explicit reason."""
    cal = db.query(FinancialCloseCalendar).filter(
        FinancialCloseCalendar.id == calendar_id
    ).first()
    if not cal:
        raise ValueError("Calendar entry not found")
    if not cal.is_locked:
        raise ValueError("Period is not locked")

    cal.is_locked    = False
    cal.locked_by    = None
    cal.locked_at    = None
    cal.status       = "IN_PROGRESS"
    db.commit()

    audit_service.log_action(
        db, "PERIOD_UNLOCKED",
        user_id=actor_id,
        entity_type="close_calendar",
        entity_id=calendar_id,
        metadata={"period_key": cal.period_key, "reason": reason},
    )
    return {"calendar_id": calendar_id, "period_key": cal.period_key, "locked": False}


# ═══════════════════════════════════════════════════════════════
#  EXECUTIVE DASHBOARD — real enterprise data
# ═══════════════════════════════════════════════════════════════

def get_executive_dashboard_real(db: Session) -> dict:
    """
    Full executive dashboard from enterprise tables.
    Replaces the project-based ExecutiveDashboard.
    """
    from ..models.models import (
        ReconciliationProfile, MatchGroup, ExceptionQueueRecord,
        CertificationWorkflow, FinancialCloseCalendar,
    )
    from sqlalchemy import func as sqlfunc

    today = date.today()

    profiles  = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True).all()
    certs     = db.query(CertificationWorkflow).all()
    calendars = db.query(FinancialCloseCalendar).all()

    total_profiles    = len(profiles)
    certified_count   = len([p for p in profiles if (p.lifecycle_state or "").upper() in ("CERTIFIED", "CLOSED")])
    in_progress_count = len([p for p in profiles if (p.lifecycle_state or "").upper() in ("IN_PROGRESS", "PREPARED", "UNDER_REVIEW")])
    open_count        = len([p for p in profiles if (p.lifecycle_state or "").upper() == "OPEN"])
    certification_pct = round(certified_count / total_profiles * 100, 1) if total_profiles else 0.0

    # Match stats
    total_mg  = db.query(MatchGroup).count()
    full_mg   = db.query(MatchGroup).filter(MatchGroup.classification == "FULL_MATCH").count()
    auto_match_rate = round(full_mg / total_mg * 100, 1) if total_mg else 0.0
    unexplained_variance = db.query(sqlfunc.sum(sqlfunc.abs(MatchGroup.variance_amount))).scalar() or 0.0

    # Exception stats
    total_exc = db.query(ExceptionQueueRecord).count()
    open_exc  = db.query(ExceptionQueueRecord).filter(
        ExceptionQueueRecord.status.notin_(["RESOLVED", "CLOSED"])
    ).count()
    escalated = db.query(ExceptionQueueRecord).filter(
        ExceptionQueueRecord.status == "ESCALATED"
    ).count()

    # Overdue periods
    overdue = 0
    for c in calendars:
        if c.is_locked:
            continue
        try:
            due = date.fromisoformat(c.due_date)
            if today > due:
                overdue += 1
        except Exception:
            pass

    # Risk breakdown
    risk_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for p in profiles:
        r = (p.risk_classification or "MEDIUM").upper()
        risk_counts[r] = risk_counts.get(r, 0) + 1

    # Pending certifications by stage
    pending_by_stage = {}
    for c in certs:
        if (c.status or "").upper() not in ("CERTIFIED", "CLOSED", "FORCE_CLOSED"):
            stage = c.current_stage or "UNKNOWN"
            pending_by_stage[stage] = pending_by_stage.get(stage, 0) + 1

    # Workflow SLA — certs overdue
    certs_overdue = 0
    for c in certs:
        if (c.status or "").upper() in ("CERTIFIED", "CLOSED"):
            continue
        if c.due_date:
            try:
                due = date.fromisoformat(c.due_date)
                if today > due:
                    certs_overdue += 1
            except Exception:
                pass

    # Certification trend (last 6 periods from calendar)
    period_completion = {}
    for cal in calendars:
        if not cal.period_key:
            continue
        ps = period_completion.setdefault(cal.period_key, {"total": 0, "closed": 0})
        ps["total"] += 1
        if cal.is_locked or (cal.status or "").upper() in ("CLOSED", "CERTIFIED"):
            ps["closed"] += 1
    cert_trend = sorted(
        [{"period": k, **v, "pct": round(v["closed"] / v["total"] * 100, 1) if v["total"] else 0}
         for k, v in period_completion.items()],
        key=lambda x: x["period"]
    )[-6:]

    # High risk profiles
    high_risk_profiles = [
        {
            "id": p.id, "name": p.name,
            "risk": p.risk_classification,
            "type": p.reconciliation_type,
            "state": p.lifecycle_state,
        }
        for p in profiles
        if (p.risk_classification or "").upper() in ("HIGH", "CRITICAL")
    ][:10]

    return {
        "profile_summary": {
            "total": total_profiles,
            "certified": certified_count,
            "in_progress": in_progress_count,
            "open": open_count,
            "certification_pct": certification_pct,
        },
        "matching": {
            "total_groups": total_mg,
            "full_matches": full_mg,
            "auto_match_rate": auto_match_rate,
        },
        "exceptions": {
            "total": total_exc,
            "open": open_exc,
            "escalated": escalated,
        },
        "close_management": {
            "overdue_periods": overdue,
            "certs_overdue": certs_overdue,
            "pending_by_stage": pending_by_stage,
        },
        "risk_breakdown":       risk_counts,
        "certification_trend":  cert_trend,
        "high_risk_profiles":   high_risk_profiles,
        "auto_match_rate":      auto_match_rate,
        "unexplained_variance": unexplained_variance,
    }


def get_risk_dashboard_real(db: Session) -> dict:
    """
    Real risk dashboard from enterprise reconciliation data.
    """
    from ..models.models import (
        ReconciliationProfile, MatchGroup, ExceptionQueueRecord,
        CertificationWorkflow,
    )
    today = date.today()

    profiles  = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True).all()
    match_groups = db.query(MatchGroup).all()
    exceptions   = db.query(ExceptionQueueRecord).all()

    # Risk score per profile
    profile_risk = []
    for p in profiles:
        p_mgs = [mg for mg in match_groups if mg.profile_id == p.id]
        p_exc = [e for e in exceptions if any(
            mg.id == e.match_group_id for mg in p_mgs
        )]
        total_mg   = len(p_mgs)
        unmatched  = len([mg for mg in p_mgs if mg.classification == "UNMATCHED"])
        open_exc   = len([e for e in p_exc if (e.status or "").upper() not in ("RESOLVED", "CLOSED")])
        variance   = sum(abs(float(mg.variance_amount or 0)) for mg in p_mgs)

        # Risk score 0–100
        base_risk  = {"LOW": 10, "MEDIUM": 30, "HIGH": 60, "CRITICAL": 90}.get(
            (p.risk_classification or "MEDIUM").upper(), 30
        )
        unmatched_factor = (unmatched / total_mg * 30) if total_mg else 0
        exc_factor = min(open_exc * 5, 30)
        risk_score = min(round(base_risk + unmatched_factor + exc_factor), 100)

        profile_risk.append({
            "id": p.id,
            "name": p.name,
            "risk_classification": p.risk_classification or "MEDIUM",
            "risk_score": risk_score,
            "total_records": total_mg,
            "unmatched": unmatched,
            "open_exceptions": open_exc,
            "variance_amount": round(variance, 2),
            "lifecycle_state": p.lifecycle_state or "OPEN",
            "reconciliation_type": p.reconciliation_type or "",
        })

    profile_risk.sort(key=lambda x: -x["risk_score"])

    # Exception aging by risk level
    aging_by_risk = {"LOW": [], "MEDIUM": [], "HIGH": [], "CRITICAL": []}
    for exc in exceptions:
        if (exc.status or "").upper() in ("RESOLVED", "CLOSED"):
            continue
        if not exc.created_at:
            continue
        days = (today - exc.created_at.date()).days
        # Find the profile risk for this exception
        mg = next((mg for mg in match_groups if mg.id == exc.match_group_id), None)
        if mg:
            prof = next((p for p in profiles if p.id == mg.profile_id), None)
            risk = (prof.risk_classification if prof else "MEDIUM") or "MEDIUM"
            aging_by_risk[risk.upper()].append(days)

    aging_summary = {
        risk: {
            "count": len(days),
            "avg_days": round(sum(days) / len(days), 1) if days else 0,
            "max_days": max(days) if days else 0,
        }
        for risk, days in aging_by_risk.items()
    }

    # SOD violations (preparer == reviewer)
    sod_violations = []
    for p in profiles:
        if p.assigned_preparer and p.assigned_preparer == p.assigned_reviewer:
            sod_violations.append({
                "profile_id": p.id,
                "profile_name": p.name,
                "violation": "Preparer equals Reviewer",
                "severity": "HIGH",
            })
        if p.assigned_reviewer and p.assigned_reviewer == p.assigned_approver:
            sod_violations.append({
                "profile_id": p.id,
                "profile_name": p.name,
                "violation": "Reviewer equals Approver",
                "severity": "HIGH",
            })

    # Overdue high risk
    overdue_high_risk = []
    certs = db.query(CertificationWorkflow).filter(
        CertificationWorkflow.status.notin_(["CERTIFIED", "CLOSED"])
    ).all()
    for c in certs:
        if not c.due_date:
            continue
        try:
            due = date.fromisoformat(c.due_date)
            if today <= due:
                continue
        except Exception:
            continue
        prof = next((p for p in profiles if p.id == c.profile_id), None)
        if prof and (prof.risk_classification or "").upper() in ("HIGH", "CRITICAL"):
            overdue_high_risk.append({
                "profile_id": c.profile_id,
                "profile_name": prof.name if prof else f"Profile #{c.profile_id}",
                "due_date": c.due_date,
                "days_overdue": (today - due).days,
                "risk": prof.risk_classification if prof else "HIGH",
            })

    return {
        "profile_risk_scores": profile_risk[:50],
        "risk_breakdown": {
            k: len([p for p in profiles if (p.risk_classification or "").upper() == k])
            for k in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        },
        "exception_aging_by_risk": aging_summary,
        "sod_violations": sod_violations[:20],
        "overdue_high_risk": overdue_high_risk[:20],
        "total_risk_score": round(
            sum(p["risk_score"] for p in profile_risk) / len(profile_risk), 1
        ) if profile_risk else 0,
    }
