import hashlib
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from ..models.models import User, RefreshToken, MFAChallenge
from ..schemas.schemas import UserCreate
from ..core.security import verify_password, get_password_hash, create_access_token
from ..core.config import settings
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


def generate_token(user: User, token_id: str | None = None) -> str:
    payload = {"sub": str(user.id), "username": user.username}
    if token_id:
        payload["jti"] = token_id
    return create_access_token(payload)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_refresh_token(db: Session, user_id: int) -> str:
    raw = f"{user_id}:{datetime.utcnow().timestamp()}:{random.randint(100000, 999999)}"
    token_hash = _hash_token(raw)
    row = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.refresh_token_expire_minutes),
        revoked=False,
    )
    db.add(row)
    db.commit()
    return raw


def validate_refresh_token(db: Session, raw: str) -> RefreshToken:
    token_hash = _hash_token(raw)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not row or row.revoked or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return row


def revoke_refresh_token(db: Session, raw: str):
    token_hash = _hash_token(raw)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if row:
        row.revoked = True
        db.commit()


def create_mfa_challenge(db: Session, user_id: int, channel: str = "email") -> MFAChallenge:
    otp = f"{random.randint(100000, 999999)}"
    row = MFAChallenge(
        user_id=user_id,
        channel=channel,
        otp_code=otp,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.MFA_OTP_EXPIRE_MINUTES),
        verified=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def verify_mfa_challenge(db: Session, user_id: int, otp_code: str) -> bool:
    row = (
        db.query(MFAChallenge)
        .filter(MFAChallenge.user_id == user_id, MFAChallenge.verified == False)
        .order_by(MFAChallenge.created_at.desc())
        .first()
    )
    if not row:
        return False
    if row.expires_at < datetime.utcnow():
        return False
    if row.otp_code != otp_code:
        return False
    row.verified = True
    db.commit()
    return True


def get_all_users(db: Session):
    return db.query(User).all()
