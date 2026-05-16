from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from ..database import get_db
from ..core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    from ..models.models import User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload:
        raise credentials_exception
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise credentials_exception
    try:
        from ..models.models import UserSession
        from ..services import monitoring_service
        jti = payload.get("jti")
        session = None
        if jti:
            session = db.query(UserSession).filter(UserSession.token_id == jti).first()
        monitoring_service.log_activity(
            db,
            user_id=user.id,
            session_id=session.id if session else None,
            action=f"API_ACCESS:{request.method}",
            entity_type="request",
            entity_id=None,
            ip_address=request.client.host if request.client else None,
            metadata={"path": request.url.path},
        )
    except Exception:
        pass
    return user


def get_current_active_user(current_user=Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
