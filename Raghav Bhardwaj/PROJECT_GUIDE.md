# DRMS — Project Guide

**Purpose:** Complete reference for the Data Reconciliation Management System — architecture,
roles, end-to-end workflows, API reference, and demo usage guide.

**Last Updated:** 2026-07-03

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Roles & Responsibilities](#3-roles--responsibilities)
4. [Sidebar Navigation by Role](#4-sidebar-navigation-by-role)
5. [End-to-End Workflows](#5-end-to-end-workflows)
6. [Financial Close Calendar](#6-financial-close-calendar)
7. [SLA Monitoring & Escalation Engine](#7-sla-monitoring--escalation-engine)
8. [Demo Projects & Seeding](#8-demo-projects--seeding)
9. [Local Setup](#9-local-setup)
10. [API Reference](#10-api-reference)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Project Overview

DRMS is an enterprise financial reconciliation platform that lets teams:

- Upload **source** and **target** datasets (CSV)
- Define **field mappings** and **matching rules**
- Run **execution engines** that match transactions and generate match groups
- Manage **exceptions** with aging, escalation, and investigation workflows
- Track **balance reconciliations** with variance analysis
- Drive a **multi-role certification lifecycle** (Preparer → Approver → Certifier)
- **Orchestrate month-end close** across all active profiles via the Financial Close Calendar
- Provide **auditors** with a complete, tamper-evident hash-chain audit trail

**Stack:**

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI 0.115 + SQLAlchemy 2.x + Python 3.11 |
| Frontend | React 18 + Vite 5 + TanStack Query + Vanilla CSS |
| Database | MySQL (production) |
| Auth | JWT HS256 + RBAC middleware |
| Charts | Apache ECharts (echarts-for-react) |
| Migrations | Raw SQL `CREATE TABLE IF NOT EXISTS` + `information_schema` guards |

---

## 2. Architecture

### Backend — `backend/app/`

```
app/
├── main.py                   FastAPI app, lifespan, all migration calls, demo startup
├── database.py               DB engine & session factory
├── schema_compat.py          DB schema compatibility patches
├── core/config.py            Settings (DATABASE_URL, DEMO_MODE, SECRET_KEY…)
├── models/
│   ├── models.py             32+ SQLAlchemy ORM models (incl. SLAPolicy, SLAViolation)
│   ├── profile_migration.py          Phase 1 — enterprise profiles
│   ├── supporting_items_migration.py Phase 2 Chunk 1 — supporting items
│   ├── comment_threads_migration.py  Phase 2 Chunk 2 — comment threads
│   ├── phase2_workflow_migration.py  Phase 2 Chunk 2 — approval chains
│   ├── close_calendar_migration.py   Phase 2 Chunk 3 — close periods ✨
│   └── sla_monitoring_migration.py   Phase 2 Chunk 4 — SLA policies + violations ✨
├── rbac/
│   ├── roles.py              ADMIN, PREPARER, APPROVER, CERTIFIER, AUDITOR constants
│   └── dependencies.py       role_required() FastAPI dependency
├── routes/
│   ├── auth.py               Login / token
│   ├── projects.py           Project CRUD
│   ├── datasets.py           CSV upload
│   ├── mappings.py           Field mappings
│   ├── rules.py              Matching rules
│   ├── executions.py         Run & poll executions
│   ├── balances.py           Balance workspace endpoints
│   ├── variance.py           Variance analytics (role-scoped)
│   ├── aging.py              Exception aging dashboard
│   ├── export.py             Excel/CSV exports
│   ├── audit.py              Audit logs
│   ├── schedules.py          Close schedule management
│   ├── ops_v1.py             Operations endpoints
│   ├── close_calendar.py     Financial Close Calendar ✨
│   └── sla_router.py         SLA Monitoring & Escalation ✨
├── enterprise/               Enterprise profile module
│   ├── routes.py             Profile endpoints (list, detail, actions)
│   ├── routes_v1.py          v1 API compat
│   ├── service.py            Full enterprise service (1200+ lines)
│   ├── lifecycle_service.py  Certification lifecycle state machine
│   ├── lifecycle_router.py   Balance & profile v1 routes
│   ├── profiles_v1.py        Profile v1 endpoints
│   ├── supporting_items_router.py  Evidence & supporting items
│   ├── comment_router.py     Comment thread endpoints
│   └── schemas.py            Pydantic schemas
├── services/
│   ├── execution_service.py      Execution orchestration
│   ├── matching_engine.py        Core matching algorithm (exact/tolerance/fuzzy/date_diff)
│   ├── balance_service.py        Balance reconciliation workflow
│   ├── variance_service.py       Variance engine (explained/unexplained/flux), role-scoped
│   ├── aging_service.py          Exception aging logic
│   ├── risk_scoring_engine.py    Risk assessment
│   ├── audit_service.py          Hash-chain tamper-evident audit writer
│   ├── notification_service.py   UI notification helper
│   ├── close_calendar_schemas.py Pydantic schemas for close calendar ✨
│   ├── close_calendar_service.py Close Calendar orchestration service ✨
│   ├── sla_monitoring_schemas.py Pydantic schemas for SLA engine ✨
│   ├── sla_monitoring_service.py SLA scan engine (scheduled + manual) ✨
│   ├── escalation_service.py     3-level escalation ladder ✨
│   ├── demo_seed.py              10-project demo matrix + 3 periods + SLA seed
│   └── demo_manager.py           Demo startup controller (purge + re-seed)
├── sequence/                 Close sequence module
├── workflow/                 Workflow actions module
└── scheduler/                Background job scheduler (aging + SLA scan + snapshots)
```

### Frontend — `frontend/src/`

```
src/
├── App.jsx                   All route definitions (role-based redirects)
├── main.jsx                  Entry point
├── index.css                 Global styles + CSS variables (dark/light)
├── api/
│   ├── index.js              Barrel exports for all API modules
│   ├── client.js             Axios instance with JWT interceptor
│   ├── closeCalendarAPI.js   Financial Close Calendar API client ✨
│   └── (other API modules)
├── store/
│   ├── authStore.js          Zustand auth state (user, token, role)
│   └── projectStore.js       Active project state
├── components/
│   ├── Layout.jsx            Role-aware sidebar (4 role variants, collapsible)
│   ├── ProtectedRoute.jsx    Role-based route protection
│   └── ui/                   Shared UI components (PageHeader, PageState, etc.)
└── pages/
    ├── Login.jsx                       Auth
    ├── CommandCenter.jsx               Admin dashboard
    ├── ApproverDashboard.jsx           Approver KPI landing ✨
    ├── PreparerWorkbench.jsx           Preparer UI
    ├── ApproverWorkbench.jsx           Approver approval queue
    ├── ReviewerWorkbench.jsx           (Legacy/alias)
    ├── CloseCertificationPage.jsx      Certifier sign-off / certification queue
    ├── FinancialCloseCalendarPage.jsx  Enterprise close period orchestration ✨
    ├── SLAMonitorDashboard.jsx         SLA violations monitor ✨
    ├── EscalationWorkbench.jsx         Escalation management ✨
    ├── EnterpriseSLAPanel.jsx          SLA panel embedded in Close Calendar ✨
    ├── BalanceReconciliationPage.jsx   Balance workspace
    ├── VarianceAnalyticsDashboard.jsx  Variance analytics
    ├── AgingDashboard.jsx              Exception aging
    ├── RiskDashboard.jsx               Risk scoring heat map
    ├── ExceptionWorkbench.jsx          Escalated items
    ├── ExceptionInvestigation.jsx      Exception drilldown
    ├── ExecutiveDashboard.jsx          Enterprise KPIs
    ├── ReconciliationProfilesPage.jsx  Profile list
    ├── EnterpriseReconciliationCenter.jsx
    ├── ControlsGovernancePage.jsx      Compliance dashboard
    ├── AuditLogs.jsx                   Certification history / audit trail
    ├── AdminCenter.jsx                 User & settings admin
    ├── Schedules.jsx                   Per-profile close calendar
    ├── RuleBuilder.jsx                 Matching rule editor
    ├── MyPerformance.jsx               Preparer performance
    ├── WorkQueue.jsx                   Work queue (reviewer/approver)
    └── (other pages)
```

### SLA Frontend Components
```
components/
├── SLAWarningBanner.jsx    Inline SLA warning for balance/profile pages
├── TeamSLAPanel.jsx        Approver team SLA summary panel
└── EscalatedItemsPanel.jsx Escalated violations panel

---

## 3. Roles & Responsibilities

The system uses a **4-core-role model**.

| Role | Landing Page | Permissions |
|------|-------------|-------------|
| **ADMIN** | `/command-center` | Full system access, user management, audit trail, system config, create close periods |
| **PREPARER** | `/my-reconciliations` | Upload data, map fields, create rules, submit reconciliations, resolve exceptions, view own aging/variance |
| **APPROVER** | `/approver-dashboard` | Review & approve/return/escalate submissions, manage evidence, view team analytics |
| **CERTIFIER** | `/executive-dashboard` | Final sign-off, close period certification, compliance oversight, enterprise analytics |

**RBAC enforcement:**
```python
# backend/app/rbac/dependencies.py
def role_required(allowed_roles: list[str]):
    def _dependency(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(403, "Access denied")
        return current_user
    return _dependency

# Usage:
@router.post("/create-period")
def create_period(..., current_user=Depends(role_required([ADMIN]))):
    ...
```

---

## 4. Sidebar Navigation by Role

All sidebars are collapsible (icon-only collapsed mode) and defined in `frontend/src/components/Layout.jsx`.

### 🔵 Admin
```
HOME (Command Center)
─────────────────────
RECONCILIATION ▾
  Enterprise Center
  Profiles
  Balance Workbench
─────────────────────
ANALYTICS ▾
  Analytics Dashboard
  Risk Dashboard
  Variance Analytics
  Aging Analysis
─────────────────────
CONFIGURATION ▾
  Profiles
  Rules Engine
  Approval Chains [soon]
  Risk Config [soon]
─────────────────────
GOVERNANCE ▾
  Audit Trail
  SLA Monitor         → /sla-monitor ✨
  Escalation Workbench → /escalation-workbench ✨
  Compliance [soon]
  Evidence Retention [soon]
─────────────────────
Administration       → /admin
```

### 🟢 Preparer
```
HOME (My Performance)
─────────────────────
RECONCILIATION ▾
  My Reconciliations
  Workbench
─────────────────────
ANALYTICS ▾
  My Aging Analysis
  My Variance Analysis
```

### 🟡 Approver
```
HOME (Approver Dashboard)
─────────────────────
APPROVAL ▾
  Pending Approvals
  Escalated Items
─────────────────────
EXCEPTION MANAGEMENT
─────────────────────
ANALYTICS ▾
  Team Aging Analysis
  Variance Analysis
```

### 🔴 Certifier
```
HOME (Executive Dashboard)
─────────────────────
CERTIFICATION ▾
  Certification Queue
  High Risk Reviews
  Escalated Items
─────────────────────
ANALYTICS ▾
  Variance Analytics
  Aging Analysis
  Risk Analytics
─────────────────────
CLOSE MANAGEMENT ▾
  Close Calendar          → /financial-close-calendar ✨
  Close Readiness         → [coming soon]
  Close Sign-offs
─────────────────────
GOVERNANCE ▾
  Certification History
  Compliance Dashboard
```

---

## 5. End-to-End Workflows

### 5.1 Certification Lifecycle
```
Preparer creates/edits profile
       ↓
   PREPARED (preparer fills balance data, resolves exceptions)
       ↓ submit
   SUBMITTED
       ↓ approver reviews
   UNDER_REVIEW
       ↓ approver approves (or returns → back to PREPARED)
   APPROVED
       ↓ certifier signs off
   CERTIFIED ✔ (period locked, auditable)
```

### 5.2 Balance State Machine
```
DRAFT → UNDER_REVIEW → APPROVED → CERTIFIED
                                ↑
  Gate: MATERIAL/CRITICAL variance requires narrative before submission
```

### 5.3 Exception Aging
```
0–30 days    → Current     (no alert)
31–60 days   → Aged        ("Attention required")
61–90 days   → Breach      ("Escalation recommended")
90+ days     → Critical    (auto-escalate; blocks close period)
```

### 5.4 Execution → Profile Promotion
```
1. Preparer uploads source + target CSVs
2. Defines field mappings and matching rules
3. Runs execution → match groups + exceptions generated
4. Clicks "Promote to Enterprise Profile"
5. Profile enters lifecycle (OPEN → PREPARED → … → CERTIFIED)
```

---

## 6. Financial Close Calendar

**Phase 2, Chunk 3** — added 2026-06-17.

### Concept
A `ClosePeriod` is a period-level orchestrator (e.g. "June 2026 Month-End Close") that aggregates **all active reconciliation profiles** into one close cycle. One `ClosePeriodTask` row is auto-created per profile when a period is opened.

This is **distinct** from the older per-profile `FinancialCloseCalendar` / `CloseTask` (checklist concept) — the two coexist without conflict.

### Data Model
```
close_periods
├── period_name    "June 2026 Month-End Close"
├── period_key     "2026-06"
├── close_status   OPEN | IN_PROGRESS | READY_FOR_CLOSE | CLOSED
├── total_profiles / completed_profiles / certified_profiles
└── closed_by / closed_at

close_period_tasks  (one per profile per period)
├── close_period_id → close_periods
├── profile_id      → reconciliation_profiles
├── balance_id      → reconciliation_balances (nullable)
├── assigned_owner_id → users
├── task_status     NOT_STARTED | IN_PROGRESS | UNDER_REVIEW | CERTIFIED | OVERDUE
└── completion_percentage

reconciliation_balances
└── close_period_id (nullable FK — added in Phase 2 Chunk 3)
```

### Close Readiness Validator — 6 Checks
1. Balances in `DRAFT` status
2. Balances in `UNDER_REVIEW` status
3. Material/Critical unresolved variances
4. Unresolved `CRITICAL` supporting items
5. Exception queue records older than 90 days
6. Incomplete certification workflows

All 6 must pass (zero blockers) before `PATCH /{id}/close` succeeds. Returns HTTP 409 with full blocker list if any fail.

### API Endpoints
```
GET    /api/v1/close-calendar/periods               Period list + KPI cards
GET    /api/v1/close-calendar/{id}/dashboard        Full period dashboard
GET    /api/v1/close-calendar/{id}/tasks            Task drilldown (filterable)
PATCH  /api/v1/close-calendar/tasks/{id}/status     Update task status/completion %
POST   /api/v1/close-calendar/create-period         Admin: create period + auto-tasks
GET    /api/v1/close-calendar/{id}/validate-close   Preview close readiness
PATCH  /api/v1/close-calendar/{id}/close            Admin: attempt to close period
```

### Frontend Page
`FinancialCloseCalendarPage.jsx` — accessible at `/financial-close-calendar`

Sections:
- **KPI Cards** — Open periods, Near deadline, Overdue tasks, Material variances, Pending certs
- **Period Grid** — All periods with status badge, progress bars, open issue count
- **Dashboard View** — Selected period: burndown chart, certification progress, variance density heatmap, approval bottleneck table
- **Task Drilldown** — Per-profile task table with status update action
- **Close Readiness Panel** — Validate all 6 checks; surface blocker list with links

---

## 7. SLA Monitoring & Escalation Engine

**Phase 2, Chunk 4** — added 2026-06-19.

### Concept
The SLA Engine monitors every balance in a breaching lifecycle state (`DRAFT`, `UNDER_REVIEW`, `APPROVED`) and raises/escalates `SLAViolation` records automatically. It does **not** add any new lifecycle status values — it reads the existing state and enforces time-based SLAs defined in `SLAPolicy`.

### Priority Resolution
SLA policies are keyed on `ReconciliationProfile.risk_classification` (LOW / MEDIUM / HIGH / CRITICAL). Profile-specific policies override global defaults.

### Lifecycle State → Violation Type Mapping
| Balance State | Age Anchor | violation_type |
|---|---|---|
| DRAFT | `created_at` | `SLA_BREACH` |
| UNDER_REVIEW | `submitted_at` | `APPROVAL_BOTTLENECK` |
| APPROVED | `approved_at` | `CERTIFICATION_OVERDUE` |

### Escalation Ladder
```
Level 1 — LEVEL_1_NOTIFIED
  → Owner notified (UINotification + audit log)

Level 2 — LEVEL_2_NOTIFIED  (after reminder_interval_days)
  → Owner gets second notice
  → Admin (manager fallback) gets team-member-overdue notification

Level 3 — LEVEL_3_REASSIGNED  (after another reminder_interval_days)
  → Current owner reassigned to next role in chain
    (Preparer → Approver → Certifier → Admin)
  → System comment posted to reconciliation balance thread
  → New owner notified
```

### Demo SLA Policies (auto-seeded)
| Priority | max_days_open | escalation_role | reminder_interval_days |
|----------|--------------|-----------------|------------------------|
| LOW | 10 | PREPARER | 5 |
| MEDIUM | 7 | PREPARER | 3 |
| HIGH | 4 | APPROVER | 2 |
| CRITICAL | 2 | CERTIFIER | 1 |

### Close Calendar Integration
The `ClosePeriodDashboardResponse` includes an optional `sla` field (`SLACalendarSection`) with:
- `open_sla_violations_count` / `open_sla_violations_by_priority`
- `escalated_accounts_count` (escalation_level == 3)
- `overdue_certifications_count` (CERTIFICATION_OVERDUE violations)
- `bottleneck_approvers` list

Three new blocker categories feed into the Close Readiness Validator:
- `CRITICAL_SLA_VIOLATION`
- `ESCALATED_ACCOUNT_UNRESOLVED`
- `OVERDUE_CERTIFICATION_THRESHOLD_EXCEEDED`

### Scheduler Job
Registered in `scheduler/service.py` using `IntervalTrigger(hours=4)` on the existing APScheduler instance (no second scheduler created).

---

## 8. Demo Projects & Seeding

### Auto-seeding (DEMO_MODE=true)
On startup, `demo_manager.py` calls:
1. `_purge_demo_records()` — FK-safe delete of all `is_demo_data=True` rows
2. `seed_enterprise_demo_matrix()` — 10 projects, profiles, balances, exceptions, workflows
3. `seed_close_periods_demo()` — 3 close periods (CLOSED / IN_PROGRESS / OPEN)
4. `seed_sla_demo()` — 4 global SLA policies + runs one real scan to populate demo violations ✨

### FK-Safe Purge Order (key tables)
```
exception_escalation_logs
exception_aging_snapshots
reconciliation_balance_history
certification_workflow_history
ui_notifications
variance_snapshots
supporting_items
exception_queue_records
close_period_tasks          ← references close_periods + reconciliation_balances
reconciliation_balances     ← has close_period_id FK
close_periods               ← referenced by the two above
certification_workflows
close_tasks
financial_close_calendar
reconciliation_profiles
  (via PROFILE_CHILD_TABLES join)
  └─ sla_violations → sla_policies  (purged via profile_id join)
projects
```

---

## 9. Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- MySQL (or set `DATABASE_URL=sqlite:///./drms.db` for local SQLite)

### Backend `.env`
```env
DATABASE_URL=mysql+pymysql://user:pass@localhost/drms
SECRET_KEY=your-secret-key-min-32-chars
DEMO_MODE=true
```

### Steps
```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Tables are created automatically on first startup via `main.py` lifespan migrations.

---

## 10. API Reference

### Auth
```http
POST /api/auth/login
{"username": "preparer", "password": "preparer123"}
→ {"access_token": "...", "user": {"role": "preparer"}}
```

### Projects
```http
GET  /api/projects
POST /api/projects   {"name": "...", "description": "..."}
```

### Execution Flow
```http
POST /api/projects/{id}/datasets          # Upload CSV (multipart)
POST /api/projects/{id}/mappings          # Define field mappings
POST /api/projects/{id}/rules             # Add matching rules
POST /api/projects/{id}/executions        # Run matching engine
POST /api/projects/{id}/executions/{eid}/promote   # → Enterprise profile
```

### Enterprise Profiles
```http
GET  /api/enterprise/profiles
GET  /api/enterprise/profiles/{id}
POST /api/v1/balances/profiles/{id}/submit
POST /api/v1/balances/profiles/{id}/approve
POST /api/v1/balances/profiles/{id}/certify
```

### Balance & Analytics
```http
GET  /api/v1/balances/profiles/{id}/balances
GET  /api/v1/analytics/variance/{id}
GET  /api/v1/exceptions/aging
GET  /api/enterprise/dashboard/risk-real
```

### Financial Close Calendar
```http
GET    /api/v1/close-calendar/periods
GET    /api/v1/close-calendar/{id}/dashboard
GET    /api/v1/close-calendar/{id}/tasks?my_tasks_only=false
PATCH  /api/v1/close-calendar/tasks/{id}/status
POST   /api/v1/close-calendar/create-period
GET    /api/v1/close-calendar/{id}/validate-close
PATCH  /api/v1/close-calendar/{id}/close
```

### SLA Monitoring & Escalation ✨
```http
GET    /api/v1/sla/violations               # My violations (current_owner or assigned)
GET    /api/v1/sla/violations/team          # Approver: team-wide violations
GET    /api/v1/sla/violations/enterprise    # Certifier: enterprise read-only
GET    /api/v1/sla/violations/all?status=OPEN&escalation_level=3  # Admin
POST   /api/v1/sla/violations/{id}/acknowledge
POST   /api/v1/sla/violations/{id}/override   # Admin only
POST   /api/v1/sla/violations/{id}/resolve    # Admin only
GET    /api/v1/sla/policies
POST   /api/v1/sla/policies                   # Admin only
PUT    /api/v1/sla/policies/{id}              # Admin only
POST   /api/v1/sla/scan                       # Admin manual trigger
```

Full interactive docs: `http://localhost:8000/api/docs`

---

## 11. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Table 'close_periods' doesn't exist` | Restart backend — migration runs on startup |
| `Table 'sla_policies' doesn't exist` | Restart backend — `sla_monitoring_migration.migrate()` runs on startup |
| `ClosePeriod not found in models.models` | Ensure `models.py` has `ClosePeriod` class (check line ~1080) |
| `SLAPolicy not found in models.models` | Ensure `models.py` has `SLAPolicy`/`SLAViolation` at the end |
| `FOREIGN_KEY constraint failed` on purge | Check PURGE_ORDER in `demo_manager.py` — `close_period_tasks` before `reconciliation_balances`, `sla_violations` before `sla_policies` in PROFILE_CHILD_TABLES |
| `403 Access denied` on close period endpoints | Only `ADMIN` role can create/close periods |
| `403 Access denied` on SLA override/resolve | Only `ADMIN` role; acknowledge is any current owner |
| Frontend `/financial-close-calendar` shows 404 | Check App.jsx has `<Route path="financial-close-calendar" ...>` |
| Frontend `/sla-monitor` shows 404 | Check App.jsx has `<Route path="sla-monitor" ...>` |
| Variance analytics empty for preparer | Backend scopes data to `preparer_id` — ensure demo profiles have `assigned_preparer` set |
| `Module not found: closeCalendarAPI` | Check `frontend/src/api/closeCalendarAPI.js` exists and is exported from `index.js` |
| `Module not found: slaAPI` | Check `frontend/src/api/slaAPI.js` exists and is exported from `index.js` |
| SLA scan finds no violations | No SLA policies configured — run `seed_sla_demo()` or POST `/api/v1/sla/policies` to add global defaults |
| escalation_service comment fails silently | Expected — `_post_system_comment()` wraps `comment_service.create_comment()` in try/except. Verify the actual signature in your `comment_service.py` |
