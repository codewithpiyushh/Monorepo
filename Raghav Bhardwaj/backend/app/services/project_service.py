from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import Project, AuditLog
from ..schemas.schemas import ProjectCreate, ProjectUpdate
from ..rbac.roles import ADMIN


def create_project(db: Session, payload: ProjectCreate, user_id: int) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        created_by=user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_projects(db: Session, skip: int = 0, limit: int = 100) -> List[Project]:
    return (
        db.query(Project)
        .order_by(Project.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def update_project(
    db: Session, project_id: int, payload: ProjectUpdate, user_id: int, user_role: str
) -> Project:
    project = get_project(db, project_id)
    if project.created_by != user_id and (user_role or "").lower() != ADMIN:
        raise HTTPException(status_code=403, detail="You can only update your own projects")
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        project.status = payload.status
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: int, user_id: int, user_role: str) -> None:
    project = get_project(db, project_id)
    if project.created_by != user_id and (user_role or "").lower() != ADMIN:
        raise HTTPException(status_code=403, detail="You can only delete your own projects")
    db.delete(project)
    db.commit()


def enrich_project(project: Project) -> dict:
    created_by_user = project.owner.username if project.owner else None
    audit_username = None
    if project.id:
        # Use the most recent project update audit entry to infer the updater.
        from ..database import SessionLocal

        db = SessionLocal()
        try:
            log = (
                db.query(AuditLog)
                .filter(AuditLog.entity_type == "project", AuditLog.entity_id == project.id, AuditLog.action_type == "PROJECT_UPDATED")
                .order_by(AuditLog.timestamp.desc())
                .first()
            )
            if log and log.user:
                audit_username = log.user.username
        finally:
            db.close()

    source_dataset = next((d for d in project.datasets if d.dataset_type == "source"), None) if hasattr(project, "datasets") else None
    target_dataset = next((d for d in project.datasets if d.dataset_type == "target"), None) if hasattr(project, "datasets") else None

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "created_by": project.created_by,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "owner_username": project.owner.username if project.owner else None,
        "created_by_username": created_by_user,
        "updated_by_username": audit_username or created_by_user,
        "source_dataset_name": source_dataset.name if source_dataset else None,
        "target_dataset_name": target_dataset.name if target_dataset else None,
    }
