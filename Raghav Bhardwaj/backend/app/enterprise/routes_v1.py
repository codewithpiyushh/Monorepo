from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, REVIEWER, PREPARER
from .schemas import ProfileCreate, ProfileUpdate, MatchRequest, ScheduleReportRequest
from . import repository, service

router = APIRouter(prefix="/api/v1/enterprise", tags=["enterprise-v1"])


@router.get("/profiles")
def list_profiles(project_id: int | None = None, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER]))):
    return repository.list_profiles(db, project_id=project_id)


@router.post("/profiles")
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    return repository.create_profile(db, payload)


@router.patch("/profiles/{profile_id}")
def update_profile(profile_id: int, payload: ProfileUpdate, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    return service.update_profile(db, profile_id, {k: v for k, v in raw.items() if v is not None}, current_user.id)


@router.post("/matching/run")
def run_matching(payload: MatchRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN, PREPARER]))):
    return service.run_matching(db, payload.profile_id, payload.strategy, payload.auto_match_threshold, current_user.id)


@router.post("/reports/schedule")
def schedule_report(payload: ScheduleReportRequest, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    row = service.create_scheduled_report(db, raw, current_user.id)
    return {"schedule_id": row.id, "report_type": row.report_type}


@router.post("/reports/{report_id}/run")
def run_report_now(report_id: int, db: Session = Depends(get_db), current_user=Depends(role_required([ADMIN]))):
    try:
        return service.run_scheduled_report(db, report_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
