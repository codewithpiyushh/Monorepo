#!/usr/bin/env python3
"""
Initialize database tables and seed demo users.
Usage: python seed.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, init_db
from app.models.models import User
from app.schemas.schemas import UserCreate
from app.services.auth_service import create_user


def _ensure_user(db, username: str, email: str, password: str, role: str) -> None:
    if db.query(User).filter(User.username == username).first():
        print(f"  {username} already exists")
        return
    create_user(
        db,
        UserCreate(username=username, email=email, password=password, role=role),
    )
    print(f"  Created {username} ({role})")


def main() -> None:
    print("Initializing database...")
    init_db()
    print("Tables ready")

    db = SessionLocal()
    try:
        _ensure_user(db, "admin", "admin@drms.local", "admin123", "admin")
        _ensure_user(db, "preparer", "preparer@drms.local", "preparer123", "preparer")
        _ensure_user(db, "reviewer", "reviewer@drms.local", "reviewer123", "reviewer")

        print("\nDatabase initialization completed.")
        print("Default credentials:")
        print("  admin    / admin123")
        print("  preparer / preparer123")
        print("  reviewer / reviewer123")
    finally:
        db.close()


if __name__ == "__main__":
    main()
