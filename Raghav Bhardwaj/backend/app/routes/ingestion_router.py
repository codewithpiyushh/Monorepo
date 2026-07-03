from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import ingestion_service
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, PREPARER
from pydantic import BaseModel

router = APIRouter(tags=["ingestion"])

class IngestionBatchRequest(BaseModel):
    dataset_type: str
    balances: List[Dict[str, Any]]

@router.post("/projects/{project_id}/ingestion/balances")
def ingest_balances(
    project_id: int,
    payload: IngestionBatchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER]))
):
    """
    Ingest a batch of balance records directly via JSON API.
    """
    job = ingestion_service.start_ingestion(db, project_id, payload.dataset_type, current_user.id)
    try:
        # Pass the balances to be processed
        finished_job = ingestion_service.process_balances(db, job.id, payload.balances)
        return {"status": "success", "job_id": finished_job.id, "inserted": finished_job.records_inserted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/{project_id}/ingestion/jobs")
def list_ingestion_jobs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER]))
):
    return ingestion_service.get_ingestion_jobs(db, project_id)
