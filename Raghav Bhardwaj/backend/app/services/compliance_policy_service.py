from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models.models import CompliancePolicy
from ..schemas.compliance_policy_schemas import CompliancePolicyCreate, CompliancePolicyUpdate

def create_policy(db: Session, payload: CompliancePolicyCreate, user_id: int) -> CompliancePolicy:
    policy = CompliancePolicy(
        project_id=payload.project_id,
        control_name=payload.control_name,
        category=payload.category,
        violation_threshold=payload.violation_threshold,
        is_active=payload.is_active,
        created_by=user_id,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def get_policies(db: Session, project_id: Optional[int] = None) -> List[CompliancePolicy]:
    query = db.query(CompliancePolicy)
    if project_id:
        query = query.filter(CompliancePolicy.project_id == project_id)
    return query.order_by(CompliancePolicy.created_at).all()


def get_policy(db: Session, policy_id: int) -> CompliancePolicy:
    policy = db.query(CompliancePolicy).filter(CompliancePolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="CompliancePolicy not found")
    return policy


def update_policy(db: Session, policy_id: int, payload: CompliancePolicyUpdate) -> CompliancePolicy:
    policy = get_policy(db, policy_id)
    if payload.control_name is not None:
        policy.control_name = payload.control_name
    if payload.category is not None:
        policy.category = payload.category
    if payload.violation_threshold is not None:
        policy.violation_threshold = payload.violation_threshold
    if payload.is_active is not None:
        policy.is_active = payload.is_active
    db.commit()
    db.refresh(policy)
    return policy


def delete_policy(db: Session, policy_id: int) -> None:
    policy = get_policy(db, policy_id)
    db.delete(policy)
    db.commit()
