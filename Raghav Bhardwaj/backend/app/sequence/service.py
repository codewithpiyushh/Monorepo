import json
import logging
from datetime import datetime
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import (
    Sequence,
    SequenceStep,
    SequenceStepResult,
    SequenceExecutionLog,
    Project,
    Execution,
)
from ..services import execution_service, audit_service
from .schemas import SequenceCreate

logger = logging.getLogger(__name__)


def _log(db: Session, sequence_id: int, message: str, level: str = "info", context: dict | None = None) -> None:
    db.add(
        SequenceExecutionLog(
            sequence_id=sequence_id,
            level=level,
            message=message,
            context_json=json.dumps(context or {}),
        )
    )
    db.commit()


def create_sequence(db: Session, payload: SequenceCreate, created_by: int | None = None) -> Sequence:
    if not payload.steps:
        raise HTTPException(status_code=400, detail="Sequence requires at least one step")

    existing_projects = db.query(Project).filter(Project.id.in_(payload.steps)).all()
    existing_ids = {p.id for p in existing_projects}
    missing = [pid for pid in payload.steps if pid not in existing_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Project IDs not found: {missing}")

    sequence = Sequence(
        name=payload.name.strip(),
        status="pending",
        stop_on_failure=payload.stop_on_failure,
        created_by=created_by,
    )
    db.add(sequence)
    db.flush()

    for idx, project_id in enumerate(payload.steps, start=1):
        db.add(SequenceStep(sequence_id=sequence.id, project_id=project_id, step_order=idx))

    db.commit()
    db.refresh(sequence)
    return sequence


def list_sequences(db: Session) -> List[Sequence]:
    return db.query(Sequence).order_by(Sequence.created_at.desc()).all()


def get_sequence(db: Session, sequence_id: int) -> Sequence:
    sequence = db.query(Sequence).filter(Sequence.id == sequence_id).first()
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return sequence


def run_sequence(db: Session, sequence_id: int, triggered_by: int | None = None) -> Sequence:
    sequence = get_sequence(db, sequence_id)
    steps = (
        db.query(SequenceStep)
        .filter(SequenceStep.sequence_id == sequence.id)
        .order_by(SequenceStep.step_order.asc())
        .all()
    )
    if not steps:
        raise HTTPException(status_code=400, detail="Sequence has no steps")

    sequence.status = "running"
    sequence.updated_at = datetime.utcnow()
    db.query(SequenceStepResult).filter(SequenceStepResult.sequence_id == sequence.id).delete()
    db.query(SequenceExecutionLog).filter(SequenceExecutionLog.sequence_id == sequence.id).delete()
    db.commit()
    _log(db, sequence.id, "Sequence execution started", context={"triggered_by": triggered_by})

    for step in steps:
        step_result = SequenceStepResult(
            sequence_id=sequence.id,
            step_id=step.id,
            status="running",
            started_at=datetime.utcnow(),
        )
        db.add(step_result)
        db.commit()
        db.refresh(step_result)

        _log(db, sequence.id, f"Running step {step.step_order}", context={"project_id": step.project_id})
        try:
            execution = execution_service.create_execution(db, step.project_id)
            execution_service.run_reconciliation(execution.id, step.project_id, db)
            db.refresh(execution)
            step_result.execution_id = execution.id
            step_result.status = "completed" if execution.status == "completed" else "failed"
            step_result.stats = execution.stats
            step_result.error_message = execution.error_message
            step_result.completed_at = datetime.utcnow()
            db.commit()
            _log(
                db,
                sequence.id,
                f"Step {step.step_order} completed",
                context={"execution_id": execution.id, "status": execution.status},
            )
        except Exception as exc:
            logger.exception("Sequence step failed: sequence_id=%s step_id=%s", sequence.id, step.id)
            step_result.status = "failed"
            step_result.error_message = str(exc)
            step_result.completed_at = datetime.utcnow()
            db.commit()
            _log(db, sequence.id, f"Step {step.step_order} failed", level="error", context={"error": str(exc)})

            if sequence.stop_on_failure:
                sequence.status = "failed"
                sequence.updated_at = datetime.utcnow()
                db.commit()
                _log(db, sequence.id, "Sequence stopped due to failure", level="warning")
                if triggered_by:
                    audit_service.log_action(
                        db,
                        "SEQUENCE_FAILED",
                        user_id=triggered_by,
                        entity_type="sequence",
                        entity_id=sequence.id,
                        metadata={"failed_step": step.step_order, "error": str(exc)},
                    )
                return sequence

    sequence.status = "completed"
    sequence.updated_at = datetime.utcnow()
    db.commit()
    _log(db, sequence.id, "Sequence execution completed")
    if triggered_by:
        audit_service.log_action(
            db,
            "SEQUENCE_COMPLETED",
            user_id=triggered_by,
            entity_type="sequence",
            entity_id=sequence.id,
            metadata={"steps": len(steps)},
        )
    return sequence


def get_sequence_status(db: Session, sequence_id: int):
    sequence = get_sequence(db, sequence_id)
    step_results = (
        db.query(SequenceStepResult)
        .filter(SequenceStepResult.sequence_id == sequence_id)
        .order_by(SequenceStepResult.id.asc())
        .all()
    )
    logs = (
        db.query(SequenceExecutionLog)
        .filter(SequenceExecutionLog.sequence_id == sequence_id)
        .order_by(SequenceExecutionLog.created_at.asc())
        .all()
    )
    return sequence, step_results, logs


def get_sequence_executions(db: Session, sequence_id: int) -> List[Execution]:
    step_results = db.query(SequenceStepResult).filter(SequenceStepResult.sequence_id == sequence_id).all()
    execution_ids = [s.execution_id for s in step_results if s.execution_id]
    if not execution_ids:
        return []
    return db.query(Execution).filter(Execution.id.in_(execution_ids)).order_by(Execution.id.asc()).all()

