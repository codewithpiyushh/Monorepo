# DRMS — Data Reconciliation Management System

> **Enterprise-grade reconciliation platform** for financial close, balance reconciliation,
> exception management, and multi-role certification workflows.

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

### 3 — Seed Demo Projects (5 realistic projects, all roles)

```powershell
# Backend must be running first
cd backend
.\.venv\Scripts\Activate.ps1
python scripts/seed_demo_projects.py
```

---

## 🔑 Demo Credentials

| Role        | Username    | Password      | Landing Page                  |
|-------------|-------------|---------------|-------------------------------|
| `admin`     | admin       | admin123      | Command Center                |
| `preparer`  | preparer    | preparer123   | My Reconciliations            |
| `approver`  | approver    | approver123   | Work Queue (review + approve) |
| `certifier` | certifier   | certifier123  | Close Certification           |

---

## 📋 Demo Projects (Seeded)

| # | Project Name                                | Type                    | Key Feature Covered             |
|---|---------------------------------------------|-------------------------|---------------------------------|
| 1 | Bank Reconciliation — US Corporate          | GL vs Bank Statement    | Reference match + date window   |
| 2 | Accounts Receivable — EMEA Region           | Invoices vs Receipts    | FX tolerance + unmatched items  |
| 3 | Accounts Payable — Global Vendor Payments   | AP Ledger vs Invoices   | Duplicate detection             |
| 4 | Intercompany Reconciliation — APAC Entities | Entity A vs Entity B    | Multi-currency USD equivalent   |
| 5 | Payroll Reconciliation — North America      | HR Extract vs Bank      | 3-way exact match               |

---

## 🏗️ Tech Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Backend  | FastAPI 0.115 + SQLAlchemy 2.x + Python 3.11        |
| Frontend | React 18 + Vite 5 + TanStack Query + Tailwind CSS   |
| Database | MySQL (production) / SQLite (local dev)             |
| Auth     | JWT (HS256) + RBAC role middleware                  |

---

## 👥 Roles & Workflows

```
Preparer  → uploads data, resolves exceptions, submits for review
Approver  → review & approval with evidence check, can return/escalate
Certifier → final sign-off and close certification
Admin     → user management, system config, audit logs, command center
```

**End-to-end lifecycle:**
`OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED`

---

## 📁 Key Source Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, lifespan, demo startup |
| `backend/app/enterprise/service.py` | Enterprise profile & certification logic |
| `backend/app/services/balance_service.py` | Balance reconciliation workflow |
| `backend/app/services/variance_service.py` | Variance engine (explained/unexplained/flux) |
| `backend/app/services/matching_engine.py` | Transaction matching algorithm |
| `backend/app/services/demo_seed.py` | Enterprise demo matrix seeder (10 projects) |
| `backend/scripts/seed_demo_projects.py` | **Full-flow demo project creator (5 projects)** |
| `frontend/src/App.jsx` | Route definitions for all roles |
| `frontend/src/pages/PreparerWorkbench.jsx` | Preparer UI (upload, evidence, submit) |
| `frontend/src/pages/ApproverWorkbench.jsx` | Approver UI (review & approval queue) |
| `frontend/src/pages/BalanceReconciliationPage.jsx` | Balance workspace |
| `frontend/src/pages/VarianceAnalyticsDashboard.jsx` | Variance analytics |

---

## 🔗 API

- **API Docs (Swagger):** `http://localhost:8000/api/docs`
- **Health Check:** `http://localhost:8000/api/health`

### Core Endpoints

```
POST /api/auth/login                              Login
GET  /api/projects                                List projects
POST /api/projects                                Create project
POST /api/projects/{id}/datasets                  Upload dataset CSV
POST /api/projects/{id}/mappings                  Create field mappings
POST /api/projects/{id}/rules                     Add matching rules
POST /api/projects/{id}/executions                Run reconciliation
POST /api/projects/{id}/executions/{eid}/promote  Promote to enterprise profile
GET  /api/enterprise/profiles                     List enterprise profiles
GET  /api/v1/balances/profiles/{id}/balances      Balance workspace data
GET  /api/v1/analytics/variance/{id}              Variance analytics
GET  /api/audit/logs                              Audit trail
```

---

## 📚 More Documentation

- **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)** — Architecture, roles, and detailed workflow guide
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** — Current build status and implemented features
