from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER, REVIEWER
from . import service
from .schemas import WorkflowActionRequest, WorkflowAssignRequest, WorkflowAttachmentOut, WorkflowOut

router = APIRouter(prefix="/api/workflow", tags=["workflow"])


@router.get("", response_model=List[WorkflowOut])
def list_workflows(
    reconciliation_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, ADMIN])),
):
    return service.list_workflows(
        db,
        reconciliation_id=reconciliation_id,
        project_id=project_id,
        role=current_user.role,
        user_id=current_user.id,
    )


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, ADMIN])),
):
    return service.get_workflow(db, workflow_id)


@router.post("/assign", response_model=WorkflowOut)
def assign_workflow(
    payload: WorkflowAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return service.assign_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        assigned_to=payload.assigned_to,
        comments=payload.comments,
        actor_id=current_user.id,
    )


@router.post("/submit", response_model=WorkflowOut)
def submit_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    return service.submit_for_review(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


@router.post("/approve", response_model=WorkflowOut)
def approve_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([REVIEWER, ADMIN])),
):
    return service.approve_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


@router.post("/reject", response_model=WorkflowOut)
def reject_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([REVIEWER, ADMIN])),
):
    return service.reject_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


@router.post("/{workflow_id}/attachments", response_model=WorkflowAttachmentOut)
def upload_workflow_attachment(
    workflow_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    try:
        return service.upload_workflow_attachment(db, workflow_id, current_user.id, file)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{workflow_id}/attachments", response_model=List[WorkflowAttachmentOut])
def list_workflow_attachments(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, ADMIN])),
):
    return service.list_workflow_attachments(db, workflow_id)


@router.get("/attachments/{attachment_id}/download")
def download_workflow_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, ADMIN])),
):
    return service.download_workflow_attachment(db, attachment_id)


@router.post("/delete")
def delete_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, ADMIN])),
):
    return service.delete_reconciliation_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        actor_id=current_user.id,
    )
