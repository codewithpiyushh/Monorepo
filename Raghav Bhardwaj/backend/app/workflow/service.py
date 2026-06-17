from datetime import datetime
import json
from pathlib import Path
import uuid
from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..models.models import Workflow, WorkflowHistory, WorkflowAttachment, Execution
from ..services import audit_service


# ---------------------------------------------------------------------------
# Valid workflow statuses (extended for distinct review / approver stages)
# ---------------------------------------------------------------------------
VALID_STATUSES = {
    "pending",
    "in_progress",
    "under_review",         # submitted by preparer, awaiting reviewer
    "reviewed",             # reviewer signed off, awaiting approver
    "returned_for_rework",  # reviewer or approver sent back to preparer
    "approved",             # approver gave final sign-off
    "rejected",             # hard rejection with mandatory reason
}

WORKFLOW_PROOF_DIR = Path(__file__).resolve().parents[2] / "uploads" / "workflow_proofs"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_execution_exists(db: Session, reconciliation_id: int) -> Execution:
    execution = db.query(Execution).filter(Execution.id == reconciliation_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Reconciliation execution not found")
    return execution


def _append_history(
    db: Session,
    workflow_id: int,
    actor_id: int | None,
    action: str,
    from_status: str | None,
    to_status: str | None,
    comments: str | None = None,
) -> None:
    db.add(
        WorkflowHistory(
            workflow_id=workflow_id,
            actor_id=actor_id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            comments=comments,
            created_at=datetime.utcnow(),
        )
    )


def _workflow_has_attachment(db: Session, workflow_id: int) -> bool:
    return db.query(WorkflowAttachment).filter(WorkflowAttachment.workflow_id == workflow_id).count() > 0


def _latest_submit_actor_id(workflow: Workflow) -> int | None:
    submit_events = [entry for entry in (workflow.history or []) if entry.action == "submit"]
    if not submit_events:
        return None
    latest_event = max(
        submit_events,
        key=lambda entry: (entry.created_at or datetime.min, entry.id or 0),
    )
    return latest_event.actor_id


def _actors_for_action(db: Session, workflow_id: int, action: str) -> set[int]:
    """Return the set of actor_ids who performed a given action on this workflow."""
    rows = (
        db.query(WorkflowHistory)
        .filter(WorkflowHistory.workflow_id == workflow_id, WorkflowHistory.action == action)
        .all()
    )
    return {r.actor_id for r in rows if r.actor_id is not None}


def _is_reviewer_safe(workflow: Workflow, user_id: int | None) -> bool:
    """True if user_id did not submit this workflow (SoD: submitter cannot review)."""
    if user_id is None:
        return True
    return _latest_submit_actor_id(workflow) != user_id


# ---------------------------------------------------------------------------
# ASSIGN (admin only — see routes.py)
# ---------------------------------------------------------------------------

def assign_workflow(
    db: Session,
    reconciliation_id: int,
    assigned_to: int | None,
    comments: str | None,
    actor_id: int | None,
) -> Workflow:
    _ensure_execution_exists(db, reconciliation_id)
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        workflow = Workflow(
            reconciliation_id=reconciliation_id,
            assigned_to=assigned_to,
            status="pending",
            comments=comments,
        )
        db.add(workflow)
        db.flush()
        _append_history(db, workflow.id, actor_id, "assign", None, "pending", comments)
    else:
        previous = workflow.status
        workflow.assigned_to = assigned_to
        workflow.comments = comments or workflow.comments
        if workflow.status == "pending":
            workflow.status = "in_progress"
        workflow.updated_at = datetime.utcnow()
        _append_history(db, workflow.id, actor_id, "assign", previous, workflow.status, comments)

    db.commit()
    db.refresh(workflow)
    audit_service.log_action(
        db,
        "WORKFLOW_ASSIGNED",
        user_id=actor_id,
        entity_type="workflow",
        entity_id=workflow.id,
        metadata={"reconciliation_id": reconciliation_id, "assigned_to": assigned_to},
    )
    return workflow


# ---------------------------------------------------------------------------
# SUBMIT (preparer → under_review)
# ---------------------------------------------------------------------------

def submit_for_review(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found. Have an admin assign the workflow first.")
    execution = _ensure_execution_exists(db, reconciliation_id)
    stats = {}
    try:
        stats = json.loads(execution.stats or "{}")
    except Exception:
        stats = {}

    unmatched = int(stats.get("unmatched", 0) or 0)
    partial = int(stats.get("partial", 0) or 0)
    auto_reconciled = bool(stats.get("auto_reconciled", False))
    if auto_reconciled:
        raise HTTPException(status_code=400, detail="Execution is already auto-reconciled; manual submit is not required.")

    needs_justification = unmatched > 0 or partial > 0
    if needs_justification:
        if not comments or not comments.strip():
            raise HTTPException(status_code=400, detail="Justification is required for partial/unmatched records.")
        lowered = comments.lower()
        has_attachment = _workflow_has_attachment(db, workflow.id)
        if not has_attachment and "proof:" not in lowered and "evidence:" not in lowered:
            raise HTTPException(
                status_code=400,
                detail="Please include a proof reference in comments (e.g. 'proof: <ticket/link/doc-id>') "
                       "or upload a supporting document first.",
            )

    # Only allow re-submit from valid pre-review states
    allowed_from = {"pending", "in_progress", "returned_for_rework"}
    if workflow.status not in allowed_from:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit from status '{workflow.status}'. Expected one of: {sorted(allowed_from)}",
        )

    previous = workflow.status
    workflow.status = "under_review"
    workflow.comments = comments or workflow.comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "submit", previous, "under_review", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_SUBMITTED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


# ---------------------------------------------------------------------------
# REVIEW (reviewer → reviewed)
# New step: reviewer passes reconciliation to approver stage.
# Distinct from approve — reviewer validates completeness; approver signs off.
# ---------------------------------------------------------------------------

def review_workflow(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow.status != "under_review":
        raise HTTPException(
            status_code=400,
            detail=f"Can only review a workflow in 'under_review' status. Current: '{workflow.status}'",
        )

    # SoD: reviewer must not be the same person who submitted
    if not _is_reviewer_safe(workflow, actor_id):
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: the person who submitted cannot review the same workflow.",
        )

    previous = workflow.status
    workflow.status = "reviewed"
    workflow.comments = comments or workflow.comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "review", previous, "reviewed", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_REVIEWED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


# ---------------------------------------------------------------------------
# RETURN FOR REWORK (reviewer or approver → returned_for_rework)
# Mirrors BlackLine "Return for Rework" / ARCS "Return to Preparer".
# Mandatory comments required — preparer can correct and re-submit.
# This is NOT a hard rejection; the preparer's record is preserved in history.
# ---------------------------------------------------------------------------

def return_for_rework(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not comments or not comments.strip():
        raise HTTPException(
            status_code=400,
            detail="Comments explaining what needs to be corrected are mandatory when returning for rework.",
        )
    allowed_from = {"under_review", "reviewed"}
    if workflow.status not in allowed_from:
        raise HTTPException(
            status_code=400,
            detail=f"Return for rework is only allowed from 'under_review' or 'reviewed'. Current: '{workflow.status}'",
        )

    previous = workflow.status
    workflow.status = "returned_for_rework"
    workflow.comments = comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "return_for_rework", previous, "returned_for_rework", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(
        db, "WORKFLOW_RETURNED_FOR_REWORK", user_id=actor_id, entity_type="workflow", entity_id=workflow.id
    )
    return workflow


# ---------------------------------------------------------------------------
# APPROVE (approver → approved)
# Final sign-off. Approver must not be the same person who submitted OR reviewed.
# ---------------------------------------------------------------------------

def approve_workflow(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Only approve from the "reviewed" state — reviewer must have signed off first
    if workflow.status != "reviewed":
        raise HTTPException(
            status_code=400,
            detail=f"Workflow must be in 'reviewed' state before it can be approved. Current: '{workflow.status}'",
        )

    # SoD check: approver must not have submitted or reviewed this workflow
    prior_actors = _actors_for_action(db, workflow.id, "submit") | _actors_for_action(db, workflow.id, "review")
    if actor_id in prior_actors:
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: the approver must not be the same person who submitted or reviewed this workflow.",
        )

    previous = workflow.status
    workflow.status = "approved"
    workflow.comments = comments or workflow.comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "approve", previous, "approved", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_APPROVED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


# ---------------------------------------------------------------------------
# REJECT (reviewer or approver — hard rejection)
# ---------------------------------------------------------------------------

def reject_workflow(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not comments or not comments.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is mandatory.")

    # SoD: submitter cannot hard-reject their own submission
    submitters = _actors_for_action(db, workflow.id, "submit")
    if actor_id in submitters:
        raise HTTPException(
            status_code=400,
            detail="Segregation of duties violation: the person who submitted cannot reject the same workflow.",
        )

    previous = workflow.status
    workflow.status = "rejected"
    workflow.comments = comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "reject", previous, "rejected", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_REJECTED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


# ---------------------------------------------------------------------------
# GET / LIST
# ---------------------------------------------------------------------------

def get_workflow(db: Session, workflow_id: int) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


def list_workflows(
    db: Session,
    reconciliation_id: int | None = None,
    project_id: int | None = None,
    role: str | None = None,
    user_id: int | None = None,
) -> list[Workflow]:
    query = db.query(Workflow).join(Execution, Workflow.reconciliation_id == Execution.id)
    if reconciliation_id is not None:
        query = query.filter(Workflow.reconciliation_id == reconciliation_id)
    if project_id is not None:
        query = query.filter(Execution.project_id == project_id)

    # Normalise role — no cross-role aliasing; each role sees its own scope
    normalized_role = (role or "").lower().strip()

    workflows = query.order_by(Workflow.updated_at.desc()).all()

    if normalized_role == "preparer":
        # Preparer sees reconciliations they own that are pending / in-progress / returned / rejected
        workflows = [
            wf for wf in workflows
            if wf.status in {"pending", "in_progress", "returned_for_rework", "rejected"}
            and (user_id is None or wf.assigned_to == user_id)
        ]
    elif normalized_role == "reviewer":
        # Reviewer sees submissions awaiting their review (SoD — not their own submissions)
        workflows = [
            wf for wf in workflows
            if wf.status == "under_review" and _is_reviewer_safe(wf, user_id)
        ]
    elif normalized_role == "approver":
        # Approver sees workflows that have passed review and await final sign-off
        workflows = [
            wf for wf in workflows
            if wf.status == "reviewed"
        ]
    elif normalized_role == "certifier":
        # Certifier sees approved workflows awaiting period certification
        workflows = [
            wf for wf in workflows
            if wf.status == "approved"
        ]
    # admin sees everything — no filter applied

    return workflows


# ---------------------------------------------------------------------------
# ATTACHMENTS
# ---------------------------------------------------------------------------

def list_workflow_attachments(db: Session, workflow_id: int) -> list[WorkflowAttachment]:
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return (
        db.query(WorkflowAttachment)
        .filter(WorkflowAttachment.workflow_id == workflow_id)
        .order_by(WorkflowAttachment.created_at.desc())
        .all()
    )


def upload_workflow_attachment(
    db: Session,
    workflow_id: int,
    actor_id: int | None,
    file,
) -> WorkflowAttachment:
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if file is None:
        raise HTTPException(status_code=400, detail="A proof file is required")

    WORKFLOW_PROOF_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = file.filename or "workflow_proof"
    unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}_{safe_name}"
    destination = WORKFLOW_PROOF_DIR / unique_name
    with destination.open("wb") as buffer:
        buffer.write(file.file.read())

    attachment = WorkflowAttachment(
        workflow_id=workflow_id,
        uploaded_by=actor_id,
        file_name=safe_name,
        file_path=str(destination),
        content_type=getattr(file, "content_type", None),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    audit_service.log_action(
        db,
        "WORKFLOW_ATTACHMENT_UPLOADED",
        user_id=actor_id,
        entity_type="workflow_attachment",
        entity_id=attachment.id,
        metadata={"workflow_id": workflow_id, "file_name": safe_name},
    )
    return attachment


def get_workflow_attachment(db: Session, attachment_id: int) -> WorkflowAttachment:
    attachment = db.query(WorkflowAttachment).filter(WorkflowAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


def download_workflow_attachment(db: Session, attachment_id: int) -> FileResponse:
    attachment = get_workflow_attachment(db, attachment_id)
    path = Path(attachment.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found on disk")
    return FileResponse(
        path,
        filename=attachment.file_name,
        media_type=attachment.content_type or "application/octet-stream",
    )


# ---------------------------------------------------------------------------
# DELETE (admin only — see routes.py)
# ---------------------------------------------------------------------------

def delete_reconciliation_workflow(db: Session, reconciliation_id: int, actor_id: int | None) -> dict:
    execution = db.query(Execution).filter(Execution.id == reconciliation_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Reconciliation execution not found")
    if (execution.status or "").lower() == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running reconciliation")

    db.delete(execution)
    db.commit()
    audit_service.log_action(
        db,
        "RECONCILIATION_DELETED",
        user_id=actor_id,
        entity_type="execution",
        entity_id=reconciliation_id,
    )
    return {"deleted": True, "reconciliation_id": reconciliation_id}
