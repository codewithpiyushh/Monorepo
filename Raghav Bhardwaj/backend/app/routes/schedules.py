from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN
from ..scheduler import service as scheduler_service

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


class ScheduleCreate(BaseModel):
    type: str  # reconciliation | sequence
    reference_id: int
    cron_expression: str
    active: bool = True


class ScheduleOut(BaseModel):
    id: int
    type: str
    reference_id: int
    cron_expression: str
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=ScheduleOut)
def create_schedule(
    payload: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    return scheduler_service.create_schedule(
        db,
        schedule_type=payload.type,
        reference_id=payload.reference_id,
        cron_expression=payload.cron_expression,
        active=payload.active,
        created_by=current_user.id,
    )


@router.get("", response_model=list[ScheduleOut])
def list_schedules(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    return scheduler_service.list_schedules(db)


@router.patch("/{schedule_id}/toggle", response_model=ScheduleOut)
def toggle_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    return scheduler_service.toggle_schedule(db, schedule_id)

