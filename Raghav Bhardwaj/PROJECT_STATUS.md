# Project Status

Last updated: 2026-06-16

---

## What This Project Is

**DRMS** (Data Reconciliation Management System) is a full-stack enterprise reconciliation platform.

- **Backend:** FastAPI + SQLAlchemy (Python 3.11), MySQL in production, SQLite for local dev
- **Frontend:** React 18 + Vite 5 + TanStack Query + Tailwind CSS
- **Roles:** `admin`, `preparer`, `approver`, `certifier` (4 core roles; reviewer and auditor roles merged into approver)
- **Auth:** JWT with RBAC middleware

---

## ✅ Fully Implemented

### Core Platform
- [x] Project creation, datasets (CSV upload), field mappings, matching rules
- [x] Execution engine — matching algorithm (exact / tolerance / fuzzy / date_diff)
- [x] Execution promotion to Enterprise Profile
- [x] RBAC authentication with per-role landing pages and route protection

### Enterprise Profile & Certification Lifecycle
- [x] Enterprise profiles with full lifecycle: `OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED`
- [x] Certification workflows with history tracking
- [x] Multi-role assignment: preparer / approver / certifier per profile (approver now handles review + approval)
- [x] Supporting items (attachments and evidence) management
- [x] Comment threads on reconciliation profiles

### Balance Reconciliation
- [x] Balance workspace (source vs target with variance display)
- [x] Variance engine: raw / explained / unexplained variance + flux tracking
- [x] Narrative gating — blocks submission on `MATERIAL_VARIANCE` / `CRITICAL_VARIANCE` without explanation
- [x] Variance analytics dashboard with period-over-period flux
- [x] Balance history and prior-period snapshots

### Exception Management
- [x] Exception queue with aging buckets (0–30d / 31–60d / 61–90d / 90d+)
- [x] Exception investigation with escalation workflow
- [x] Aging dashboard with risk heatmap

### Analytics & Reporting
- [x] Risk dashboard with risk-scored profiles
- [x] Reconciliation analytics explorer
- [x] Executive dashboard (KPIs, SLA status, volume trends)
- [x] Audit log with full event trail
- [x] Export service (Excel / CSV export)

### Admin & Operations
- [x] Admin Center (user management, system settings)
- [x] Command Center (ops overview for admin)
- [x] Scheduler monitoring
- [x] Close calendar / schedule management
- [x] Rule builder UI
- [x] Sequence management (numbered close sequences)

### Demo & Seeding
- [x] `demo_seed.py` — 10-project Enterprise Demo Matrix (seeds on startup in DEMO_MODE)
- [x] `seed_demo_projects.py` — **5 full-flow demo projects** seeded via REST API
  - Bank Reconciliation — US Corporate
  - Accounts Receivable — EMEA Region
  - Accounts Payable — Global Vendor Payments
  - Intercompany Reconciliation — APAC Entities
  - Payroll Reconciliation — North America
- [x] Demo user auto-seeding on startup (all 6 roles)

---

## ⚠️ Known Gaps / Open Items

| Area | Gap | Priority |
|------|-----|----------|
| Tests | No automated test suite for variance service or submission gate | Medium |
| Tests | No integration tests for execution → promote → certify flow | Medium |
| QA | Variance analytics route needs end-to-end browser walkthrough | Medium |
| Migration | Alembic migration file exists but may need re-run in fresh environments | Low |
| Docs | Screenshots placeholders in PROJECT_GUIDE.md not yet captured | Low |

---

## 🔑 Demo Mode

Set `DEMO_MODE=true` in `backend/.env` to enable auto-seeding on every restart.
Set `DEMO_MODE=false` (default) for production — auto-purges any lingering demo records.

---

## 📂 Where to Look First

| Goal | File |
|------|------|
| App startup & demo seeding | `backend/app/main.py` |
| Balance workflow | `backend/app/services/balance_service.py` |
| Variance engine | `backend/app/services/variance_service.py` |
| Matching engine | `backend/app/services/matching_engine.py` |
| Enterprise profiles (full service) | `backend/app/enterprise/service.py` |
| Certification lifecycle | `backend/app/enterprise/lifecycle_service.py` |
| Frontend routing | `frontend/src/App.jsx` |
| Sidebar navigation | `frontend/src/components/Layout.jsx` |
| Preparer UI | `frontend/src/pages/PreparerWorkbench.jsx` |
| Approver UI (review + approval) | `frontend/src/pages/ApproverWorkbench.jsx` |
| Balance workspace | `frontend/src/pages/BalanceReconciliationPage.jsx` |
| Variance dashboard | `frontend/src/pages/VarianceAnalyticsDashboard.jsx` |
| **5-project demo seeder** | `backend/scripts/seed_demo_projects.py` |
