from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import ProjectCreate, ProjectUpdate, ProjectOut
from ..services import project_service, audit_service
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = project_service.create_project(db, payload, current_user.id)
    audit_service.log_action(
        db, "PROJECT_CREATED", user_id=current_user.id,
        entity_type="project", entity_id=project.id,
        metadata={"name": project.name},
        ip_address=request.client.host if request.client else None,
    )
    return project_service.enrich_project(project)


@router.get("", response_model=List[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    projects = project_service.get_projects(db, current_user=current_user)
    return [project_service.enrich_project(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = project_service.get_project(db, project_id)
    return project_service.enrich_project(project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = project_service.update_project(db, project_id, payload, current_user.id, current_user.role)
    audit_service.log_action(
        db, "PROJECT_UPDATED", user_id=current_user.id,
        entity_type="project", entity_id=project.id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return project_service.enrich_project(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project_service.delete_project(db, project_id, current_user.id, current_user.role)
    audit_service.log_action(
        db, "PROJECT_DELETED", user_id=current_user.id,
        entity_type="project", entity_id=project_id,
        ip_address=request.client.host if request.client else None,
    )
