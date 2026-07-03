"""
backend/app/routes/close_readiness_router.py
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, CERTIFIER
from ..services.close_readiness_service import evaluate_readiness

router = APIRouter(prefix="/api/v1/close-readiness", tags=["close-readiness"])

@router.get("")
def get_close_readiness(
    db: Session = Depends(get_db),
    current_user = Depends(role_required([ADMIN, CERTIFIER]))
):
    """
    Returns the close readiness validation results.
    Requires CERTIFIER or ADMIN role.
    """
    readiness = evaluate_readiness()
    return {"readiness": readiness}
