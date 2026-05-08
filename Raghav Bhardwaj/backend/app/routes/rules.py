from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import RuleCreate, RuleUpdate, RuleOut
from ..services import rule_service, audit_service
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/rules", tags=["rules"])


@router.post("", response_model=RuleOut, status_code=201)
def create_rule(
    project_id: int,
    payload: RuleCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rule = rule_service.create_rule(db, project_id, payload)
    audit_service.log_action(
        db, "RULE_CREATED", user_id=current_user.id,
        entity_type="rule", entity_id=rule.id,
        metadata={"name": rule.name, "rule_type": rule.rule_type},
        ip_address=request.client.host if request.client else None,
    )
    return rule


@router.get("", response_model=List[RuleOut])
def list_rules(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return rule_service.get_rules(db, project_id)


@router.patch("/{rule_id}", response_model=RuleOut)
def update_rule(
    project_id: int,
    rule_id: int,
    payload: RuleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rule = rule_service.update_rule(db, rule_id, project_id, payload)
    audit_service.log_action(
        db, "RULE_UPDATED", user_id=current_user.id,
        entity_type="rule", entity_id=rule_id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(
    project_id: int,
    rule_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rule_service.delete_rule(db, rule_id, project_id)
    audit_service.log_action(
        db, "RULE_DELETED", user_id=current_user.id,
        entity_type="rule", entity_id=rule_id,
        ip_address=request.client.host if request.client else None,
    )
