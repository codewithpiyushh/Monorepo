import logging
from datetime import datetime
from typing import List

from apscheduler.triggers.cron import CronTrigger
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.models import Schedule
from ..services import execution_service
from ..sequence import service as sequence_service
from .scheduler import scheduler

logger = logging.getLogger(__name__)


def _job_id(schedule_id: int) -> str:
    return f"schedule:{schedule_id}"


def _run_scheduled(schedule_id: int):
    db = SessionLocal()
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule or not schedule.active:
            return

        logger.info("Running schedule id=%s type=%s ref=%s", schedule.id, schedule.type, schedule.reference_id)
        if schedule.type == "reconciliation":
            execution = execution_service.create_execution(db, schedule.reference_id)
            execution_service.run_reconciliation(execution.id, schedule.reference_id, db)
        elif schedule.type == "sequence":
            sequence_service.run_sequence(db, schedule.reference_id, triggered_by=schedule.created_by)
    except Exception:
        logger.exception("Scheduled run failed: schedule_id=%s", schedule_id)
    finally:
        db.close()


def register_schedule_job(schedule: Schedule) -> None:
    if not schedule.active:
        return
    try:
        trigger = CronTrigger.from_crontab(schedule.cron_expression)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {exc}")

    scheduler.add_job(
        _run_scheduled,
        trigger=trigger,
        args=[schedule.id],
        id=_job_id(schedule.id),
        replace_existing=True,
        misfire_grace_time=120,
    )


def remove_schedule_job(schedule_id: int) -> None:
    try:
        scheduler.remove_job(_job_id(schedule_id))
    except Exception:
        pass


def sync_schedule_job(schedule: Schedule) -> None:
    remove_schedule_job(schedule.id)
    if schedule.active:
        register_schedule_job(schedule)


def load_active_schedules(db: Session) -> List[Schedule]:
    schedules = db.query(Schedule).filter(Schedule.active == True).all()
    for schedule in schedules:
        try:
            register_schedule_job(schedule)
        except Exception:
            logger.exception("Failed to register schedule id=%s", schedule.id)
    return schedules


def start_scheduler(db: Session) -> None:
    if not scheduler.running:
        scheduler.start()
    load_active_schedules(db)


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def create_schedule(
    db: Session,
    *,
    schedule_type: str,
    reference_id: int,
    cron_expression: str,
    active: bool,
    created_by: int | None = None,
) -> Schedule:
    if schedule_type not in {"reconciliation", "sequence"}:
        raise HTTPException(status_code=400, detail="type must be 'reconciliation' or 'sequence'")

    schedule = Schedule(
        type=schedule_type,
        reference_id=reference_id,
        cron_expression=cron_expression,
        active=active,
        created_by=created_by,
        updated_at=datetime.utcnow(),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    sync_schedule_job(schedule)
    return schedule


def list_schedules(db: Session) -> List[Schedule]:
    return db.query(Schedule).order_by(Schedule.created_at.desc()).all()


def toggle_schedule(db: Session, schedule_id: int) -> Schedule:
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.active = not schedule.active
    schedule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(schedule)
    sync_schedule_job(schedule)
    return schedule

