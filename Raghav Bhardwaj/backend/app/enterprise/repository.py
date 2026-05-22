import json
from datetime import datetime
from sqlalchemy.orm import Session

from ..models.models import (
    IngestionBatch,
    RawStagingRecord,
    TransformedStagingRecord,
    ValidationErrorRecord,
    ReconciliationProfile,
    ReconciliationRecord,
    MatchGroup,
    MatchGroupItem,
    ExceptionQueueRecord,
    FinancialCloseCalendar,
    CertificationWorkflow,
    CertificationWorkflowHistory,
    ReconciliationRuleDefinition,
    ReminderLog,
)
from sqlalchemy import or_


def create_batch(db: Session, batch_id: str, source_system: str, metadata: dict, user_id: int | None):
    batch = IngestionBatch(
        batch_id=batch_id,
        source_system=source_system,
        ingestion_timestamp=datetime.utcnow(),
        metadata_json=json.dumps(metadata or {}),
        ingestion_status="NEW",
        created_by=user_id,
    )
    db.add(batch)
    db.commit()
    return batch


def add_raw_records(db: Session, batch_id: str, source_system: str, records: list[dict]):
    db.add_all(
        [
            RawStagingRecord(batch_id=batch_id, source_system=source_system, payload_json=json.dumps(r))
            for r in records
        ]
    )
    db.commit()


def get_raw_records(db: Session, batch_id: str):
    return db.query(RawStagingRecord).filter(RawStagingRecord.batch_id == batch_id).all()


def replace_transformed_records(db: Session, batch_id: str, source_system: str, records: list[dict]):
    db.query(TransformedStagingRecord).filter(TransformedStagingRecord.batch_id == batch_id).delete()
    db.add_all(
        [
            TransformedStagingRecord(batch_id=batch_id, source_system=source_system, payload_json=json.dumps(r))
            for r in records
        ]
    )
    db.commit()


def get_transformed_records(db: Session, batch_id: str):
    return db.query(TransformedStagingRecord).filter(TransformedStagingRecord.batch_id == batch_id).all()


def add_validation_errors(db: Session, batch_id: str, source_system: str, errors: list[dict]):
    db.add_all(
        [
            ValidationErrorRecord(
                batch_id=batch_id,
                source_system=source_system,
                record_payload_json=json.dumps(e["record"]),
                rejection_reason=e["reason"],
                validation_stage=e["stage"],
            )
            for e in errors
        ]
    )
    db.commit()


def create_profile(db: Session, payload):
    profile = ReconciliationProfile(
        name=payload.name,
        reconciliation_type=payload.reconciliation_type,
        frequency=payload.frequency,
        tolerance_threshold=payload.tolerance_threshold,
        date_window_days=payload.date_window_days,
        workflow_config_json=json.dumps(payload.workflow_config or {}),
        matching_rules_json=json.dumps(payload.matching_rules or {}),
        assigned_preparer=payload.assigned_preparer,
        assigned_reviewer=payload.assigned_reviewer,
        assigned_approver=payload.assigned_approver,
        assigned_certifier=payload.assigned_certifier,
        risk_classification=payload.risk_classification,
        due_days=payload.due_days,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def list_profiles(db: Session, role: str | None = None, user_id: int | None = None):
    query = db.query(ReconciliationProfile)
    normalized_role = (role or "").lower()
    if normalized_role == "approver":
        normalized_role = "reviewer"
    if normalized_role == "preparer":
        query = query.filter(ReconciliationProfile.assigned_preparer == user_id)
    elif normalized_role == "reviewer":
        query = query.filter(
            or_(
                ReconciliationProfile.assigned_reviewer == user_id,
                ReconciliationProfile.assigned_approver == user_id,
            )
        )
    elif normalized_role == "certifier":
        query = query.filter(ReconciliationProfile.assigned_certifier == user_id)
    return query.order_by(ReconciliationProfile.created_at.desc()).all()


def get_profile(db: Session, profile_id: int):
    return db.query(ReconciliationProfile).filter(ReconciliationProfile.id == profile_id).first()


def update_profile(db: Session, profile: ReconciliationProfile, payload: dict):
    for key, value in payload.items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile


def delete_profile(db: Session, profile: ReconciliationProfile):
    db.delete(profile)
    db.commit()


def create_close_calendar(db: Session, payload):
    row = FinancialCloseCalendar(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_close_calendars(db: Session, profile_id: int | None = None):
    q = db.query(FinancialCloseCalendar)
    if profile_id is not None:
        q = q.filter(FinancialCloseCalendar.profile_id == profile_id)
    return q.order_by(FinancialCloseCalendar.created_at.desc()).all()


def get_close_calendar(db: Session, calendar_id: int):
    return db.query(FinancialCloseCalendar).filter(FinancialCloseCalendar.id == calendar_id).first()


def create_certification_workflow(db: Session, payload: dict):
    row = CertificationWorkflow(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_certification_workflow(db: Session, workflow_id: int):
    return db.query(CertificationWorkflow).filter(CertificationWorkflow.id == workflow_id).first()


def list_certification_workflows(db: Session, profile_id: int | None = None):
    q = db.query(CertificationWorkflow)
    if profile_id is not None:
        q = q.filter(CertificationWorkflow.profile_id == profile_id)
    return q.order_by(CertificationWorkflow.updated_at.desc()).all()


def add_certification_history(
    db: Session,
    workflow_id: int,
    actor_id: int | None,
    actor_role: str | None,
    action: str,
    from_status: str | None,
    to_status: str | None,
    comments: str | None,
):
    db.add(
        CertificationWorkflowHistory(
            workflow_id=workflow_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            from_status=from_status,
            to_status=to_status,
            comments=comments,
        )
    )
    db.commit()


def create_rule_definition(db: Session, payload: dict):
    row = ReconciliationRuleDefinition(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_rule_definitions(db: Session, profile_id: int | None = None, template_type: str | None = None):
    q = db.query(ReconciliationRuleDefinition)
    if profile_id is not None:
        q = q.filter(
            (ReconciliationRuleDefinition.profile_id == profile_id)
            | (ReconciliationRuleDefinition.profile_id.is_(None))
        )
    if template_type:
        q = q.filter(ReconciliationRuleDefinition.template_type == template_type)
    return q.order_by(ReconciliationRuleDefinition.updated_at.desc()).all()


def get_rule_definition(db: Session, rule_id: int):
    return db.query(ReconciliationRuleDefinition).filter(ReconciliationRuleDefinition.id == rule_id).first()


def update_rule_definition(db: Session, rule: ReconciliationRuleDefinition, payload: dict):
    for key, value in payload.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule_definition(db: Session, rule: ReconciliationRuleDefinition):
    db.delete(rule)
    db.commit()


def create_reminder_log(db: Session, payload: dict):
    row = ReminderLog(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_reminders(db: Session, workflow_id: int | None = None):
    q = db.query(ReminderLog)
    if workflow_id is not None:
        q = q.filter(ReminderLog.workflow_id == workflow_id)
    return q.order_by(ReminderLog.sent_at.desc()).all()


def load_reconciliation_records(db: Session, rows: list[dict]):
    db.add_all([ReconciliationRecord(**r) for r in rows])
    db.commit()


def get_records_by_profile(db: Session, profile_id: int):
    return db.query(ReconciliationRecord).filter(ReconciliationRecord.profile_id == profile_id).all()


def create_match_group(db: Session, profile_id: int, strategy: str, classification: str, confidence: float, variance: float):
    mg = MatchGroup(
        profile_id=profile_id,
        strategy=strategy,
        classification=classification,
        confidence=confidence,
        variance_amount=variance,
        reconciled=(classification == "FULL_MATCH"),
        finalized=(classification == "FULL_MATCH"),
    )
    db.add(mg)
    db.flush()
    return mg


def add_match_items(db: Session, match_group_id: int, record_ids: list[int]):
    db.add_all([MatchGroupItem(match_group_id=match_group_id, reconciliation_record_id=rid) for rid in record_ids])


def add_exception(db: Session, match_group_id: int, queue_type: str):
    db.add(ExceptionQueueRecord(match_group_id=match_group_id, queue_type=queue_type, status="OPEN"))


def commit(db: Session):
    db.commit()

