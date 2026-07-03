from typing import List, Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.approval_chains_schemas import ApprovalRuleCreate, ApprovalRuleUpdate, ApprovalRuleOut
from ..services import approval_chains_service, audit_service
from ..core.dependencies import get_current_user
from ..rbac.dependencies import role_required

router = APIRouter(
    prefix="/api/v1/approval-chains",
    tags=["approval_chains"],
    dependencies=[Depends(role_required(["admin"]))]
)

@router.post("", response_model=ApprovalRuleOut, status_code=201)
def create_rule(
    payload: ApprovalRuleCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rule = approval_chains_service.create_rule(db, payload, current_user.id)
    audit_service.log_action(
        db, "APPROVAL_RULE_CREATED", user_id=current_user.id,
        entity_type="approval_rule", entity_id=rule.id,
        metadata={"condition_field": rule.condition_field},
        ip_address=request.client.host if request.client else None,
    )
    return rule

@router.get("", response_model=List[ApprovalRuleOut])
def list_rules(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return approval_chains_service.get_rules(db, project_id=project_id)

@router.get("/{rule_id}", response_model=ApprovalRuleOut)
def get_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return approval_chains_service.get_rule(db, rule_id)

@router.patch("/{rule_id}", response_model=ApprovalRuleOut)
def update_rule(
    rule_id: int,
    payload: ApprovalRuleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rule = approval_chains_service.update_rule(db, rule_id, payload)
    audit_service.log_action(
        db, "APPROVAL_RULE_UPDATED", user_id=current_user.id,
        entity_type="approval_rule", entity_id=rule.id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return rule

@router.delete("/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    approval_chains_service.delete_rule(db, rule_id)
    audit_service.log_action(
        db, "APPROVAL_RULE_DELETED", user_id=current_user.id,
        entity_type="approval_rule", entity_id=rule_id,
        ip_address=request.client.host if request.client else None,
    )
