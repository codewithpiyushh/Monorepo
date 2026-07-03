from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from contextlib import asynccontextmanager

from .database import init_db, SessionLocal, engine
from .core.config import settings
from .schema_compat import apply_compat_patches
from .scheduler import service as scheduler_service

from .routes import (
    auth, projects, datasets, mappings, rules,
    executions, audit, export, schedules, ops_v1,
    balances, aging, variance, close_calendar, sla_router,
    notifications, fx_router, matching_router, bulk_router,
    ingestion_router, auto_cert_router,
    risk_config_router, approval_chains_router, compliance_policy_router, evidence_retention_router,
    close_task_router, entity_signoff_router, close_readiness_router
)
from .sequence import routes as sequences
from .workflow import routes as workflow
from .enterprise import (
    routes as enterprise,
    routes_v1 as enterprise_v1,
    profiles_v1,
    lifecycle_router,
    supporting_items_router,
    comment_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    try:
        apply_compat_patches()
    except Exception as e:
        print(f"[schema_compat] Warning: {e}")

    # Phase 1 migrations
    try:
        from .models.profile_migration import migrate as migrate_profiles
        migrate_profiles(engine)
    except Exception as e:
        print(f"[profile_migration] Warning: {e}")

    # Phase 2 Chunk 1 — supporting items table
    try:
        from .models.supporting_items_migration import migrate as migrate_supporting_items
        migrate_supporting_items(engine)
    except Exception as e:
        print(f"[supporting_items_migration] Warning: {e}")

    # Phase 2 Chunk 2 — comment threads tables
    try:
        from .models.comment_threads_migration import migrate as migrate_comments
        migrate_comments(engine)
    except Exception as e:
        print(f"[comment_threads_migration] Warning: {e}")

    # Phase 2 Chunk 2 — approval chain / delegation columns
    try:
        from .models.phase2_workflow_migration import migrate as migrate_phase2
        migrate_phase2(engine)
    except Exception as e:
        print(f"[phase2_workflow_migration] Warning: {e}")

    # Phase 2 Chunk 3 — financial close calendar tables
    try:
        from .models.close_calendar_migration import migrate as migrate_close_calendar
        migrate_close_calendar(engine)
    except Exception as e:
        print(f"[close_calendar_migration] Warning: {e}")

    # Phase 2 Chunk 4 — SLA monitoring & escalation tables
    try:
        from .models.sla_monitoring_migration import migrate as migrate_sla
        migrate_sla(engine)
    except Exception as e:
        print(f"[sla_monitoring_migration] Warning: {e}")

    # Phase 3 — Full Transaction Matching workflow columns
    try:
        from .models.matching_migration import migrate as migrate_matching
        migrate_matching(engine)
    except Exception as e:
        print(f"[matching_migration] Warning: {e}")

    # Phase 3 - Root Cause Taxonomy Migration
    try:
        from .models.root_cause_migration import migrate as migrate_root_cause
        migrate_root_cause(engine)
    except Exception as e:
        print(f"[root_cause_migration] Warning: {e}")

    # Phase 3 - Chunk 8 (Ingestion) & Chunk 9 (Auto-Cert)
    try:
        from .models.ingestion_migration import migrate as migrate_ingestion
        migrate_ingestion(engine)
        from .models.auto_cert_migration import migrate as migrate_auto_cert
        migrate_auto_cert(engine)
    except Exception as e:
        print(f"[chunk8_9_migration] Warning: {e}")

    # Phase 4 - Admin, Governance & Risk Migration
    try:
        from .models.risk_config_migration import migrate as migrate_risk_config
        migrate_risk_config(engine)
        from .models.approval_chains_migration import migrate as migrate_approval_chains
        migrate_approval_chains(engine)
        from .models.compliance_policy_migration import migrate as migrate_compliance_policy
        migrate_compliance_policy(engine)
        from .models.evidence_retention_migration import migrate as migrate_evidence_retention
        migrate_evidence_retention(engine)
    except Exception as e:
        print(f"[admin_governance_migration] Warning: {e}")

    # Phase 5 - Close Workflow & Certification Migration
    try:
        from .models.entity_signoff_migration import migrate as migrate_entity_signoffs
        migrate_entity_signoffs(engine)
    except Exception as e:
        print(f"[entity_signoff_migration] Warning: {e}")

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

# Enterprise routers — each already carries its own prefix
app.include_router(enterprise.router)        # prefix="/api/enterprise"
app.include_router(enterprise_v1.router)     # prefix="/api/v1/enterprise"
app.include_router(profiles_v1.router)       # prefix="/api/v1/profiles"
app.include_router(lifecycle_router.router)  # prefix="/api/v1/balances"
app.include_router(lifecycle_router.profiles_router)  # prefix="/api/v1/profiles"
app.include_router(supporting_items_router.router)    # prefix="/api/v1/supporting-items"
app.include_router(comment_router.router)    # prefix="/api/v1/balances"
app.include_router(balances.router)          # prefix="/api/v1/balances"
app.include_router(aging.router)             # prefix="/api/v1/exceptions"
app.include_router(variance.router)          # prefix="/api/v1/analytics" + "/api/v1/balances"
app.include_router(ops_v1.router)            # prefix="/api/v1/ops"
app.include_router(aging.router, prefix="/api/v1/exceptions")
app.include_router(close_calendar.router)  # prefix="/api/v1/close-calendar"
app.include_router(sla_router.router)      # prefix="/api/v1/sla"
app.include_router(notifications.router)   # prefix="/api/v1/notifications" Phase 3
app.include_router(fx_router.router)       # prefix="/api/v1/fx"            Phase 3
app.include_router(matching_router.router) # prefix="/api/v1/matching"      Phase 3 Full
app.include_router(bulk_router.router)     # prefix="/api/v1/bulk"           Phase 3 Bulk Ops
app.include_router(ingestion_router.router, prefix="/api/v1")
app.include_router(auto_cert_router.router, prefix="/api/v1")
app.include_router(risk_config_router.router)
app.include_router(approval_chains_router.router)
app.include_router(compliance_policy_router.router)
app.include_router(evidence_retention_router.router)
app.include_router(close_task_router.router)
app.include_router(entity_signoff_router.router)
app.include_router(close_readiness_router.router)

def _seed_demo_user():
    from .services.auth_service import create_user
    from .schemas.schemas import UserCreate

    db = SessionLocal()
    try:
        from .models.models import User

        # Migrate legacy 'analyst' role to 'preparer'
        for legacy_user in db.query(User).filter(User.role == "analyst").all():
            legacy_user.role = "preparer"
        db.commit()

        demo_users = [
            ("admin",     "admin@drms.com",     "admin123",     "admin"),
            ("preparer",  "preparer@drms.com",  "preparer123",  "preparer"),
            ("approver",  "approver@drms.com",  "approver123",  "approver"),
            ("certifier", "certifier@drms.com", "certifier123", "certifier"),
        ]
        for username, email, password, role in demo_users:
            if not db.query(User).filter(User.username == username).first():
                create_user(db, UserCreate(username=username, email=email, password=password, role=role))
                
        # Assign hierarchy: certifier -> approver -> preparer
        cert = db.query(User).filter(User.username == "certifier").first()
        appr = db.query(User).filter(User.username == "approver").first()
        prep = db.query(User).filter(User.username == "preparer").first()
        
        if cert and appr:
            appr.manager_id = cert.id
        if appr and prep:
            prep.manager_id = appr.id
            
        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "DRMS API"}