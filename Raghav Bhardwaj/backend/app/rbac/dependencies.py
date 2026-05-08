from fastapi import Depends, HTTPException, status
from ..core.dependencies import get_current_user


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

