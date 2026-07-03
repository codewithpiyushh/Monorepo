from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN
from ..services import risk_config_service
from ..services.risk_config_service import RiskConfigCreate, RiskConfigUpdate, RiskConfigOut

router = APIRouter(prefix="/api/v1/risk-config", tags=["Risk Config"])

@router.post("/", response_model=RiskConfigOut, status_code=status.HTTP_201_CREATED)
def create_config(
    payload: RiskConfigCreate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    return risk_config_service.create_risk_config(db, payload, user_id=current_user.id)

@router.get("/project/{project_id}", response_model=RiskConfigOut)
def get_config(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    config = risk_config_service.get_risk_config_by_project(db, project_id)
    if not config:
        raise HTTPException(status_code=404, detail="Risk config not found.")
    return config

@router.put("/project/{project_id}", response_model=RiskConfigOut)
def update_config(
    project_id: int,
    payload: RiskConfigUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    return risk_config_service.update_risk_config(db, project_id, payload)

@router.delete("/project/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    risk_config_service.delete_risk_config(db, project_id)
    return None
