from typing import List
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import IngestionJob, ReconciliationBalance
from ..services import audit_service, matching_engine

def start_ingestion(db: Session, project_id: int, dataset_type: str, actor_id: int) -> IngestionJob:
    job = IngestionJob(
        project_id=project_id,
        dataset_type=dataset_type,
        status="PENDING",
        started_at=datetime.utcnow(),
        created_by=actor_id
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def process_balances(db: Session, job_id: int, balances: List[dict]):
    job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job.status = "PROCESSING"
    job.records_received = len(balances)
    db.commit()
    
    # Very simplified bulk insert logic for MVP ingestion
    inserted = 0
    failed = 0
    for bal in balances:
        try:
            # We assume the payload contains: profile_id, period_key, source_balance, target_balance, etc.
            row = ReconciliationBalance(
                profile_id=bal.get("profile_id"),
                period_key=bal.get("period_key"),
                source_balance=bal.get("source_balance", 0.0),
                target_balance=bal.get("target_balance", 0.0),
                status="UNMATCHED",
                created_by=job.created_by,
                is_demo_data=False
            )
            db.add(row)
            inserted += 1
        except Exception:
            failed += 1
            
    try:
        db.commit()
        job.status = "SUCCESS"
        job.records_inserted = inserted
        job.records_failed = failed
        job.completed_at = datetime.utcnow()
        db.commit()
        
        audit_service.log_action(
            db, "API_DATA_INGESTION", user_id=job.created_by,
            entity_type="project", entity_id=job.project_id,
            metadata={"job_id": job.id, "inserted": inserted}
        )
    except Exception as e:
        db.rollback()
        job.status = "FAILED"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        db.commit()
        raise e
        
    return job

def get_ingestion_jobs(db: Session, project_id: int):
    return db.query(IngestionJob).filter(IngestionJob.project_id == project_id).order_by(IngestionJob.created_at.desc()).all()
