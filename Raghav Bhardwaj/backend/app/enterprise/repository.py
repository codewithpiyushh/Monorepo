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
)


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
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def list_profiles(db: Session):
    return db.query(ReconciliationProfile).order_by(ReconciliationProfile.created_at.desc()).all()


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

