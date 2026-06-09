from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, AUDITOR, CERTIFIER, PREPARER, REVIEWER
from . import service
from .schemas import WorkflowActionRequest, WorkflowAssignRequest, WorkflowAttachmentOut, WorkflowOut

router = APIRouter(prefix="/api/workflow", tags=["workflow"])


# ---------------------------------------------------------------------------
# READ endpoints — preparers, reviewers, approvers, certifiers, auditors can
#                  all see workflows relevant to them.
# ---------------------------------------------------------------------------

@router.get("", response_model=List[WorkflowOut])
def list_workflows(
    reconciliation_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR, ADMIN])),
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
    current_user=Depends(role_required([PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR, ADMIN])),
):
    return service.get_workflow(db, workflow_id)


# ---------------------------------------------------------------------------
# ASSIGN — admin only.
# In Oracle ARCS / BlackLine, workflow assignment is a manager / admin
# operation.  Preparers must not be able to self-assign reconciliations.
# ---------------------------------------------------------------------------

@router.post("/assign", response_model=WorkflowOut)
def assign_workflow(
    payload: WorkflowAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),   # was [ADMIN, PREPARER] — preparer self-assign removed
):
    return service.assign_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        assigned_to=payload.assigned_to,
        comments=payload.comments,
        actor_id=current_user.id,
    )


# ---------------------------------------------------------------------------
# SUBMIT — preparer submits for review. Admin can submit on behalf.
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# REVIEW — reviewer performs first-pass check and either passes to approver
#           or returns for rework. Reviewer is distinct from Approver.
# ---------------------------------------------------------------------------

@router.post("/review", response_model=WorkflowOut)
def review_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([REVIEWER, ADMIN])),
):
    """
    Reviewer acknowledges and passes the reconciliation to the Approver stage.
    This is a distinct step from /approve (which is an Approver action).
    Status transition: under_review → reviewed
    """
    return service.review_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


@router.post("/return-for-rework", response_model=WorkflowOut)
def return_for_rework(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([REVIEWER, APPROVER, ADMIN])),
):
    """
    Reviewer or Approver sends the reconciliation back to the preparer with
    mandatory comments explaining what needs to be corrected.
    Status transition: under_review | reviewed → returned_for_rework
    This is distinct from a final rejection — the preparer can correct and
    re-submit. Mirrors the BlackLine 'Return for Rework' and ARCS 'Return
    to Preparer' transitions.
    """
    return service.return_for_rework(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


# ---------------------------------------------------------------------------
# APPROVE — approver gives final sign-off. Distinct role from reviewer.
#           SoD: approver must not be the same person who submitted or reviewed.
# ---------------------------------------------------------------------------

@router.post("/approve", response_model=WorkflowOut)
def approve_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([APPROVER, ADMIN])),  # was [REVIEWER, ADMIN]
):
    """
    Final approval — only an Approver (or Admin) can approve.
    Reviewer role cannot approve; they can only review and pass forward.
    """
    return service.approve_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


# ---------------------------------------------------------------------------
# REJECT — full rejection (with mandatory reason). Reviewer or Approver.
# ---------------------------------------------------------------------------

@router.post("/reject", response_model=WorkflowOut)
def reject_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([REVIEWER, APPROVER, ADMIN])),
):
    return service.reject_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        comments=payload.comments,
        actor_id=current_user.id,
    )


# ---------------------------------------------------------------------------
# ATTACHMENTS — preparer uploads; reviewer/approver/auditor can view/download.
# ---------------------------------------------------------------------------

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
    current_user=Depends(role_required([PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR, ADMIN])),
):
    return service.list_workflow_attachments(db, workflow_id)


@router.get("/attachments/{attachment_id}/download")
def download_workflow_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR, ADMIN])),
):
    return service.download_workflow_attachment(db, attachment_id)


# ---------------------------------------------------------------------------
# DELETE — admin only.
# Preparers must not be able to delete a workflow they submitted — that would
# allow them to erase evidence of a failed reconciliation before it is reviewed.
# ---------------------------------------------------------------------------

@router.post("/delete")
def delete_workflow(
    payload: WorkflowActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),   # was [PREPARER, ADMIN] — preparer delete removed
):
    return service.delete_reconciliation_workflow(
        db,
        reconciliation_id=payload.reconciliation_id,
        actor_id=current_user.id,
    )
