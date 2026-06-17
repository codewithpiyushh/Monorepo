# DRMS — Project Guide

**Purpose:** Complete reference for the Data Reconciliation Management System — architecture,
roles, end-to-end workflows, API reference, and demo usage guide.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Roles & Responsibilities](#3-roles--responsibilities)
4. [End-to-End Workflows](#4-end-to-end-workflows)
5. [Demo Projects](#5-demo-projects)
6. [Local Setup](#6-local-setup)
7. [API Reference](#7-api-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Project Overview

DRMS is an enterprise financial reconciliation platform that lets teams:

- Upload **source** and **target** datasets (CSV)
- Define **field mappings** and **matching rules**
- Run **execution engines** that match transactions and generate match groups
- Manage **exceptions** with aging, escalation, and investigation workflows
- Track **balance reconciliations** with variance analysis
- Drive a **multi-role certification lifecycle** (Preparer → Reviewer → Approver → Certifier)
- Provide **auditors** with a complete, tamper-evident audit trail

**Stack:**

| Component | Technology |
|-----------|-----------|
| Backend   | FastAPI 0.115 + SQLAlchemy 2.x + Python 3.11 |
| Frontend  | React 18 + Vite 5 + TanStack Query + Tailwind CSS |
| Database  | MySQL (production) / SQLite (local dev) |
| Auth      | JWT HS256 + RBAC middleware |

---

## 2. Architecture

### Backend — `backend/app/`

```
app/
├── main.py                   FastAPI app, lifespan, demo startup
├── database.py               DB engine & session factory
├── core/config.py            Settings (DATABASE_URL, DEMO_MODE, …)
├── models/models.py          SQLAlchemy ORM models
├── routes/                   REST endpoints
│   ├── auth.py               Login / token
│   ├── projects.py           Project CRUD
│   ├── datasets.py           CSV upload
│   ├── mappings.py           Field mappings
│   ├── rules.py              Matching rules
│   ├── executions.py         Run & poll executions
│   ├── balances.py           Balance workspace
│   ├── variance.py           Variance analytics
│   ├── aging.py              Exception aging
│   ├── export.py             Excel/CSV exports
│   └── audit.py              Audit logs
├── enterprise/               Enterprise profile module
│   ├── routes.py             Enterprise profile endpoints
│   ├── service.py            Full enterprise service (1200+ lines)
│   ├── lifecycle_service.py  Balance lifecycle state machine
│   ├── lifecycle_router.py   Balance & profile v1 routes
│   ├── profiles_v1.py        Profile v1 endpoints
│   ├── supporting_items_*    Evidence & supporting items
│   └── comment_*             Comment threads
├── services/
│   ├── execution_service.py  Execution orchestration
│   ├── matching_engine.py    Core matching algorithm
│   ├── balance_service.py    Balance reconciliation
│   ├── variance_service.py   Variance engine
│   ├── aging_service.py      Exception aging
│   ├── risk_scoring_engine.py Risk scoring
│   ├── demo_seed.py          10-project enterprise matrix seeder
│   └── demo_manager.py       Demo mode startup controller
├── rbac/                     Role-based access control
├── scheduler/                Background job scheduler
├── sequence/                 Close sequence management
└── workflow/                 Workflow routes
```

### Frontend — `frontend/src/`

```
src/
├── App.jsx                   Routes for all roles
├── components/
│   ├── Layout.jsx            Sidebar + navigation (role-aware)
│   ├── UploadStep.jsx        Dataset upload wizard step
│   ├── MappingStep.jsx       Field mapping wizard step
│   ├── RulesStep.jsx         Rules builder wizard step
│   ├── ExecuteStep.jsx       Execution run wizard step
│   ├── balance/              Balance workspace components
│   ├── analytics/            Chart components
│   ├── exception/            Exception components
│   └── profile/              Profile card components
└── pages/
    ├── Login.jsx
    ├── CommandCenter.jsx        Admin ops dashboard
    ├── PreparerWorkbench.jsx    Preparer main UI
    ├── ApproverWorkbench.jsx    Approver queue (merged review + approval)
    ├── CloseCertificationPage.jsx  Certifier sign-off
    ├── BalanceReconciliationPage.jsx  Balance workspace
    ├── VarianceAnalyticsDashboard.jsx Variance charts
    ├── AgingDashboard.jsx       Exception aging
    ├── RiskDashboard.jsx        Risk heat map
    ├── ExceptionWorkbench.jsx   Exception management
    ├── ExecutiveDashboard.jsx   KPI overview
    ├── ReconciliationProfilesPage.jsx  Profile list
    ├── AdminCenter.jsx          User & settings admin
    ├── AuditLogs.jsx            Admin audit trail view
    └── WorkQueue.jsx            Approver work queue (review + approval)
```

---

## 3. Roles & Responsibilities

| Role | Landing Page | Key Capabilities |
|------|-------------|-----------------|
| **Admin** | `/command-center` | User management, system config, seed data, view all profiles, audit trail access |
| **Preparer** | `/my-reconciliations` | Upload data, map fields, run execution, resolve exceptions, attach evidence, submit |
| **Approver** | `/work-queue` | Review submissions & evidence, approve / return / escalate, manage reconciliations |
| **Certifier** | `/close-certification` | Final sign-off, issue close certification |

### Role-based Route Protection

The `ProtectedRoute` component wraps role-sensitive pages.
`DefaultPageRedirect` ensures each role lands on the correct start page after login.

---

## 4. End-to-End Workflows

### 4a. Transaction Reconciliation (Project Flow)

```
1. Admin creates project (name, description)
2. Preparer uploads source CSV + target CSV
3. Preparer defines field mappings (source_col → target_col)
4. Preparer configures matching rules (exact / tolerance / date_diff / fuzzy)
5. System runs execution → matching engine produces match groups
6. Preparer reviews match groups, resolves exceptions, adds evidence
7. Admin promotes execution → Enterprise Profile
8. Full certification lifecycle begins (see 4b)
```

### 4b. Certification Lifecycle

```
OPEN
 └→ [Preparer] submits reconciliation
     PREPARED / SUBMITTED
      └→ [Reviewer] first-pass review
          UNDER_REVIEW
           └→ [Approver] second-level approval
               APPROVED
                └→ [Certifier] final sign-off
                    CERTIFIED  ✔
```

At each stage, the actor can **Approve**, **Return** (send back one level), or **Escalate**.

### 4c. Balance Reconciliation Flow

```
1. Profile has source_balance + target_balance
2. System calculates variance_amount and variance_severity_classification:
   - BALANCED (0 variance)
   - WITHIN_THRESHOLD (≤ threshold)
   - MATERIAL_VARIANCE (> threshold, ≤ materiality limit)
   - CRITICAL_VARIANCE (> materiality limit)
3. Preparer must provide root-cause narrative for MATERIAL/CRITICAL
4. Variance analytics dashboard shows explained / unexplained / flux by period
5. Submission is blocked until narrative gate is satisfied
```

### 4d. Exception Aging

Exceptions are bucketed by days-outstanding:
- **0–30 days** — Current
- **31–60 days** — Aged
- **61–90 days** — Escalate-eligible
- **90+ days** — Critical / overdue

---

## 5. Demo Projects

Run `backend/scripts/seed_demo_projects.py` (backend must be running) to create 5 showcase projects:

| # | Name | Scenario | Interesting Data Points |
|---|------|----------|------------------------|
| 1 | **Bank Reconciliation — US Corporate** | GL vs Bank Statement | Interest income unmatched; 1-day date drift on fee |
| 2 | **Accounts Receivable — EMEA** | Invoices vs Receipts | CHF FX rounding variance (INV-004); 2 outstanding + 1 disputed invoice |
| 3 | **Accounts Payable — Global** | AP Ledger vs Vendor Invoices | AWS duplicate payment (PAY-010 duplicates PAY-002); 1 new unmatched vendor |
| 4 | **Intercompany — APAC** | Entity A vs Entity B | Multi-currency SGD/HKD with USD equivalent matching; unbooked accrual |
| 5 | **Payroll — North America** | HR Extract vs Bank Transfer | Unknown employee transfer (EMP-099); CA vs US payroll separation |

> The demo matrix seeder (`demo_seed.py`) creates 10 additional enterprise profiles on startup when `DEMO_MODE=true`.

### Demo User Credentials

| Role | Username | Password |
|------|----------|----------|
| admin | admin | admin123 |
| preparer | preparer | preparer123 |
| reviewer | reviewer | reviewer123 |
| approver | approver | approver123 |
| certifier | certifier | certifier123 |
| auditor | auditor | auditor123 |

---

## 6. Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- MySQL 8.x (or use SQLite for local dev by changing `DATABASE_URL`)

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configure .env (DATABASE_URL, SECRET_KEY, DEMO_MODE)
# For quick local dev with SQLite:
#   DATABASE_URL=sqlite:///./drms_demo.db
#   DEMO_MODE=false

uvicorn app.main:app --reload --port 8000
```

On startup, `main.py` will:
1. Run DB migrations automatically
2. Seed 4 demo users (all roles: admin, preparer, approver, certifier)
3. If `DEMO_MODE=true`: purge old demo data and re-seed 10-project matrix

### Frontend

```powershell
cd frontend
npm install
npm run dev
# Available at http://localhost:5173
```

### Seed 5 Full-Flow Demo Projects

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python scripts/seed_demo_projects.py
```

This creates all 5 projects via the REST API — with source/target datasets, mappings,
rules, a triggered execution, and promotion to Enterprise Profile.

---

## 7. API Reference

**Base URL:** `http://localhost:8000`  
**Auth:** `Authorization: Bearer <token>` (obtain via `POST /api/auth/login`)  
**Swagger UI:** `http://localhost:8000/api/docs`

### Auth

```
POST /api/auth/login           { username, password } → { access_token }
GET  /api/users/me             Current user profile
GET  /api/users                All users (admin)
```

### Projects

```
GET  /api/projects             List projects
POST /api/projects             Create project
GET  /api/projects/{id}        Get project details
```

### Datasets & Mappings

```
POST /api/projects/{id}/datasets    Upload CSV (multipart: file + dataset_type)
POST /api/projects/{id}/mappings    Create mappings [{ source_column, target_column, is_key_field }]
POST /api/projects/{id}/rules       Add rule { name, rule_type, config }
```

### Executions

```
POST /api/projects/{id}/executions                  Trigger execution
GET  /api/projects/{id}/executions/{eid}            Get execution status
POST /api/projects/{id}/executions/{eid}/promote    Promote to Enterprise Profile
```

### Enterprise Profiles

```
GET  /api/enterprise/profiles                       List all profiles
GET  /api/enterprise/profiles/{pid}                 Get profile detail
POST /api/v1/profiles/{pid}/lifecycle/submit        Preparer submits
POST /api/v1/profiles/{pid}/lifecycle/review        Reviewer action
POST /api/v1/profiles/{pid}/lifecycle/approve       Approver action
POST /api/v1/profiles/{pid}/lifecycle/certify       Certifier sign-off
```

### Balance & Variance

```
GET  /api/v1/balances/profiles/{pid}/balances       Balance workspace data
POST /api/v1/balances/profiles/{pid}/balances       Create/update balance
GET  /api/v1/analytics/variance/{pid}               Variance analytics
GET  /api/v1/analytics/variance/{pid}/snapshots     Period snapshots
```

### Exceptions & Aging

```
GET  /api/v1/exceptions/aging                       Exception aging buckets
GET  /api/v1/exceptions/queue                       Exception queue
```

### Export & Audit

```
GET  /api/export/project/{id}                       Export project data (Excel)
GET  /api/audit/logs                                Audit trail
```

---

## 8. Troubleshooting

### "Legacy Mode" banner in the UI

Appears when you navigate to `/projects/:projectId/preparer` (direct execution route).
The execution has not been promoted yet.

**Fix:** Promote the execution via `POST /api/projects/{id}/executions/{eid}/promote`
or use the **Promote** button in the Execution Workbench.

### 403 Access Denied for Approver/Certifier

Check in order:
1. **Role correct?** `GET /api/users` — verify the `role` field.
2. **Profile assignment?** `assigned_approver` / `assigned_certifier` must match the user's `id`.
3. **Workflow stage?** The certification workflow must be at the stage that allows the action.
4. **Legacy mode?** Promote the execution first.

### Database migration errors

If you see column-not-found errors, the auto-migrations in `main.py` lifespan may have been
skipped. Re-run the backend with a fresh DB or run each migration manually:

```python
from app.database import engine
from app.models.profile_migration import migrate
migrate(engine)
```

### Demo data not appearing

Ensure `DEMO_MODE=true` in `backend/.env` and restart the backend.
The demo manager purges old demo records and re-seeds on every restart.

---

*Generated: 2026-06-16 — update this file when major features are added or changed.*
