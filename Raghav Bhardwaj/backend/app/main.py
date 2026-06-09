from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from .database import init_db
from .routes import auth, projects, datasets, mappings, rules, executions, audit, export, schedules
from .routes import ops_v1
from .sequence import routes as sequences
from .workflow import routes as workflow
from .services.auth_service import create_user
from .schemas.schemas import UserCreate
from .database import SessionLocal
from .scheduler import service as scheduler_service
from .enterprise import routes as enterprise
from .enterprise import routes_v1 as enterprise_v1
from .schema_compat import apply_compat_patches

app = FastAPI(
    title="DRMS — Data Reconciliation Management System",
    description=(
        "Enterprise-grade data reconciliation platform inspired by Oracle ARCS.\n\n"
        "Authentication: use `/api/auth/login`, then pass `Authorization: Bearer <token>`.\n"
        "Versioned APIs are available under `/api/v1/enterprise` and `/api/v1/ops`.\n"
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(mappings.router)
app.include_router(rules.router)
app.include_router(executions.router)
app.include_router(audit.router)
app.include_router(export.router)
app.include_router(sequences.router)
app.include_router(schedules.router)
app.include_router(workflow.router)
app.include_router(enterprise.router)
app.include_router(enterprise_v1.router)
app.include_router(ops_v1.router)


@app.on_event("startup")
def on_startup():
    init_db()
    apply_compat_patches()
    _seed_demo_user()
    if os.getenv("DISABLE_SCHEDULER", "false").lower() not in ("1", "true", "yes"):
        db = SessionLocal()
        try:
            scheduler_service.start_scheduler(db)
        finally:
            db.close()


@app.on_event("shutdown")
def on_shutdown():
    if os.getenv("DISABLE_SCHEDULER", "false").lower() not in ("1", "true", "yes"):
        scheduler_service.shutdown_scheduler()


def _seed_demo_user():
    db = SessionLocal()
    try:
        from .models.models import User
        legacy_analysts = db.query(User).filter(User.role == "analyst").all()
        for legacy_user in legacy_analysts:
            legacy_user.role = "preparer"
        if legacy_analysts:
            db.commit()
        if not db.query(User).filter(User.username == "admin").first():
            create_user(
                db,
                UserCreate(
                    username="admin",
                    email="admin@drms.com",
                    password="admin123",
                    role="admin",
                ),
            )
        if not db.query(User).filter(User.username == "reviewer").first():
            create_user(
                db,
                UserCreate(
                    username="reviewer",
                    email="reviewer@drms.com",
                    password="reviewer123",
                    role="reviewer",
                ),
            )
        if not db.query(User).filter(User.username == "preparer").first():
            create_user(
                db,
                UserCreate(
                    username="preparer",
                    email="preparer@drms.com",
                    password="preparer123",
                    role="preparer",
                ),
            )
        if not db.query(User).filter(User.username == "approver").first():
            create_user(
                db,
                UserCreate(
                    username="approver",
                    email="approver@drms.com",
                    password="approver123",
                    role="approver",
                ),
            )
        if not db.query(User).filter(User.username == "certifier").first():
            create_user(
                db,
                UserCreate(
                    username="certifier",
                    email="certifier@drms.com",
                    password="certifier123",
                    role="certifier",
                ),
            )
        if not db.query(User).filter(User.username == "auditor").first():
            create_user(
                db,
                UserCreate(
                    username="auditor",
                    email="auditor@drms.com",
                    password="auditor123",
                    role="auditor",
                ),
            )
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "DRMS API"}
