from datetime import datetime
import json
from pathlib import Path
import uuid
from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..models.models import Workflow, WorkflowHistory, WorkflowAttachment, Execution
from ..services import audit_service


VALID_STATUSES = {"pending", "in_progress", "under_review", "approved", "rejected"}
WORKFLOW_PROOF_DIR = Path(__file__).resolve().parents[2] / "uploads" / "workflow_proofs"


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
        key=lambda entry: (
            entry.created_at or datetime.min,
            entry.id or 0,
        ),
    )
    return latest_event.actor_id


def _is_reviewer_safe(workflow: Workflow, user_id: int | None) -> bool:
    if user_id is None:
        return True
    return _latest_submit_actor_id(workflow) != user_id


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


def submit_for_review(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found. Assign workflow first.")
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
        raise HTTPException(status_code=400, detail="Execution is already auto-reconciled; submit is not required.")

    needs_justification = unmatched > 0 or partial > 0
    if needs_justification:
        if not comments or not comments.strip():
            raise HTTPException(status_code=400, detail="Justification is required for partial/unmatched records.")
        lowered = comments.lower()
        has_attachment = _workflow_has_attachment(db, workflow.id)
        if not has_attachment and "proof:" not in lowered and "evidence:" not in lowered:
            raise HTTPException(
                status_code=400,
                detail="Please include proof reference in comments (e.g., 'proof: <ticket/link/doc-id>').",
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


def approve_workflow(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    submitted_by_actor = (
        db.query(WorkflowHistory)
        .filter(
            WorkflowHistory.workflow_id == workflow.id,
            WorkflowHistory.action == "submit",
            WorkflowHistory.actor_id == actor_id,
        )
        .first()
    )
    if submitted_by_actor:
        raise HTTPException(status_code=400, detail="Segregation of duties violation: submitter cannot approve same workflow")
    previous = workflow.status
    workflow.status = "approved"
    workflow.comments = comments or workflow.comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "approve", previous, "approved", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_APPROVED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


def reject_workflow(db: Session, reconciliation_id: int, comments: str | None, actor_id: int | None) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.reconciliation_id == reconciliation_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not comments or not comments.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    submitted_by_actor = (
        db.query(WorkflowHistory)
        .filter(
            WorkflowHistory.workflow_id == workflow.id,
            WorkflowHistory.action == "submit",
            WorkflowHistory.actor_id == actor_id,
        )
        .first()
    )
    if submitted_by_actor:
        raise HTTPException(status_code=400, detail="Segregation of duties violation: submitter cannot reject same workflow")
    previous = workflow.status
    workflow.status = "rejected"
    workflow.comments = comments or workflow.comments
    workflow.updated_at = datetime.utcnow()
    _append_history(db, workflow.id, actor_id, "reject", previous, "rejected", comments)
    db.commit()
    db.refresh(workflow)
    audit_service.log_action(db, "WORKFLOW_REJECTED", user_id=actor_id, entity_type="workflow", entity_id=workflow.id)
    return workflow


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
    normalized_role = (role or "").lower()
    if normalized_role == "approver":
        normalized_role = "reviewer"
    workflows = query.order_by(Workflow.updated_at.desc()).all()
    if normalized_role == "preparer":
        workflows = [
            workflow
            for workflow in workflows
            if workflow.status in {"pending", "in_progress", "rejected"}
            and (user_id is None or workflow.assigned_to == user_id)
        ]
    elif normalized_role == "reviewer":
        workflows = [
            workflow
            for workflow in workflows
            if workflow.status == "under_review" and _is_reviewer_safe(workflow, user_id)
        ]
    return workflows


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
        raise HTTPException(status_code=404, detail="Attachment file not found")
    return FileResponse(
        path,
        filename=attachment.file_name,
        media_type=attachment.content_type or "application/octet-stream",
    )


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
