from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from pydantic import BaseModel
from datetime import datetime
from ..models.models import RiskConfig

class RiskConfigBase(BaseModel):
    aging_weight: float = 0.33
    materiality_weight: float = 0.33
    account_type_weight: float = 0.34

class RiskConfigCreate(RiskConfigBase):
    project_id: int

class RiskConfigUpdate(BaseModel):
    aging_weight: Optional[float] = None
    materiality_weight: Optional[float] = None
    account_type_weight: Optional[float] = None

class RiskConfigOut(RiskConfigBase):
    id: int
    project_id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def get_risk_config_by_project(db: Session, project_id: int) -> Optional[RiskConfig]:
    return db.query(RiskConfig).filter(RiskConfig.project_id == project_id).first()


def create_risk_config(db: Session, payload: RiskConfigCreate, user_id: Optional[int] = None) -> RiskConfig:
    existing = get_risk_config_by_project(db, payload.project_id)
    if existing:
        raise HTTPException(status_code=400, detail="Risk config already exists for this project.")
    
    config = RiskConfig(
        project_id=payload.project_id,
        aging_weight=payload.aging_weight,
        materiality_weight=payload.materiality_weight,
        account_type_weight=payload.account_type_weight,
        created_by=user_id
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def update_risk_config(db: Session, project_id: int, payload: RiskConfigUpdate) -> RiskConfig:
    config = get_risk_config_by_project(db, project_id)
    if not config:
        raise HTTPException(status_code=404, detail="Risk config not found.")
    
    if payload.aging_weight is not None:
        config.aging_weight = payload.aging_weight
    if payload.materiality_weight is not None:
        config.materiality_weight = payload.materiality_weight
    if payload.account_type_weight is not None:
        config.account_type_weight = payload.account_type_weight

    db.commit()
    db.refresh(config)
    return config


def delete_risk_config(db: Session, project_id: int) -> None:
    config = get_risk_config_by_project(db, project_id)
    if not config:
        raise HTTPException(status_code=404, detail="Risk config not found.")
    
    db.delete(config)
    db.commit()
