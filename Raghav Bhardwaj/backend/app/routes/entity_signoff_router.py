from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..services import entity_signoff_service
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER

router = APIRouter(prefix="/api/v1/entity-signoffs", tags=["entity-signoffs"])

@router.get("")
def get_entity_signoffs(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER]))
):
    return entity_signoff_service.get_signoffs(db, current_user.id, current_user, project_id=project_id)

@router.post("/{signoff_id}/signoff")
def signoff_entity(
    signoff_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER]))
):
    return entity_signoff_service.signoff_entity(db, signoff_id, current_user.id)
