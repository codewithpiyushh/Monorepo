from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import ReconciliationBalance
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, APPROVER, CERTIFIER, PREPARER
from ..services import variance_service
from ..services.variance_schemas import ExplanationOut, ExplanationPatch, VarianceFluxResponse, VarianceTrendRow


router = APIRouter(prefix="/api/v1/analytics", tags=["variance-analytics"])
balance_router = APIRouter(prefix="/api/v1/balances", tags=["variance-analytics"])


@router.get("/variance-flux", response_model=VarianceFluxResponse)
def variance_flux(
    profile_id: Optional[int] = Query(None),
    period_key: Optional[str] = Query(None),
    top_n: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER])),
):
    return variance_service.get_variance_flux_summary(
        db, profile_id=profile_id, period_key=period_key, top_n=top_n,
        current_user=current_user,
    )


@router.get("/variance-trends", response_model=list[VarianceTrendRow])
def variance_trends(
    profile_id: Optional[int] = Query(None),
    months: int = Query(6, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, APPROVER, CERTIFIER, PREPARER])),
):
    return variance_service.get_variance_trends(
        db, profile_id=profile_id, months=months,
        current_user=current_user,
    )


@router.post("/variance-refresh/{balance_id}")
def refresh_variance(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    return variance_service.refresh_balance_variance(db, balance_id, actor_id=current_user.id, persist=True)


@balance_router.patch("/{balance_id}/explanation", response_model=ExplanationOut)
def save_explanation(
    balance_id: int,
    payload: ExplanationPatch,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER])),
):
    balance = variance_service.save_explanation(
        db,
        balance_id=balance_id,
        root_cause_category=payload.root_cause_category,
        variance_explanation=payload.variance_explanation,
        resolution_target_date=payload.resolution_target_date,
        resolution_status=payload.resolution_status,
        actor_id=current_user.id,
    )
    variance_service.refresh_balance_variance(db, balance_id, actor_id=current_user.id, persist=True)
    explanation_required = variance_service.check_explanation_required(balance)
    explanation_complete = bool(balance.root_cause_category and balance.variance_explanation)
    return ExplanationOut(
        balance_id=balance.id,
        variance_severity_classification=balance.variance_severity_classification,
        root_cause_category=balance.root_cause_category,
        variance_explanation=balance.variance_explanation,
        resolution_target_date=balance.resolution_target_date,
        resolution_status=balance.resolution_status,
        explained_variance=balance.explained_variance,
        unexplained_variance=balance.unexplained_variance,
        flux_amount=balance.flux_amount,
        flux_percentage=balance.flux_percentage,
        explanation_required=explanation_required,
        explanation_complete=explanation_complete,
    )


@balance_router.get("/{balance_id}/explanation", response_model=ExplanationOut)
def get_explanation(
    balance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, PREPARER, APPROVER, CERTIFIER])),
):
    balance = db.query(ReconciliationBalance).filter(ReconciliationBalance.id == balance_id).first()
    if not balance:
        raise HTTPException(status_code=404, detail="Balance record not found")

    explanation_required = variance_service.check_explanation_required(balance)
    explanation_complete = bool(balance.root_cause_category and balance.variance_explanation)
    return ExplanationOut(
        balance_id=balance.id,
        variance_severity_classification=balance.variance_severity_classification,
        root_cause_category=balance.root_cause_category,
        variance_explanation=balance.variance_explanation,
        resolution_target_date=balance.resolution_target_date,
        resolution_status=balance.resolution_status,
        explained_variance=balance.explained_variance,
        unexplained_variance=balance.unexplained_variance,
        flux_amount=balance.flux_amount,
        flux_percentage=balance.flux_percentage,
        explanation_required=explanation_required,
        explanation_complete=explanation_complete,
    )
