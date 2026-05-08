from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.schemas import UserCreate, UserOut, Token, LoginRequest
from ..services import auth_service, audit_service
from ..core.dependencies import get_current_user

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


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = auth_service.authenticate_user(db, payload.username, payload.password)
    token = auth_service.generate_token(user)
    audit_service.log_action(
        db, "USER_LOGIN", user_id=user.id,
        entity_type="user", entity_id=user.id,
        metadata={"username": user.username},
        ip_address=request.client.host if request.client else None,
    )
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user
