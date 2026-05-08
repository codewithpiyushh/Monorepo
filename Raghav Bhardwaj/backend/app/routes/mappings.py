from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import MappingOut, MappingBulkSave
from ..services import mapping_service, audit_service
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/mappings", tags=["mappings"])


@router.get("/auto-suggest")
def auto_suggest(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    suggestions = mapping_service.auto_map_columns(db, project_id)
    return [
        {"source_column": s, "target_column": t, "score": sc}
        for s, t, sc in suggestions
    ]


@router.post("", response_model=List[MappingOut])
def save_mappings(
    project_id: int,
    payload: MappingBulkSave,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    mappings = mapping_service.save_mappings(db, project_id, payload.mappings)
    audit_service.log_action(
        db, "MAPPINGS_SAVED", user_id=current_user.id,
        entity_type="project", entity_id=project_id,
        metadata={"count": len(mappings)},
        ip_address=request.client.host if request.client else None,
    )
    return mappings


@router.get("", response_model=List[MappingOut])
def list_mappings(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return mapping_service.get_mappings(db, project_id)
