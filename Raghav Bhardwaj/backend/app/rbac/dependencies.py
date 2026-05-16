from fastapi import Depends, HTTPException, status
from ..core.dependencies import get_current_user
from ..database import get_db
from sqlalchemy.orm import Session
from ..models.models import ModulePermission, ReconciliationOwnership


def role_required(allowed_roles: list[str]):
    allowed = {r.lower() for r in allowed_roles}

    def _dependency(current_user=Depends(get_current_user)):
        role = (getattr(current_user, "role", "") or "").lower()
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for role '{role}'. Required roles: {sorted(allowed)}",
            )
        return current_user

    return _dependency


def module_permission_required(module_name: str, action: str = "view"):
    def _dependency(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
        role = (getattr(current_user, "role", "") or "").lower()
        perm = (
            db.query(ModulePermission)
            .filter(ModulePermission.role == role, ModulePermission.module_name == module_name)
            .first()
        )
        if not perm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"No module access for {module_name}")
        allowed = perm.can_view if action == "view" else perm.can_edit if action == "edit" else perm.can_approve
        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Module action '{action}' denied for {module_name}")
        return current_user
    return _dependency


def ownership_required(profile_id_param: str = "profile_id"):
    def _dependency(current_user=Depends(get_current_user), db: Session = Depends(get_db), **kwargs):
        role = (getattr(current_user, "role", "") or "").lower()
        if role == "admin":
            return current_user
        profile_id = kwargs.get(profile_id_param)
        if profile_id is None:
            return current_user
        row = (
            db.query(ReconciliationOwnership)
            .filter(ReconciliationOwnership.profile_id == int(profile_id), ReconciliationOwnership.owner_user_id == current_user.id)
            .first()
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reconciliation ownership policy denied")
        return current_user
    return _dependency

