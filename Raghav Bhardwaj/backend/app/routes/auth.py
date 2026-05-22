from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import UserCreate, UserOut, Token, LoginRequest, RefreshTokenRequest
from ..services import auth_service, audit_service, monitoring_service
from ..core.dependencies import get_current_user
from ..core.security import decode_token
from ..core.dependencies import oauth2_scheme
from ..models.models import User
from ..rbac.dependencies import role_required
from ..rbac.roles import ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    user = auth_service.create_user(db, payload)
    audit_service.log_action(
        db, "USER_REGISTERED", user_id=user.id,
        entity_type="user", entity_id=user.id,
        metadata={"username": user.username},
        ip_address=request.client.host if request.client else None,
    )
    return user


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.authenticate_user(db, payload.username, payload.password)
    if payload.mfa_channel:
        challenge = auth_service.create_mfa_challenge(db, user.id, payload.mfa_channel)
        audit_service.log_action(
            db, "MFA_CHALLENGE_CREATED", user_id=user.id, entity_type="mfa", entity_id=challenge.id,
            metadata={"channel": payload.mfa_channel},
            ip_address=request.client.host if request.client else None,
        )
        # In production we'd send OTP via email/app channel. Returned for controlled dev validation.
        return {"mfa_required": True, "channel": payload.mfa_channel, "challenge_id": challenge.id, "otp_preview": challenge.otp_code}
    if payload.otp_code:
        if not auth_service.verify_mfa_challenge(db, user.id, payload.otp_code):
            raise HTTPException(status_code=401, detail="Invalid OTP")
    session = monitoring_service.start_session(
        db,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    token = auth_service.generate_token(user, token_id=session.token_id)
    refresh_token = auth_service.generate_refresh_token(db, user.id)
    audit_service.log_action(
        db, "USER_LOGIN", user_id=user.id,
        entity_type="user", entity_id=user.id,
        metadata={"username": user.username},
        ip_address=request.client.host if request.client else None,
    )
    monitoring_service.log_activity(
        db,
        user_id=user.id,
        session_id=session.id,
        action="LOGIN",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
        metadata={"username": user.username},
    )
    return Token(access_token=token, refresh_token=refresh_token, token_type="bearer", user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(role_required([ADMIN, REVIEWER, PREPARER, APPROVER, CERTIFIER])),
):
    return db.query(User).filter(User.is_active == True).order_by(User.username.asc()).all()


@router.post("/logout")
def logout(
    request: Request,
    token: str = Depends(oauth2_scheme),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = decode_token(token) or {}
    token_id = payload.get("jti")
    if token_id:
        monitoring_service.end_session(db, token_id)
    payload = decode_token(token) or {}
    if payload.get("refresh_token"):
        auth_service.revoke_refresh_token(db, payload.get("refresh_token"))
    audit_service.log_action(
        db,
        "USER_LOGOUT",
        user_id=current_user.id,
        entity_type="user",
        entity_id=current_user.id,
        metadata={"username": current_user.username},
        ip_address=request.client.host if request.client else None,
    )
    return {"success": True}


@router.post("/refresh", response_model=Token)
def refresh_access_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    rt = auth_service.validate_refresh_token(db, payload.refresh_token)
    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    access = auth_service.generate_token(user)
    new_refresh = auth_service.generate_refresh_token(db, user.id)
    rt.revoked = True
    db.commit()
    return Token(access_token=access, refresh_token=new_refresh, token_type="bearer", user=UserOut.model_validate(user))
