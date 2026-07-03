from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import ApprovalRule
from ..schemas.approval_chains_schemas import ApprovalRuleCreate, ApprovalRuleUpdate

def create_rule(db: Session, payload: ApprovalRuleCreate, user_id: int) -> ApprovalRule:
    rule = ApprovalRule(
        project_id=payload.project_id,
        condition_field=payload.condition_field,
        condition_operator=payload.condition_operator,
        condition_value=payload.condition_value,
        action=payload.action,
        target_role=payload.target_role,
        is_active=payload.is_active,
        created_by=user_id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule

def get_rules(db: Session, project_id: Optional[int] = None) -> List[ApprovalRule]:
    query = db.query(ApprovalRule)
    if project_id:
        query = query.filter(ApprovalRule.project_id == project_id)
    return query.order_by(ApprovalRule.created_at).all()

def get_rule(db: Session, rule_id: int) -> ApprovalRule:
    rule = db.query(ApprovalRule).filter(ApprovalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="ApprovalRule not found")
    return rule

def update_rule(db: Session, rule_id: int, payload: ApprovalRuleUpdate) -> ApprovalRule:
    rule = get_rule(db, rule_id)
    if payload.condition_field is not None:
        rule.condition_field = payload.condition_field
    if payload.condition_operator is not None:
        rule.condition_operator = payload.condition_operator
    if payload.condition_value is not None:
        rule.condition_value = payload.condition_value
    if payload.action is not None:
        rule.action = payload.action
    if payload.target_role is not None:
        rule.target_role = payload.target_role
    if payload.is_active is not None:
        rule.is_active = payload.is_active
    db.commit()
    db.refresh(rule)
    return rule

def delete_rule(db: Session, rule_id: int) -> None:
    rule = get_rule(db, rule_id)
    db.delete(rule)
    db.commit()
