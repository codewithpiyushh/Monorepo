import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DB_PATH = Path(__file__).resolve().parents[1] / "drms_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("UPLOAD_DIR", "./uploads")
os.environ["DISABLE_SCHEDULER"] = "true"

from app.main import app  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.models import User  # noqa: E402
from app.schemas.schemas import UserCreate  # noqa: E402
from app.services.auth_service import create_user  # noqa: E402


def _ensure_user(username: str, email: str, password: str, role: str) -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            return
        create_user(
            db,
            UserCreate(username=username, email=email, password=password, role=role),
        )
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    Base.metadata.create_all(bind=engine)
    _ensure_user("admin", "admin@drms.com", "admin123", "admin")
    _ensure_user("preparer", "preparer@drms.com", "preparer123", "preparer")
    _ensure_user("reviewer", "reviewer@drms.com", "reviewer123", "reviewer")
    _ensure_user("approver", "approver@drms.com", "approver123", "approver")
    _ensure_user("certifier", "certifier@drms.com", "certifier123", "certifier")
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture()
def client(setup_test_db):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client):
    def _login(username: str, password: str):
        r = client.post("/api/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return {
        "admin": _login("admin", "admin123"),
        "preparer": _login("preparer", "preparer123"),
        "reviewer": _login("reviewer", "reviewer123"),
        "approver": _login("approver", "approver123"),
        "certifier": _login("certifier", "certifier123"),
    }


@pytest.fixture()
def sample_csv_files():
    source = io.BytesIO(
        b"entity,account,reference,amount,date\n"
        b"US,1000,INV-900,100,2026-04-01\n"
        b"US,1000,INV-901,220,2026-04-02\n"
    )
    target = io.BytesIO(
        b"entity,account,reference,amount,date\n"
        b"US,1000,INV-900,100,2026-04-01\n"
        b"US,1000,INV-999,200,2026-04-03\n"
    )
    return {"source": source, "target": target}
