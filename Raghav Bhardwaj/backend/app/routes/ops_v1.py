from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER
from ..scheduler.scheduler import scheduler
from ..enterprise import service as enterprise_service

router = APIRouter(prefix="/api/v1/ops", tags=["ops-v1"])


@router.get("/health")
def health_v1(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "api_version": "v1",
        "scheduler_running": bool(scheduler.running),
    }


@router.get("/scheduler/jobs")
def scheduler_jobs(current_user=Depends(role_required([ADMIN, APPROVER]))):
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    return {"count": len(jobs), "jobs": jobs}


@router.get("/metrics")
def ops_metrics(db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, APPROVER]))):
    return enterprise_service.get_job_metrics(db, 200)
