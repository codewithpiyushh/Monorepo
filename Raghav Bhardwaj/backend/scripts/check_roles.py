"""Read-only checks: list users and reconciliation profiles with assigned approver/certifier.

Run from backend folder:
    python scripts/check_roles.py
"""
from pprint import pprint

from app.database import SessionLocal, init_db
from app.models.models import User, ReconciliationProfile


def main():
    init_db()
    session = SessionLocal()
    try:
        users = session.query(User).all()
        print("USERS:")
        for u in users:
            print(f"id={u.id} username={u.username} role={u.role}")

        print("\nRECONCILIATION PROFILES (assigned fields):")
        profiles = session.query(ReconciliationProfile).all()
        for p in profiles:
            print(f"id={p.id} name={p.name} assigned_preparer={p.assigned_preparer} assigned_reviewer={p.assigned_reviewer} assigned_approver={p.assigned_approver} assigned_certifier={p.assigned_certifier} lifecycle_state={p.lifecycle_state}")
    finally:
        session.close()


if __name__ == '__main__':
    main()
