from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from contextlib import asynccontextmanager

# Database & Core
from .database import init_db, SessionLocal
from .core.config import settings
from .schema_compat import apply_compat_patches
from .scheduler import service as scheduler_service

# Routes
from .routes import (
    auth, projects, datasets, mappings, rules, 
    executions, audit, export, schedules, ops_v1, 
    balances, aging, variance
)
from .sequence import routes as sequences
from .workflow import routes as workflow
from .enterprise import (
    routes as enterprise, 
    routes_v1 as enterprise_v1,
    profiles_v1,
    lifecycle_router,
    supporting_items_router,
    comment_router
)

# Helpers
def _seed_demo_user():
    # Placeholder for your user seeding logic
    pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        apply_compat_patches()
    except Exception as e:
        print(f"[schema_compat] Warning: {e}")

    try:
        _seed_demo_user()
    except Exception as e:
        print(f"[seed_demo_user] Warning: {e}")

    db = SessionLocal()
    try:
        from .services.demo_manager import run_demo_startup
        run_demo_startup(db)
    finally:
        db.close()

    if os.getenv("DISABLE_SCHEDULER", "false").lower() not in ("1", "true", "yes"):
        db = SessionLocal()
        try:
            scheduler_service.start_scheduler(db)
        finally:
            db.close()
    yield
    # Shutdown logic...

app = FastAPI(
    title="DRMS — Data Reconciliation Management System",
    version="2.0.0",
    docs_url="/api/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Router Registration ───────────────────────────────────────────────────────
# Keep these as-is for legacy support
app.include_router(auth.router, prefix="/api") 
app.include_router(projects.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(mappings.router, prefix="/api/v1")
app.include_router(rules.router, prefix="/api/v1")
app.include_router(executions.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(sequences.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(workflow.router, prefix="/api/v1")
app.include_router(enterprise.router, prefix="/api/v1/enterprise")
app.include_router(enterprise_v1.router, prefix="/api/v1/enterprise")
app.include_router(profiles_v1.router, prefix="/api/v1/profiles")
app.include_router(lifecycle_router.router, prefix="/api/v1")
app.include_router(supporting_items_router.router, prefix="/api/v1")
app.include_router(ops_v1.router, prefix="/api/v1/ops")
app.include_router(balances.router, prefix="/api/v1")
app.include_router(aging.router, prefix="/api/v1/exceptions") # Fixes 404s for aging endpoints
app.include_router(variance.router, prefix="/api/v1")
app.include_router(comment_router.router, prefix="/api/v1/enterprise/comments", tags=["comments"])
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
