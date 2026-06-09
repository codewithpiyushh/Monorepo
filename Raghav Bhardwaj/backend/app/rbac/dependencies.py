from fastapi import Depends, HTTPException, status
from ..core.dependencies import get_current_user
from ..database import get_db
from sqlalchemy.orm import Session
from ..models.models import ModulePermission, ReconciliationOwnership
from .roles import READ_ONLY_ROLES


# ---------------------------------------------------------------------------
# _effective_role
# ---------------------------------------------------------------------------
# PREVIOUS BEHAVIOUR (removed):
#   approver was silently aliased to "reviewer" here, making the two roles
#   indistinguishable throughout the entire backend.  This broke SOX SoD
#   because a reviewer and approver could be the same person with the same
#   permissions — identical to Oracle ARCS / BlackLine having a single
#   combined "Reviewer/Approver" where the standard requires two distinct steps.
#
# CURRENT BEHAVIOUR:
#   Each role string is normalised only to lowercase.  APPROVER, REVIEWER,
#   CERTIFIER, and AUDITOR are all distinct identities.  The certification
#   workflow transition table in enterprise/service.py already specifies
#   exactly which role is required for each step — no aliasing needed here.
# ---------------------------------------------------------------------------
def _effective_role(raw_role: str | None) -> str:
    """Normalise to lowercase only — no cross-role aliasing."""
    return (raw_role or "").lower().strip()


def role_required(allowed_roles: list[str]):
    """
    FastAPI dependency that enforces role-based access.
    Raises HTTP 403 if the authenticated user's role is not in allowed_roles.
    """
    allowed = {_effective_role(r) for r in allowed_roles}

    def _dependency(current_user=Depends(get_current_user)):
        role = _effective_role(getattr(current_user, "role", "") or "")
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Your role '{role}' is not authorised for this action. "
                    f"Required: {sorted(allowed)}"
                ),
            )
        return current_user

    return _dependency


def read_only_required(current_user=Depends(get_current_user)):
    """
    Dependency that blocks write access for read-only roles (e.g. auditor).
    Use this on any endpoint that must be visible to auditors but not writable.
    Typically not needed on GET endpoints — auditor is already in allowed_roles there.
    Kept as an explicit guard for hybrid endpoints.
    """
    role = _effective_role(getattr(current_user, "role", "") or "")
    if role in READ_ONLY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auditor role is read-only and cannot perform write operations.",
        )
    return current_user


def module_permission_required(module_name: str, action: str = "view"):
    def _dependency(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
        role = _effective_role(getattr(current_user, "role", "") or "")
        perm = (
            db.query(ModulePermission)
            .filter(ModulePermission.role == role, ModulePermission.module_name == module_name)
            .first()
        )
        if not perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No module access configured for role '{role}' on module '{module_name}'",
            )
        allowed = (
            perm.can_view if action == "view"
            else perm.can_edit if action == "edit"
            else perm.can_approve
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' denied for role '{role}' on module '{module_name}'",
            )
        return current_user

    return _dependency


def ownership_required(profile_id_param: str = "profile_id"):
    def _dependency(current_user=Depends(get_current_user), db: Session = Depends(get_db), **kwargs):
        role = _effective_role(getattr(current_user, "role", "") or "")
        if role == "admin":
            return current_user
        profile_id = kwargs.get(profile_id_param)
        if profile_id is None:
            return current_user
        row = (
            db.query(ReconciliationOwnership)
            .filter(
                ReconciliationOwnership.profile_id == int(profile_id),
                ReconciliationOwnership.owner_user_id == current_user.id,
            )
            .first()
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reconciliation ownership policy denied — you are not assigned to this profile.",
            )
        return current_user

    return _dependency
