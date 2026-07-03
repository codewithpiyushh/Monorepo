# DRMS — Data Reconciliation Management System

> **Enterprise-grade reconciliation platform** for financial close, balance reconciliation,
> exception management, SLA monitoring, and multi-role certification workflows.

---

## 🚀 Quick Start

### 1 — Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2 — Frontend

```powershell
cd frontend
npm install
npm run dev
```

> Tables are auto-created on startup via raw SQL migrations (`IF NOT EXISTS`) and `Table.create(checkfirst=True)`. No Alembic needed.

---

## 🔑 Demo Credentials

| Role | Username | Password | Landing Page |
|------|----------|----------|--------------| 
| `admin` | admin | admin123 | Command Center |
| `preparer` | preparer | preparer123 | My Reconciliations |
| `approver` | approver | approver123 | Approver Dashboard |
| `certifier` | certifier | certifier123 | Executive Dashboard |

Set `DEMO_MODE=true` in `backend/.env` to auto-seed 10 enterprise profiles + 3 demo close periods + 4 SLA policies + initial violation scan on every restart.

---

## 📋 Demo Projects (Auto-Seeded in DEMO_MODE)

| # | Project Name | Type | Key Feature |
|---|--------------|------|-------------|
| 1 | Bank Reconciliation — US Corporate | GL vs Bank Statement | Reference match + date window |
| 2 | Accounts Receivable — EMEA Region | Invoices vs Receipts | FX tolerance + unmatched items |
| 3 | Accounts Payable — Global Vendor Payments | AP Ledger vs Invoices | Duplicate detection |
| 4 | Intercompany Reconciliation — APAC Entities | Entity A vs Entity B | Multi-currency USD equivalent |
| 5 | Payroll Reconciliation — North America | HR Extract vs Bank | 3-way exact match |

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI 0.115 + SQLAlchemy 2.x + Python 3.11 |
| Frontend | React 18 + Vite 5 + TanStack Query + Vanilla CSS |
| Database | MySQL (production) |
| Auth | JWT (HS256) + RBAC role middleware |
| Charts | Apache ECharts (via echarts-for-react) |
| Scheduler | APScheduler (aging escalations, SLA scan, monthly snapshots) |
| Migrations | Raw SQL `CREATE TABLE IF NOT EXISTS` + `information_schema` guards |

---

## 👥 Roles & Workflows

| Role | Landing Page | Sidebar |
|------|-------------|---------|
| **Admin** | `/command-center` | Home, Reconciliation, Analytics, Close Management, Configuration, Governance (SLA Monitor, Escalation Workbench) |
| **Preparer** | `/my-reconciliations` | Home, Reconciliation (My Recons + Workbench), Analytics (Aging + Variance), Performance |
| **Approver** | `/approver-dashboard` | Home, Approval (Pending + Escalated), Exception Mgmt, Analytics |
| **Certifier** | `/executive-dashboard` | Home, Certification, Analytics, Close Management, Governance |

**End-to-end lifecycle:**
```
OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED
```

**SLA lifecycle state mapping:**
```
DRAFT         → violation_type: SLA_BREACH          (age anchor: created_at)
UNDER_REVIEW  → violation_type: APPROVAL_BOTTLENECK  (age anchor: submitted_at)
APPROVED      → violation_type: CERTIFICATION_OVERDUE (age anchor: approved_at)
```

---

## 📁 Key Source Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, lifespan, migrations, demo startup |
| `backend/app/models/models.py` | 32+ SQLAlchemy ORM models (incl. SLAPolicy, SLAViolation) |
| `backend/app/enterprise/service.py` | Enterprise profile & certification logic |
| `backend/app/enterprise/lifecycle_service.py` | Certification lifecycle state machine |
| `backend/app/services/balance_service.py` | Balance reconciliation workflow |
| `backend/app/services/variance_service.py` | Variance engine (explained/unexplained/flux) |
| `backend/app/services/matching_engine.py` | Transaction matching algorithm |
| `backend/app/services/close_calendar_service.py` | **Financial Close Calendar orchestration** |
| `backend/app/routes/close_calendar.py` | **Close Calendar REST endpoints** |
| `backend/app/models/close_calendar_migration.py` | **Close Calendar MySQL migration** |
| `backend/app/services/sla_monitoring_service.py` | **SLA scan engine (scheduled + manual)** |
| `backend/app/services/escalation_service.py` | **3-level escalation ladder** |
| `backend/app/routes/sla_router.py` | **SLA REST endpoints** |
| `backend/app/models/sla_monitoring_migration.py` | **SLA migration (checkfirst=True)** |
| `backend/app/rbac/rls.py` | **Enterprise Role-Based Row-Level Security Engine** |
| `backend/app/scheduler/service.py` | APScheduler: aging + SLA + snapshot jobs |
| `backend/app/services/demo_seed.py` | Demo matrix seeder (10 projects + 3 periods + SLA) |
| `frontend/src/App.jsx` | Route definitions for all roles |
| `frontend/src/components/Layout.jsx` | Sidebar navigation (all 4 role variants) |
| `frontend/src/pages/ApproverDashboard.jsx` | Approver KPI landing page |
| `frontend/src/pages/FinancialCloseCalendarPage.jsx` | **Financial Close Calendar UI** |
| `frontend/src/pages/TransactionMatchingWorkspace.jsx` | **Oracle ARCS-style Interactive Matching Workbench** |
| `frontend/src/pages/SLAMonitorDashboard.jsx` | **SLA Monitor dashboard** |
| `frontend/src/pages/EscalationWorkbench.jsx` | **Escalation management UI** |
| `frontend/src/pages/BalanceReconciliationPage.jsx` | Balance workspace (with slide-out History Drawer) |
| `frontend/src/pages/VarianceAnalyticsDashboard.jsx` | Variance analytics (interactive, RLS scoped) |
| `frontend/src/pages/RiskDashboard.jsx` | Risk analytics dashboard (interactive, RLS scoped) |
| `frontend/src/pages/AgingDashboard.jsx` | Aging analytics dashboard (interactive, RLS scoped) |

---

## 🔗 API

- **API Docs (Swagger):** `http://localhost:8000/api/docs`
- **Health Check:** `http://localhost:8000/api/health`

### Core Endpoints

```
POST /api/auth/login
GET  /api/projects
POST /api/projects/{id}/datasets           Upload CSV
POST /api/projects/{id}/executions         Run matching
POST /api/projects/{id}/executions/{eid}/promote  → Enterprise profile

GET  /api/enterprise/profiles              List profiles
GET  /api/v1/balances/profiles/{id}/balances
GET  /api/v1/analytics/variance/{id}
GET  /api/v1/exceptions/aging

GET  /api/v1/close-calendar/periods        Close period list + KPIs
GET  /api/v1/close-calendar/{id}/dashboard Period dashboard + SLA section
GET  /api/v1/close-calendar/{id}/validate-close  Close readiness check
PATCH /api/v1/close-calendar/{id}/close   Attempt to close period

GET  /api/v1/sla/violations                My SLA violations (scoped)
GET  /api/v1/sla/violations/team           Approver team view
GET  /api/v1/sla/violations/enterprise     Certifier enterprise view
GET  /api/v1/sla/violations/all            Admin full view (filterable)
POST /api/v1/sla/violations/{id}/acknowledge
POST /api/v1/sla/violations/{id}/override  Admin only
POST /api/v1/sla/violations/{id}/resolve   Admin only
GET  /api/v1/sla/policies                  SLA policy list
POST /api/v1/sla/policies                  Admin: create policy
PUT  /api/v1/sla/policies/{id}             Admin: update policy
POST /api/v1/sla/scan                      Admin: manual scan trigger
```

---

## 📚 More Documentation

- **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)** — Architecture, roles, and detailed workflow guide
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** — Current build status and implemented features
- **[CLAUDE_CONTEXT.md](./CLAUDE_CONTEXT.md)** — Full AI context document (data models, API, design decisions)
