from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException
from ..models.models import RetentionPolicy, ArchivalJob
from ..schemas.evidence_retention_schemas import (
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
    ArchivalJobCreate,
    ArchivalJobUpdate
)

def get_policies(db: Session, project_id: Optional[int] = None) -> List[RetentionPolicy]:
    query = db.query(RetentionPolicy)
    if project_id is not None:
        query = query.filter(RetentionPolicy.project_id == project_id)
    return query.all()

def get_policy(db: Session, policy_id: int) -> RetentionPolicy:
    policy = db.query(RetentionPolicy).filter(RetentionPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Retention policy not found")
    return policy

def create_policy(db: Session, payload: RetentionPolicyCreate, user_id: int) -> RetentionPolicy:
    policy = RetentionPolicy(
        **payload.model_dump(),
        created_by=user_id
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy

def update_policy(db: Session, policy_id: int, payload: RetentionPolicyUpdate) -> RetentionPolicy:
    policy = get_policy(db, policy_id)
    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(policy, field, value)
    db.commit()
    db.refresh(policy)
    return policy

def delete_policy(db: Session, policy_id: int) -> None:
    policy = get_policy(db, policy_id)
    db.delete(policy)
    db.commit()

def get_jobs(db: Session, project_id: Optional[int] = None) -> List[ArchivalJob]:
    query = db.query(ArchivalJob)
    if project_id is not None:
        query = query.filter(ArchivalJob.project_id == project_id)
    return query.all()

def get_job(db: Session, job_id: int) -> ArchivalJob:
    job = db.query(ArchivalJob).filter(ArchivalJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Archival job not found")
    return job

def create_job(db: Session, payload: ArchivalJobCreate, user_id: int) -> ArchivalJob:
    job = ArchivalJob(
        **payload.model_dump(),
        created_by=user_id
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def update_job(db: Session, job_id: int, payload: ArchivalJobUpdate) -> ArchivalJob:
    job = get_job(db, job_id)
    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job

def delete_job(db: Session, job_id: int) -> None:
    job = get_job(db, job_id)
    db.delete(job)
    db.commit()
