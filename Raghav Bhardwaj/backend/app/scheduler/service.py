import logging
import time
from datetime import datetime
from typing import List

from apscheduler.triggers.cron import CronTrigger
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.models import Schedule, ScheduledReport
from ..services import execution_service
from ..sequence import service as sequence_service
from ..enterprise import service as enterprise_service
from .scheduler import scheduler

logger = logging.getLogger(__name__)


def _job_id(schedule_id: int) -> str:
    return f"schedule:{schedule_id}"


def _run_scheduled(schedule_id: int):
    db = SessionLocal()
    started = time.perf_counter()
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
        enterprise_service.record_job_metric(
            db,
            f"schedule:{schedule.type}",
            "COMPLETED",
            int((time.perf_counter() - started) * 1000),
            f"reference_id={schedule.reference_id}",
        )
    except Exception:
        logger.exception("Scheduled run failed: schedule_id=%s", schedule_id)
        enterprise_service.record_job_metric(
            db,
            "schedule:unknown",
            "FAILED",
            int((time.perf_counter() - started) * 1000),
            f"schedule_id={schedule_id}",
        )
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
    _register_system_jobs()


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _run_system_job(job_name: str):
    db = SessionLocal()
    started = time.perf_counter()
    try:
        if job_name == "overdue_detection":
            enterprise_service.process_overdue_workflows(db)
        elif job_name == "escalation_processing":
            enterprise_service.process_escalations(db)
        elif job_name == "reconciliation_reminders":
            enterprise_service.generate_aging_and_reminders(db)
        elif job_name == "workflow_notifications":
            enterprise_service.process_workflow_notifications(db)
        elif job_name == "scheduled_reports_dispatch":
            reports = db.query(ScheduledReport).filter(ScheduledReport.active == True).all()
            for r in reports:
                enterprise_service.run_scheduled_report(db, r.id)
        elif job_name == "retention_cycle":
            enterprise_service.run_retention_cycle(db)
        elif job_name == "backup_cycle":
            enterprise_service.create_backup(db, actor_id=None, backup_type="full")
        enterprise_service.record_job_metric(
            db,
            f"system:{job_name}",
            "COMPLETED",
            int((time.perf_counter() - started) * 1000),
        )
    except Exception:
        logger.exception("System job failed: %s", job_name)
        enterprise_service.record_job_metric(
            db,
            f"system:{job_name}",
            "FAILED",
            int((time.perf_counter() - started) * 1000),
        )
    finally:
        db.close()


def _run_aging_escalations():
    """APScheduler wrapper — daily aging escalation engine."""
    from ..database import SessionLocal
    from ..services.aging_service import run_escalations
    db = SessionLocal()
    try:
        result = run_escalations(db, actor_id=None)
        logger.info("[Aging Scheduler] Escalations: %s", result)
    except Exception:
        logger.exception("[Aging Scheduler] Escalation error")
    finally:
        db.close()


def _run_aging_snapshot():
    """APScheduler wrapper — monthly aging snapshot writer."""
    from ..database import SessionLocal
    from ..services.aging_service import write_monthly_snapshot
    db = SessionLocal()
    try:
        result = write_monthly_snapshot(db, actor_id=None)
        logger.info("[Aging Scheduler] Snapshot: %s", result)
    except Exception:
        logger.exception("[Aging Scheduler] Snapshot error")
    finally:
        db.close()


def _run_sla_scan_job():
    """APScheduler wrapper — SLA monitoring & escalation scan (every 4 hours)."""
    from ..database import SessionLocal
    from ..services.sla_monitoring_service import run_sla_scan
    db = SessionLocal()
    try:
        result = run_sla_scan(db)
        logger.info("[SLA Scheduler] Scan complete: %s", result)
    except Exception:
        logger.exception("[SLA Scheduler] Scan error")
    finally:
        db.close()


def _register_system_jobs():
    system_jobs = [
        ("system:overdue_detection", "*/15 * * * *", "overdue_detection"),
        ("system:escalation_processing", "*/20 * * * *", "escalation_processing"),
        ("system:reconciliation_reminders", "0 */1 * * *", "reconciliation_reminders"),
        ("system:workflow_notifications", "*/30 * * * *", "workflow_notifications"),
        ("system:scheduled_reports_dispatch", "*/30 * * * *", "scheduled_reports_dispatch"),
        ("system:retention_cycle", "0 2 * * *", "retention_cycle"),
        ("system:backup_cycle", "0 3 * * *", "backup_cycle"),
    ]
    for job_id, cron_expr, job_name in system_jobs:
        scheduler.add_job(
            _run_system_job,
            trigger=CronTrigger.from_crontab(cron_expr),
            args=[job_name],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=120,
        )

    # ── Aging Engine Jobs ────────────────────────────────────────────────────
    scheduler.add_job(
        _run_aging_escalations,
        trigger=CronTrigger(hour=8, minute=0),
        id="aging_escalations",
        name="Daily Aging Escalation Engine",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _run_aging_snapshot,
        trigger=CronTrigger(day=1, hour=0, minute=5),
        id="aging_monthly_snapshot",
        name="Monthly Aging Snapshot Writer",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # ── SLA Monitoring & Escalation Scan ────────────────────────────────
    from apscheduler.triggers.interval import IntervalTrigger
    scheduler.add_job(
        _run_sla_scan_job,
        trigger=IntervalTrigger(hours=4),
        id="sla_monitoring_scan",
        name="SLA Monitoring & Escalation Scan",
        replace_existing=True,
        misfire_grace_time=300,
    )


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

