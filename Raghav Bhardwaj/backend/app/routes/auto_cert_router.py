from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..services import auto_cert_engine
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN

router = APIRouter(tags=["auto-cert"])

class AutoCertRuleUpdate(BaseModel):
    max_variance: Optional[float] = None
    allow_exceptions: Optional[bool] = None
    allowed_risk_levels: Optional[str] = None

@router.get("/projects/{project_id}/auto-cert/rule")
def get_auto_cert_rule(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    return auto_cert_engine.get_active_rule(db, project_id)

@router.patch("/projects/{project_id}/auto-cert/rule")
def update_auto_cert_rule(
    project_id: int,
    payload: AutoCertRuleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    return auto_cert_engine.update_rule(db, project_id, payload.model_dump(exclude_unset=True), current_user.id)

@router.post("/projects/{project_id}/auto-cert/run")
def run_auto_cert_engine(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN]))
):
    return auto_cert_engine.run_auto_certification(db, project_id, current_user.id)
