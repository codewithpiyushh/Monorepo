from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, REVIEWER, PREPARER
from ..models.models import ReconciliationAttachment
from .schemas import IngestionBatchCreate, ProfileCreate, MatchRequest, WorkflowActionRequest
from . import service, repository

router = APIRouter(prefix="/api/enterprise", tags=["enterprise-reconciliation"])


@router.post("/ingestion/batches")
def create_batch(payload: IngestionBatchCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        b = service.create_ingestion_batch(db, payload.source_system, payload.metadata, payload.records, current_user.id)
        return {"batch_id": b.batch_id, "status": b.ingestion_status}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/transform")
def transform_batch(batch_id: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.transform_batch(db, batch_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/validate")
def validate_batch(batch_id: str, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.validate_batch(db, batch_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/ingestion/{batch_id}/load/{profile_id}")
def load_batch(batch_id: str, profile_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.load_validated_to_reconciliation(db, batch_id, profile_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/ingestion/summary")
def ingestion_summary(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return service.get_ingestion_summary(db)


@router.post("/profiles")
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return repository.create_profile(db, payload)


@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return repository.list_profiles(db)


@router.post("/matching/run")
def run_matching(payload: MatchRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    try:
        return service.run_matching(db, payload.profile_id, payload.strategy, payload.auto_match_threshold, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/exceptions")
def list_exceptions(queue_type: str | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return service.list_exceptions(db, queue_type, current_user.role, current_user.id)


@router.post("/exceptions/assign")
def assign_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    if payload.assigned_to is None:
        raise HTTPException(status_code=400, detail="assigned_to is required")
    try:
        return service.assign_exception(db, payload.exception_id, payload.assigned_to, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/submit")
def submit_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([PREPARER, ADMIN]))):
    try:
        return service.submit_exception(db, payload.exception_id, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/approve")
def approve_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, True, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/exceptions/reject")
def reject_exception(payload: WorkflowActionRequest, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.review_exception(db, payload.exception_id, False, payload.comments, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/records/{record_id}/finalize")
def finalize_record(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([REVIEWER, ADMIN]))):
    try:
        return service.finalize_reconciliation_record(db, record_id, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/records/{record_id}/attachments")
def upload_attachment(
    record_id: int,
    document_type: str = Form(...),
    document_name: str = Form(...),
    document_path: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    try:
        return service.upload_attachment(db, record_id, document_type, document_name, document_path, current_user.id, file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/records/{record_id}/attachments")
def list_attachments(record_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return db.query(ReconciliationAttachment).filter(ReconciliationAttachment.reconciliation_record_id == record_id).all()
