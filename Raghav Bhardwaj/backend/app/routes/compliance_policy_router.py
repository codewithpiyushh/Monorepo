from typing import List, Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.compliance_policy_schemas import CompliancePolicyCreate, CompliancePolicyUpdate, CompliancePolicyOut
from ..services import compliance_policy_service, audit_service
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, CERTIFIER

router = APIRouter(
    prefix="/api/v1/compliance-policy",
    tags=["compliance_policies"],
)

@router.post("", response_model=CompliancePolicyOut, status_code=201)
def create_policy(
    payload: CompliancePolicyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    policy = compliance_policy_service.create_policy(db, payload, current_user.id)
    audit_service.log_action(
        db, "COMPLIANCE_POLICY_CREATED", user_id=current_user.id,
        entity_type="compliance_policy", entity_id=policy.id,
        metadata={"control_name": policy.control_name},
        ip_address=request.client.host if request.client else None,
    )
    return policy

@router.get("", response_model=List[CompliancePolicyOut])
def list_policies(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, CERTIFIER])),
):
    return compliance_policy_service.get_policies(db, project_id=project_id)

@router.get("/{policy_id}", response_model=CompliancePolicyOut)
def get_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, CERTIFIER])),
):
    return compliance_policy_service.get_policy(db, policy_id)

@router.patch("/{policy_id}", response_model=CompliancePolicyOut)
def update_policy(
    policy_id: int,
    payload: CompliancePolicyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    policy = compliance_policy_service.update_policy(db, policy_id, payload)
    audit_service.log_action(
        db, "COMPLIANCE_POLICY_UPDATED", user_id=current_user.id,
        entity_type="compliance_policy", entity_id=policy.id,
        metadata={"changes": payload.model_dump(exclude_none=True)},
        ip_address=request.client.host if request.client else None,
    )
    return policy

@router.delete("/{policy_id}", status_code=204)
def delete_policy(
    policy_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN])),
):
    compliance_policy_service.delete_policy(db, policy_id)
    audit_service.log_action(
        db, "COMPLIANCE_POLICY_DELETED", user_id=current_user.id,
        entity_type="compliance_policy", entity_id=policy_id,
        ip_address=request.client.host if request.client else None,
    )
