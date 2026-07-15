from typing import List, Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.evidence_retention_schemas import (
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
    RetentionPolicyOut,
    ArchivalJobCreate,
    ArchivalJobUpdate,
    ArchivalJobOut
)
from ..services import evidence_retention_service, audit_service
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required

router = APIRouter(
    prefix="/api/v1/evidence-retention",
    tags=["evidence_retention"],
    dependencies=[Depends(role_required(["admin"]))]
)

# --- Retention Policies ---

@router.post("/policies", response_model=RetentionPolicyOut, status_code=201)
def create_policy(
    payload: RetentionPolicyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    policy = evidence_retention_service.create_policy(db, payload, current_user.id)
    audit_service.log_action(
        db, "RETENTION_POLICY_CREATED", user_id=current_user.id,
        entity_type="retention_policy", entity_id=policy.id,
        metadata={"doc_type": policy.doc_type},
        ip_address=request.client.host if request.client else None,
    )
    return policy

@router.get("/policies", response_model=List[RetentionPolicyOut])
def list_policies(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return evidence_retention_service.get_policies(db, project_id=project_id)

@router.get("/policies/{policy_id}", response_model=RetentionPolicyOut)
def get_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return evidence_retention_service.get_policy(db, policy_id)

@router.patch("/policies/{policy_id}", response_model=RetentionPolicyOut)
def update_policy(
    policy_id: int,
    payload: RetentionPolicyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    policy = evidence_retention_service.update_policy(db, policy_id, payload)
    audit_service.log_action(
        db, "RETENTION_POLICY_UPDATED", user_id=current_user.id,
        entity_type="retention_policy", entity_id=policy.id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return policy

@router.delete("/policies/{policy_id}", status_code=204)
def delete_policy(
    policy_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    evidence_retention_service.delete_policy(db, policy_id)
    audit_service.log_action(
        db, "RETENTION_POLICY_DELETED", user_id=current_user.id,
        entity_type="retention_policy", entity_id=policy_id,
        ip_address=request.client.host if request.client else None,
    )

# --- Archival Jobs ---

@router.post("/jobs", response_model=ArchivalJobOut, status_code=201)
def create_job(
    payload: ArchivalJobCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    job = evidence_retention_service.create_job(db, payload, current_user.id)
    audit_service.log_action(
        db, "ARCHIVAL_JOB_CREATED", user_id=current_user.id,
        entity_type="archival_job", entity_id=job.id,
        ip_address=request.client.host if request.client else None,
    )
    return job

@router.get("/jobs", response_model=List[ArchivalJobOut])
def list_jobs(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return evidence_retention_service.get_jobs(db, project_id=project_id)

@router.get("/jobs/{job_id}", response_model=ArchivalJobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return evidence_retention_service.get_job(db, job_id)

@router.patch("/jobs/{job_id}", response_model=ArchivalJobOut)
def update_job(
    job_id: int,
    payload: ArchivalJobUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    job = evidence_retention_service.update_job(db, job_id, payload)
    audit_service.log_action(
        db, "ARCHIVAL_JOB_UPDATED", user_id=current_user.id,
        entity_type="archival_job", entity_id=job.id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return job

@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    evidence_retention_service.delete_job(db, job_id)
    audit_service.log_action(
        db, "ARCHIVAL_JOB_DELETED", user_id=current_user.id,
        entity_type="archival_job", entity_id=job_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/metrics")
def get_metrics(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Live KPI metrics for the Evidence Retention dashboard."""
    from ..models.models import RetentionPolicy, ArchivalJob
    from sqlalchemy import func

    total_policies = db.query(func.count(RetentionPolicy.id)).scalar() or 0
    active_policies = db.query(func.count(RetentionPolicy.id)).filter(RetentionPolicy.is_active == True).scalar() or 0

    total_jobs = db.query(func.count(ArchivalJob.id)).scalar() or 0
    completed_jobs = db.query(func.count(ArchivalJob.id)).filter(ArchivalJob.status == 'COMPLETED').scalar() or 0
    total_docs_archived = db.query(func.coalesce(func.sum(ArchivalJob.docs_archived), 0)).scalar() or 0

    # Estimate storage: ~500KB per archived doc for active, ~200KB for cold
    active_bytes = total_docs_archived * 500 * 1024
    cold_bytes = total_docs_archived * 200 * 1024
    total_bytes = active_bytes + cold_bytes

    def format_bytes(b):
        if b >= 1024**4:
            return f"{b / 1024**4:.1f} TB"
        if b >= 1024**3:
            return f"{b / 1024**3:.1f} GB"
        if b >= 1024**2:
            return f"{b / 1024**2:.1f} MB"
        return f"{b / 1024:.1f} KB"

    return {
        "total_policies": total_policies,
        "active_policies": active_policies,
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "total_docs_archived": total_docs_archived,
        "total_storage": format_bytes(total_bytes),
        "active_storage": format_bytes(active_bytes),
        "cold_storage": format_bytes(cold_bytes),
        "total_storage_bytes": total_bytes,
        "active_storage_bytes": active_bytes,
        "cold_storage_bytes": cold_bytes,
    }
