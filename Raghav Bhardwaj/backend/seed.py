#!/usr/bin/env python3
"""
Run this script to initialize the database and create demo data.
Usage: python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import init_db, SessionLocal
from app.models.models import User, Project
from app.services.auth_service import create_user
from app.schemas.schemas import UserCreate


def main():
    print("Initializing database...")
    init_db()
    print("✓ Tables created")

    db = SessionLocal()
    try:
        # Create users
        if not db.query(User).filter(User.username == "admin").first():
            create_user(db, UserCreate(username="admin", email="admin@drms.local", password="admin123", role="admin"))
            print("✓ Admin user created (admin / admin123)")
        else:
            print("  Admin user already exists")

        if not db.query(User).filter(User.username == "analyst").first():
            create_user(db, UserCreate(username="analyst", email="analyst@drms.local", password="analyst123", role="analyst"))
            print("✓ Analyst user created (analyst / analyst123)")
        else:
            print("  Analyst user already exists")

        print("\n✅ Database initialized successfully!")
        print("\nDefault credentials:")
        print("  admin    / admin123")
        print("  analyst  / analyst123")

    finally:
        db.close()


if __name__ == "__main__":
    main()
