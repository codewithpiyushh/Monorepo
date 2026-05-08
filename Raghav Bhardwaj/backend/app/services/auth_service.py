from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from ..models.models import User
from ..schemas.schemas import UserCreate
from ..core.security import verify_password, get_password_hash, create_access_token
from ..rbac.roles import ALL_ROLES


def create_user(db: Session, payload: UserCreate) -> User:
    normalized_role = (payload.role or "").strip().lower()
    if normalized_role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed roles: {sorted(ALL_ROLES)}")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=normalized_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    return user


def generate_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "username": user.username})


def get_all_users(db: Session):
    return db.query(User).all()
