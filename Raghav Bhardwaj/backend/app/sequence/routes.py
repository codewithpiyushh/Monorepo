from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, REVIEWER
from .schemas import SequenceCreate, SequenceOut, SequenceStatusOut
from . import service

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.post("", response_model=SequenceOut)
def create_sequence(
    payload: SequenceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    return service.create_sequence(db, payload, created_by=current_user.id)


@router.get("", response_model=list[SequenceOut])
def list_sequences(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return service.list_sequences(db)


def _run_sequence_in_background(sequence_id: int, user_id: int | None):
    db = SessionLocal()
    try:
        service.run_sequence(db, sequence_id, triggered_by=user_id)
    finally:
        db.close()


@router.post("/{sequence_id}/run", status_code=202)
def run_sequence(
    sequence_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    service.get_sequence(db, sequence_id)
    background_tasks.add_task(_run_sequence_in_background, sequence_id, current_user.id)
    return {"message": "Sequence execution started", "sequence_id": sequence_id}


@router.get("/{sequence_id}/status", response_model=SequenceStatusOut)
def sequence_status(
    sequence_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN, REVIEWER])),
):
    sequence, step_results, logs = service.get_sequence_status(db, sequence_id)
    return SequenceStatusOut(
        id=sequence.id,
        name=sequence.name,
        status=sequence.status,
        stop_on_failure=sequence.stop_on_failure,
        steps=sequence.steps,
        step_results=step_results,
        logs=logs,
        updated_at=sequence.updated_at,
    )
