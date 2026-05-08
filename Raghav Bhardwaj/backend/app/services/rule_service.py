import json
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import Rule
from ..schemas.schemas import RuleCreate, RuleUpdate

VALID_RULE_TYPES = {"exact", "tolerance", "fuzzy", "date_diff"}


def create_rule(db: Session, project_id: int, payload: RuleCreate) -> Rule:
    if payload.rule_type not in VALID_RULE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"rule_type must be one of {VALID_RULE_TYPES}",
        )
    rule = Rule(
        project_id=project_id,
        name=payload.name,
        rule_type=payload.rule_type,
        config=json.dumps(payload.config),
        is_active=payload.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_rules(db: Session, project_id: int) -> List[Rule]:
    return (
        db.query(Rule)
        .filter(Rule.project_id == project_id)
        .order_by(Rule.created_at)
        .all()
    )


def update_rule(
    db: Session, rule_id: int, project_id: int, payload: RuleUpdate
) -> Rule:
    rule = (
        db.query(Rule)
        .filter(Rule.id == rule_id, Rule.project_id == project_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if payload.name is not None:
        rule.name = payload.name
    if payload.rule_type is not None:
        rule.rule_type = payload.rule_type
    if payload.config is not None:
        rule.config = json.dumps(payload.config)
    if payload.is_active is not None:
        rule.is_active = payload.is_active

    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule_id: int, project_id: int) -> None:
    rule = (
        db.query(Rule)
        .filter(Rule.id == rule_id, Rule.project_id == project_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
