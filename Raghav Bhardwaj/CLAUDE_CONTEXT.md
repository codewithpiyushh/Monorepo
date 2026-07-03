# DRMS — Comprehensive Project Context for Claude

**Last Updated:** 2026-07-03  
**Project:** Data Reconciliation Management System (DRMS)  
**Status:** Phase 3 Complete — Oracle ARCS Transaction Matching, Row-Level Security, & Advanced Dashboards

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Current Implementation Status](#3-current-implementation-status)
4. [Role Model & Access Control](#4-role-model--access-control)
5. [Data Model Overview](#5-data-model-overview)
6. [Core Workflows & State Machines](#6-core-workflows--state-machines)
7. [API Reference](#7-api-reference)
8. [Frontend Structure & Components](#8-frontend-structure--components)
9. [Tech Stack Details](#9-tech-stack-details)
10. [Comparison to Oracle ARCS & BlackLine](#10-comparison-to-oracle-arcs--blackline)
11. [Known Limitations & Roadmap](#11-known-limitations--roadmap)
12. [How to Update This Document](#12-how-to-update-this-document)

---

## 1. Executive Summary

### What Is DRMS?

DRMS is an **enterprise financial reconciliation platform** that enables finance teams to:

- **Upload** source and target datasets (CSV)
- **Define** matching rules (exact, tolerance, fuzzy, date-based, multi-field)
- **Execute** matching algorithms to produce match groups and exceptions
- **Investigate** exceptions with evidence attachments and comments
- **Reconcile** balances with variance tracking (explained / unexplained / flux)
- **Certify** reconciliations through a multi-role workflow (Preparer → Approver → Certifier)
- **Audit** all changes with tamper-evident logs

### Key Differentiators

| Feature | DRMS | Oracle ARCS | BlackLine |
|---------|------|------------|-----------|
| **Open-source friendly** | ✅ Custom Python/React | ❌ Proprietary | ❌ Proprietary |
| **On-premises deployable** | ✅ Yes (Docker) | ✅ Yes | ❌ SaaS only |
| **Role-based workflows** | ✅ 4 core roles + collapsible role sidebars | ✅ 8+ roles | ✅ 10+ roles |
| **Variance tracking** | ✅ Explained/unexplained/flux | ✅ Yes | ✅ Yes |
| **Exception aging** | ✅ 30/60/90+ day buckets | ✅ Yes | ✅ Yes |
| **Customizable matching** | ✅ Rule builder + code extensible | ⚠️ Limited | ⚠️ Limited |
| **Multi-currency FX** | ✅ Partial (USD equiv exists) | ✅ Full | ✅ Full |
| **API-first design** | ✅ REST + Swagger | ⚠️ Limited API | ⚠️ Limited API |

---

## 2. System Architecture

### 2.1 High-Level View

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 18)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Login → Role-Based Dashboard (4 role types)            │   │
│  │  • Preparer  → /my-reconciliations                   │   │
│  │  • Approver  → /approver-dashboard (new)             │   │
│  │  • Certifier → /executive-dashboard                  │   │
│  │  • Admin     → /command-center                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↑ ↓ (REST/JSON)
┌─────────────────────────────────────────────────────────────┐
│              Backend (FastAPI + SQLAlchemy)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Route Layer:                                         │   │
│  │ • /api/auth (JWT + RBAC)                             │   │
│  │ • /api/projects (CRUD)                               │   │
│  │ • /api/datasets (upload)                             │   │
│  │ • /api/executions (run + promote)                    │   │
│  │ • /api/enterprise/profiles (lifecycle)               │   │
│  │ • /api/balances (reconciliation)                     │   │
│  │ • /api/analytics/* (dashboards)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Service Layer:                                       │   │
│  │ • execution_service (matching)                       │   │
│  │ • balance_service (reconciliation logic)             │   │
│  │ • variance_service (variance calculations)           │   │
│  │ • risk_scoring_engine (risk assessment)              │   │
│  │ • lifecycle_service (state machine)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Data Layer:                                          │   │
│  │ • SQLAlchemy ORM models                              │   │
│  │ • 30+ tables (projects, workflows, balances, etc)    │   │
│  │ • Migration: raw SQL IF NOT EXISTS + info_schema     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↑ ↓ (SQL)
┌─────────────────────────────────────────────────────────────┐
│         Database (MySQL production / SQLite local)           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
backend/app/
├── main.py                          # FastAPI app, lifespan, startup
├── database.py                      # Engine, session factory
├── schema_compat.py                 # DB schema compatibility patches
├── config/
│   └── settings.py                  # Environment config
├── core/
│   ├── config.py                    # Core settings (deprecated? check)
│   └── dependencies.py              # Auth dependency injection
├── models/
│   ├── models.py                    # 32+ ORM models (User, Project, ClosePeriod, SLAPolicy, SLAViolation, etc)
│   ├── profile_migration.py         # Phase 1: Enterprise profiles
│   ├── supporting_items_migration.py # Phase 2 Chunk 1: Supporting items
│   ├── comment_threads_migration.py  # Phase 2 Chunk 2: Comment threads
│   ├── phase2_workflow_migration.py  # Phase 2 Chunk 2: Approval chains
│   ├── close_calendar_migration.py  # Phase 2 Chunk 3: Close periods ✨
│   └── sla_monitoring_migration.py  # Phase 2 Chunk 4: SLA policies + violations ✨
├── rbac/
│   ├── roles.py                     # ADMIN, PREPARER, APPROVER, CERTIFIER
│   └── dependencies.py              # role_required() decorator
├── routes/
│   ├── auth.py                      # Login, token
│   ├── projects.py                  # Project CRUD
│   ├── datasets.py                  # CSV upload, dataset management
│   ├── mappings.py                  # Field mapping rules
│   ├── rules.py                     # Matching rule builder
│   ├── executions.py                # Run execution, promote
│   ├── balances.py                  # Balance reconciliation
│   ├── variance.py                  # Variance analytics (role-scoped)
│   ├── aging.py                     # Exception aging dashboard
│   ├── export.py                    # Excel/CSV export
│   ├── audit.py                     # Audit trail
│   ├── schedules.py                 # Per-profile close schedule
│   ├── ops_v1.py                    # Operations endpoints
│   ├── close_calendar.py            # Financial Close Calendar ✨
│   └── sla_router.py                # SLA Monitoring & Escalation ✨
├── enterprise/
│   ├── routes.py                    # Enterprise profile endpoints (1000+ lines)
│   ├── routes_v1.py                 # v1 API (backward compat)
│   ├── service.py                   # Enterprise service layer (1200+ lines)
│   ├── lifecycle_service.py         # State machine (Preparer→Approver→Certifier)
│   ├── lifecycle_router.py          # Workflow action endpoints
│   ├── repository.py                # Data access layer
│   ├── profiles_v1.py               # v1 profile endpoints
│   ├── supporting_items_router.py   # Attachments/evidence endpoints
│   ├── comment_router.py            # Comment thread endpoints
│   └── schemas.py                   # Pydantic models
├── services/
│   ├── execution_service.py         # Execution orchestration
│   ├── matching_engine.py           # Core matching algorithm (exact/tolerance/fuzzy)
│   ├── balance_service.py           # Balance reconciliation workflow
│   ├── variance_service.py          # Variance calculations (role-scoped)
│   ├── aging_service.py             # Exception aging logic
│   ├── risk_scoring_engine.py       # Risk assessment
│   ├── audit_service.py             # Hash-chain audit writer
│   ├── notification_service.py      # UI notification helper
│   ├── close_calendar_schemas.py    # Pydantic schemas for close calendar ✨
│   ├── close_calendar_service.py    # Close Calendar orchestration ✨
│   ├── sla_monitoring_schemas.py    # Pydantic schemas for SLA engine ✨
│   ├── sla_monitoring_service.py    # SLA scan engine (scheduled + manual) ✨
│   ├── escalation_service.py        # 3-level escalation ladder ✨
│   ├── demo_seed.py                 # 10-project demo matrix + 3 close periods + SLA seed
│   └── demo_manager.py              # Demo startup controller (purge+seed)
├── sequence/
│   ├── routes.py                    # Close sequence endpoints
│   ├── service.py                   # Sequence logic
│   └── schemas.py
├── workflow/
│   ├── routes.py                    # Workflow action endpoints
│   ├── service.py                   # Workflow state machine
│   └── schemas.py
├── scheduler/
│   ├── service.py                   # Background job scheduler
│   └── jobs.py                      # Job implementations
└── migrations/
    ├── add_reconciliation_balances.py
    └── 2026_05_07_oracle_style_workflow_indexes.sql

frontend/src/
├── App.jsx                          # Main router (role-based DefaultPageRedirect)
├── main.jsx                         # Entry point
├── index.css                        # Global styles + CSS variables (dark/light)
├── api/
│   ├── index.js                     # Barrel exports for all API modules
│   ├── client.js                    # Axios instance with JWT interceptor
│   └── closeCalendarAPI.js          # Financial Close Calendar API client ✨
├── store/
│   ├── authStore.js                 # Zustand auth state
│   └── projectStore.js              # Active project state
├── components/
│   ├── Layout.jsx                   # Role-aware sidebar (4 variants, collapsible)
│   ├── ProtectedRoute.jsx           # Role-based route protection
│   └── ui/                          # Shared UI: PageHeader, PageState, etc.
└── pages/
    ├── Login.jsx                    # Auth
    ├── CommandCenter.jsx            # Admin dashboard
    ├── ApproverDashboard.jsx        # Approver KPI landing page ✨
    ├── PreparerWorkbench.jsx        # Preparer UI (upload, map, execute, resolve)
    ├── ApproverWorkbench.jsx        # Approver UI (review + approval queue)
    ├── CloseCertificationPage.jsx   # Certifier certification queue / sign-off
    ├── FinancialCloseCalendarPage.jsx # Enterprise close period orchestration ✨
    ├── BalanceReconciliationPage.jsx # Balance workspace
    ├── VarianceAnalyticsDashboard.jsx # Variance charts (role-scoped)
    ├── AgingDashboard.jsx           # Exception aging (role-scoped)
    ├── RiskDashboard.jsx            # Risk heat map
    ├── ExceptionWorkbench.jsx       # Escalated items
    ├── ExceptionInvestigation.jsx   # Exception drilldown
    ├── ExecutiveDashboard.jsx       # Enterprise KPI overview (certifier home)
    ├── ReconciliationProfilesPage.jsx # Profile list
    ├── EnterpriseReconciliationCenter.jsx
    ├── ControlsGovernancePage.jsx   # Compliance dashboard
    ├── AdminCenter.jsx              # User & settings admin
    ├── AuditLogs.jsx                # Certification history / audit trail
    ├── Schedules.jsx                # Per-profile close calendar
    ├── RuleBuilder.jsx              # Matching rule editor
    ├── MyPerformance.jsx            # Preparer performance dashboard
    └── WorkQueue.jsx                # Work queue
```

---

## 3. Current Implementation Status

### 3.1 ✅ Fully Implemented (MVP Complete)

#### Core Platform
- [x] **User Authentication** — JWT-based login, token refresh, role assignment
- [x] **Project Management** — Create, read, update, delete projects
- [x] **Dataset Upload** — CSV upload for source and target datasets
- [x] **Field Mappings** — Define source-to-target column mappings
- [x] **Matching Rules** — Rule builder for exact, tolerance, fuzzy, date-based matching
- [x] **Execution Engine** — Run reconciliation, generate match groups, identify exceptions
- [x] **Execution Promotion** — Convert execution to enterprise profile (persistent)

#### Enterprise Profiles & Certification
- [x] **Profile Lifecycle** — `OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED`
- [x] **Multi-Role Assignment** — Preparer / Approver / Certifier per profile
- [x] **Certification Workflows** — Track workflow history, multi-step approval
- [x] **Workflow Actions** — Approve, return (send back 1 level), escalate, reject
- [x] **Segregation of Duties** — SoD checks prevent preparer = approver = certifier
- [x] **Supporting Items** — Attachments and evidence management
- [x] **Comment Threads** — Comments on profiles with threading

#### Balance Reconciliation
- [x] **Balance Workspace** — Source balance vs target balance display
- [x] **Variance Calculation** — Raw variance, severity classification (BALANCED / WITHIN_THRESHOLD / MATERIAL / CRITICAL)
- [x] **Variance Narrative** — Required explanation for MATERIAL/CRITICAL variance (submission gate)
- [x] **Balance History** — Track prior periods and snapshots
- [x] **Variance Analytics** — Period-over-period variance, flux tracking

#### Exception Management
- [x] **Exception Queue** — List of unmatched / disputed items
- [x] **Aging Buckets** — 0–30d / 31–60d / 61–90d / 90d+ classification
- [x] **Investigation Workflow** — Add comments, escalate, resolve exceptions
- [x] **Aging Dashboard** — View exceptions by age, risk heatmap

#### Analytics & Reporting
- [x] **Risk Dashboard** — Risk-scored profiles, heat map by entity/period
- [x] **Reconciliation Analytics** — Drilldown by entity/period/role
- [x] **Executive Dashboard** — KPIs, SLA status, volume trends
- [x] **Audit Log** — Full event trail (login, action, change history)
- [x] **Export Service** — Excel/CSV export of profiles, balances, exceptions

#### Admin & Operations
- [x] **Admin Center** — User management, role assignment, system settings
- [x] **Command Center** — Operations overview for admins
- [x] **Platform Admin Page** — Advanced admin controls
- [x] **Scheduler Monitoring** — Background job status
- [x] **Close Calendar** — Per-profile close schedule management (`/close-calendar`)
- [x] **Rule Builder UI** — Form-based rule creation
- [x] **Sequence Management** — Numbered close sequences
- [x] **Controls & Governance** — SOX/compliance dashboard

#### Financial Close Calendar ✨ (Phase 2, Chunk 3)
- [x] `ClosePeriod` + `ClosePeriodTask` models + `close_period_id` FK on ReconciliationBalance
- [x] Raw MySQL migration (`close_calendar_migration.py`)
- [x] 7 REST endpoints at `/api/v1/close-calendar`
- [x] Close Readiness Validator (6 checks: draft balances, under_review balances, material variances, critical supporting items, 90+ day aging, incomplete workflows)
- [x] `FinancialCloseCalendarPage.jsx` (KPI cards, burndown, variance heatmap, task drilldown, Close Readiness panel)
- [x] Demo seeding: 3 demo periods (CLOSED / IN_PROGRESS / OPEN)

#### SLA Monitoring & Escalation Engine ✨ (Phase 2, Chunk 4)
- [x] `SLAPolicy` model — global defaults + per-profile overrides keyed on `risk_classification`
- [x] `SLAViolation` model — live violation record with 3-level escalation ladder
- [x] `sla_monitoring_migration.py` — `Table.create(checkfirst=True)` + guarded `ALTER TABLE` for `overdue_certification_threshold`
- [x] `sla_monitoring_service.py` — scheduled scan engine with Pass 1 (auto-resolve) + Pass 2 (detect/update)
- [x] `escalation_service.py` — 3-level escalation ladder: L1 notify owner → L2 notify admin → L3 reassign
- [x] `sla_router.py` — 9 endpoints at `/api/v1/sla` (violations, policies, scan, override, resolve, acknowledge)
- [x] APScheduler job: `sla_monitoring_scan` (every 4 hours) — registered on existing scheduler instance
- [x] Close Calendar `sla` section integrated into `ClosePeriodDashboardResponse`
- [x] 3 new Close Readiness blocker categories (CRITICAL_SLA_VIOLATION, ESCALATED_ACCOUNT_UNRESOLVED, OVERDUE_CERTIFICATION_THRESHOLD_EXCEEDED)
- [x] Frontend: 7 files (SLAMonitorDashboard, EscalationWorkbench, EnterpriseSLAPanel, SLAWarningBanner, TeamSLAPanel, EscalatedItemsPanel, slaAPI.js)
- [x] Routes: `/sla-monitor`, `/escalation-workbench` in App.jsx
- [x] Admin sidebar: SLA Monitor + Escalation Workbench under Governance
- [x] Demo seed: `seed_sla_demo()` — 4 default policies + real scan on startup

#### Role-Based Sidebar Navigation ✨
- [x] Collapsible grouped sidebars for all 4 roles (Admin, Preparer, Approver, Certifier)
- [x] Collapsed icon-only mode for all role sidebars
- [x] `ApproverDashboard.jsx` — KPI landing page for approver role
- [x] Certifier sidebar: Certification, Analytics, Close Management, Governance groups

#### Demo & Seeding
- [x] **Demo Mode** — Auto-seed 10 enterprise profiles + 3 close periods + 4 SLA policies on startup (`DEMO_MODE=true`)
- [x] FK-safe purge order updated: `close_period_tasks → reconciliation_balances → close_periods`; `sla_violations → sla_policies` (via PROFILE_CHILD_TABLES)
- [x] **Demo Users** — 4 core roles auto-created on startup (admin/preparer/approver/certifier)

### 3.2 ⚠️ In Progress / Partial Implementation

| Area | Status | Notes |
|------|--------|-------|
| **Multi-Currency Support** | 60% | USD equivalent exists; full FX conversion needed |
| **Delegated Approvals** | 70% | Column exists; delegation logic needs polish |
| **SLA Escalation Engine** | 100% | 3-level ladder with direct manager lookup |
| **Real-time Notifications** | 100% | Native SSE WebSockets implemented |
| **Automated Test Suite** | 100% | Pytest coverage on Variance, Flux, Matching |

### 3.3 ❌ Not Yet Implemented (Deferred)

| Feature | Priority | Rationale |
|---------|----------|-----------|
| **Integration Tests** | Low | Defer to CI/CD pipeline |
| **Performance Tests** | Low | Defer to UAT |
| **Multi-language UI** | Low | English only; i18n framework not in place |
| **Custom Formula Engine** | Low | For advanced variance calculations |
| **Data Masking** | Low | PII redaction for audit logs |
| **Two-Factor Auth** | Medium | MFA support for admin users |
| **SAML/OAuth2** | Low | Enterprise SSO integration |
| **Report Scheduling** | 40% | Defined but needs cron integration |
| **Advanced Reconciliation Rules** | Low | AI-powered anomaly detection |

---

## 4. Role Model & Access Control

### 4.1 Core Roles (4-Role Model)

The system uses a **4-core-role model** after consolidation from a 6-role model (removed `REVIEWER` and `AUDITOR`).

| Role | Permissions | Landing Page | Key Workflows |
|------|-------------|--------------|----------------|
| **ADMIN** | Full system access, user mgmt, audit trail, system config, create close periods | `/command-center` | Create users, view all profiles, access audit logs, manage settings, open/close close periods |
| **PREPARER** | Upload data, map fields, create rules, submit reconciliations, resolve exceptions | `/my-reconciliations` | Create project, upload CSV, define mappings, run execution, investigate exceptions, submit for review |
| **APPROVER** | Review preparer submissions, approve/return/escalate, manage evidence, view team analytics | `/approver-dashboard` | Review evidence, approve or return submissions, escalate when needed, team-level aging + variance |
| **CERTIFIER** | Final sign-off, issue certification, close period, compliance oversight | `/executive-dashboard` | Review approved items, issue final certification, manage close periods, governance |

### 4.2 RBAC Implementation

**File:** `backend/app/rbac/roles.py`

```python
ADMIN     = "admin"
PREPARER  = "preparer"
APPROVER  = "approver"
CERTIFIER = "certifier"

ALL_ROLES = {ADMIN, PREPARER, APPROVER, CERTIFIER}

ROLE_RANK: dict[str, int] = {
    PREPARER:  1,
    APPROVER:  2,   # Merged reviewer + approver
    CERTIFIER: 3,
    ADMIN:     99,
}

WRITE_ROLES = {ADMIN, PREPARER, APPROVER, CERTIFIER}
READ_ONLY_ROLES = set()  # No read-only roles (auditor removed)
```

**File:** `backend/app/rbac/dependencies.py`

```python
def role_required(allowed_roles: list[str]):
    """FastAPI dependency that enforces role-based access."""
    allowed = {_effective_role(r) for r in allowed_roles}
    
    def _dependency(current_user=Depends(get_current_user)):
        role = _effective_role(getattr(current_user, "role", "") or "")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Access denied.")
        return current_user
    
    return _dependency
```

### 4.3 Route Protection

Routes are protected using the `@role_required([...])` decorator:

```python
@router.post("/profiles")
def create_profile(
    payload: ProfileCreate,
    db: Session = Depends(get_db),
    current_user = Depends(role_required([ADMIN, PREPARER]))
):
    # Only ADMIN and PREPARER can create profiles
    return service.create_profile(db, payload, current_user.id)
```

### 4.4 Recent Role Refactor (DRMS Role Consolidation)

**Problem:** The system had 6 roles (ADMIN, PREPARER, REVIEWER, APPROVER, CERTIFIER, AUDITOR), which:
- Created role confusion (REVIEWER vs APPROVER distinction unclear)
- Violated SOX Segregation of Duties when the same person held both roles
- Duplicated permissions across similar roles

**Solution:** Consolidated to **4 core roles**:
1. **Removed REVIEWER** → merged into APPROVER (one role now handles both review and approval)
2. **Removed AUDITOR** → audit access restricted to ADMIN only (read-only audit logs)
3. **Kept ADMIN, PREPARER, APPROVER, CERTIFIER**

**Impact:**
- All stale `REVIEWER` imports/references removed from route files
- Workflow service updated to use `"approver"` for review AND approval stages
- SoD checks updated to ensure: `preparer ≠ approver ≠ certifier`

---

## 5. Data Model Overview

### 5.1 Core Tables

#### User
- `id` (PK)
- `username` (unique)
- `email` (unique)
- `password_hash`
- `role` (admin | preparer | approver | certifier)
- `is_active` (boolean)
- `created_at`, `updated_at`

#### Project
- `id` (PK)
- `name`, `description`
- `created_by` (FK → User)
- `status` (ACTIVE | ARCHIVED)
- `source_column_count`, `target_column_count`
- `created_at`, `updated_at`

#### Dataset
- `id` (PK)
- `project_id` (FK)
- `dataset_type` (SOURCE | TARGET)
- `file_path`, `row_count`, `column_count`
- `uploaded_by` (FK → User)
- `uploaded_at`

#### FieldMapping
- `id` (PK)
- `project_id` (FK)
- `source_column`, `target_column`
- `is_key_field` (boolean)
- `mapping_order`

#### MatchingRule
- `id` (PK)
- `project_id` (FK)
- `rule_type` (EXACT | TOLERANCE | FUZZY | DATE_DIFF | CUSTOM)
- `fields` (JSON) — which columns to match
- `config` (JSON) — rule parameters (tolerance %, fuzzy threshold, date window)
- `enabled` (boolean)

#### Execution
- `id` (PK)
- `project_id` (FK)
- `status` (PENDING | RUNNING | COMPLETED | FAILED)
- `triggered_by` (FK → User)
- `match_count`, `exception_count`
- `result_summary` (JSON)
- `started_at`, `completed_at`

#### MatchGroup (Result of Execution)
- `id` (PK)
- `execution_id` (FK)
- `source_id`, `target_id` (refs to source/target record IDs)
- `match_score` (0–100)
- `match_type` (EXACT | TOLERANCE | FUZZY)
- `created_at`

#### ReconciliationProfile (Enterprise Profile)
- `id` (PK)
- `project_id` (FK)
- `execution_id` (FK) — from which execution was this promoted?
- `name`, `description`
- `assigned_preparer` (FK → User)
- `assigned_approver` (FK → User)
- `assigned_certifier` (FK → User)
- `source_balance`, `target_balance`, `variance_amount`
- `variance_severity` (BALANCED | WITHIN_THRESHOLD | MATERIAL | CRITICAL)
- `status` (OPEN | PREPARED | SUBMITTED | UNDER_REVIEW | APPROVED | CERTIFIED)
- `created_at`, `updated_at`, `certified_at`

#### Workflow (Certification Workflow)
- `id` (PK)
- `profile_id` (FK → ReconciliationProfile)
- `current_status` (OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED)
- `preparer_id`, `reviewer_id`, `approver_id`, `certifier_id` (FKs)
- `approval_chain` (JSON) — ordered list of required approvers
- `created_at`, `updated_at`, `completed_at`

#### WorkflowHistory
- `id` (PK)
- `workflow_id` (FK)
- `action` (PREPARE | SUBMIT | REVIEW | APPROVE | RETURN | ESCALATE | REJECT | CERTIFY)
- `actor_id` (FK → User)
- `comment` (text)
- `timestamp`

#### ReconciliationBalance
- `id` (PK)
- `profile_id` (FK → ReconciliationProfile)
- `period_key` (e.g. "2026-06")
- `source_balance`, `target_balance`
- `variance_amount`, `variance_percent`, `variance_severity_classification`
- `variance_explanation` (required if MATERIAL/CRITICAL)
- `explained_variance`, `unexplained_variance`, `flux_amount`, `flux_percentage`
- `preparer_id`, `reviewer_id`, `approver_id`, `certifier_id`
- `close_period_id` (FK → ClosePeriod, nullable) ✨ Phase 2 Chunk 3
- `status` (DRAFT | BALANCED | WITHIN_THRESHOLD | OUT_OF_BALANCE | UNDER_REVIEW | APPROVED | CERTIFIED | REJECTED)

#### ClosePeriod ✨ (Phase 2 Chunk 3)
- `id` (PK)
- `period_name` ("June 2026 Month-End Close")
- `period_key` ("2026-06", unique)
- `start_date`, `due_date`
- `close_status` (OPEN | IN_PROGRESS | READY_FOR_CLOSE | CLOSED)
- `total_profiles`, `completed_profiles`, `certified_profiles` (denormalized counters)
- `closed_by` (FK → User, nullable), `closed_at`
- `is_demo_data`, `created_by`, `created_at`, `updated_at`

#### ClosePeriodTask ✨ (Phase 2 Chunk 3)
- `id` (PK)
- `close_period_id` (FK → ClosePeriod)
- `profile_id` (FK → ReconciliationProfile)
- `balance_id` (FK → ReconciliationBalance, nullable)
- `assigned_owner_id` (FK → User, nullable)
- `target_due_date`
- `task_status` (NOT_STARTED | IN_PROGRESS | UNDER_REVIEW | CERTIFIED | OVERDUE)
- `completion_percentage` (0–100)
- `is_demo_data`, `created_at`, `updated_at`
- Composite index: `(close_period_id, task_status)`

#### SLAPolicy ✨ (Phase 2 Chunk 4)
- `id` (PK)
- `profile_id` (FK → ReconciliationProfile, nullable) — NULL = global default; set = profile-specific override
- `priority_level` (LOW | MEDIUM | HIGH | CRITICAL) — mapped from `ReconciliationProfile.risk_classification`
- `max_days_open` — days before violation is raised
- `escalation_role` (PREPARER | APPROVER | CERTIFIER | ADMIN)
- `reminder_interval_days` — days between escalation levels
- `created_at`, `updated_at`
- Composite index: `(profile_id, priority_level)`

#### SLAViolation ✨ (Phase 2 Chunk 4)
- `id` (PK)
- `balance_id` (FK → ReconciliationBalance)
- `profile_id` (FK → ReconciliationProfile)
- `policy_id` (FK → SLAPolicy, nullable)
- `violation_type` (SLA_BREACH | CERTIFICATION_OVERDUE | APPROVAL_BOTTLENECK)
- `assigned_user_id` (FK → User) — owner at creation time
- `current_owner_id` (FK → User) — mutated by escalation
- `days_overdue`
- `escalation_level` (1 | 2 | 3)
- `escalation_status` (NONE | LEVEL_1_NOTIFIED | LEVEL_2_NOTIFIED | LEVEL_3_REASSIGNED | RESOLVED)
- `status` (OPEN | ACKNOWLEDGED | RESOLVED)
- `created_at`, `resolved_at`, `last_escalated_at`
- Indexes: `(balance_id, status)`, `(current_owner_id, status)`, `(profile_id, status)`, `(escalation_status, status)`

#### Exception

- `id` (PK)
- `profile_id` (FK)
- `match_group_id` (FK) — optional ref to unmatched pair
- `source_item`, `target_item` (JSON or IDs)
- `exception_type` (UNMATCHED_SOURCE | UNMATCHED_TARGET | DISPUTED)
- `age_days` (calculated at query time)
- `status` (OPEN | INVESTIGATING | RESOLVED | ESCALATED)
- `created_at`, `updated_at`, `resolved_at`

#### SupportingItem (Evidence / Attachments)
- `id` (PK)
- `profile_id` (FK)
- `file_name`, `file_path`, `file_size`
- `uploaded_by` (FK → User)
- `uploaded_at`
- `attached_exception_id` (FK → Exception, optional)

#### Comment (Comment Thread)
- `id` (PK)
- `profile_id` (FK)
- `exception_id` (FK, optional)
- `author_id` (FK → User)
- `body` (text)
- `thread_id` (nullable, for threading)
- `created_at`, `updated_at`

#### AuditLog
- `id` (PK)
- `action` (LOGIN | CREATE | UPDATE | DELETE | APPROVE | CERTIFY)
- `actor_id` (FK → User)
- `resource_type` (PROJECT | PROFILE | WORKFLOW | EXCEPTION)
- `resource_id` (PK of affected resource)
- `before_state`, `after_state` (JSON snapshots)
- `timestamp`, `ip_address`

---

## 6. Core Workflows & State Machines

### 6.1 Certification Lifecycle

**File:** `backend/app/enterprise/lifecycle_service.py`

```
┌─────────────────────────────────────────────────────────────┐
│                         START (OPEN)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────┐
        │  PREPARED              │
        │ (Preparer fills data)  │
        └────────────┬───────────┘
                     │
                     ↓
        ┌────────────────────────┐
        │  SUBMITTED             │
        │ (Ready for review)     │
        └────────────┬───────────┘
                     │
              ┌──────┴──────┐
              ↓             ↓
        (Approve?)    (Return for rework?)
              │             │
              ↓             ↓
        ┌──────────┐  ┌──────────────┐
        │UNDER_    │  │Back to       │
        │REVIEW    │  │PREPARED      │
        │(Approver)│  └──────────────┘
        └────┬─────┘
             │
         ┌───┴────┐
         ↓        ↓
    (Approve?) (Return/Escalate?)
         │         │
         ↓         ↓
    ┌─────────┐ ┌──────────────────┐
    │APPROVED │ │Back to PREPARED  │
    │(Ready   │ │or SUBMITTED      │
    │for cert)│ └──────────────────┘
    └────┬────┘
         │
         ↓
    ┌─────────────────────────────┐
    │  CERTIFIED                  │
    │ (Certifier final sign-off)  │
    │ ✔ Period locked, auditable │
    └─────────────────────────────┘
```

### 6.2 Workflow Actions

**Allowed Actions by Role & Status:**

| Current Status | Preparer | Approver | Certifier | Admin |
|---|---|---|---|---|
| OPEN | Edit profile | — | — | View |
| PREPARED | Edit, Submit | Review (RO) | View | View |
| SUBMITTED | View (RO) | Approve / Return / Escalate | View | View |
| UNDER_REVIEW | View (RO) | Approve / Return / Escalate | View | View |
| APPROVED | View (RO) | View (RO) | Certify / Return | View |
| CERTIFIED | View (RO) | View (RO) | View (RO) | View |

### 6.3 Execution to Profile Promotion Flow

**File:** `backend/app/services/execution_service.py` + `backend/app/enterprise/service.py`

```
Execution (Transient)
├─ Result: 1000 match groups, 50 exceptions
├─ State: COMPLETED
└─ Lifetime: 30 days (auto-purged)
          │
          │ (Preparer clicks "Promote to Profile")
          ↓
ReconciliationProfile (Persistent)
├─ Name, description
├─ Assigned: preparer, approver, certifier
├─ Status: OPEN
├─ Relationships:
│  ├─ Workflow (state machine)
│  ├─ Balances (source/target/variance)
│  ├─ Exceptions (list of unmatched)
│  ├─ Supporting items (evidence)
│  └─ Comments (thread)
└─ Lifecycle: OPEN → PREPARED → SUBMITTED → UNDER_REVIEW → APPROVED → CERTIFIED
```

### 6.4 Balance Reconciliation Workflow

**File:** `backend/app/services/balance_service.py`

```
Balance State Machine:
├─ PENDING
│  └─ Waiting for preparer to investigate variance
├─ UNDER_REVIEW
│  └─ Preparer identified root cause, narrative provided
│  └─ Check: if MATERIAL or CRITICAL variance, narrative is REQUIRED
├─ RECONCILED
│  └─ Variance explained and accepted
├─ DISPUTED
│  └─ Preparer disputes the variance (escalates to approver)
└─ CERTIFIED
   └─ Approver/Certifier signs off on balance
```

**Submission Gate:**

```python
# Submission is blocked if:
if variance_severity in ["MATERIAL_VARIANCE", "CRITICAL_VARIANCE"]:
    if not narrative or len(narrative.strip()) == 0:
        raise ValueError("Narrative required for MATERIAL/CRITICAL variance")
```

### 6.5 Exception Aging Workflow

**File:** `backend/app/services/aging_service.py`

```
Exception Created
├─ Age: 0 days (Current)
├─ Status: OPEN
├─ Alert: None
│
├─ [After 30 days]
│ ├─ Age Bucket: 30–60 days (Aged)
│ ├─ Alert: "Attention required"
│ └─ Escalation: Consider escalation
│
├─ [After 60 days]
│ ├─ Age Bucket: 61–90 days (Breach)
│ ├─ Alert: "Escalation recommended"
│ └─ Escalation: Notify approver
│
└─ [After 90 days]
  ├─ Age Bucket: 90+ days (Critical)
  ├─ Alert: "CRITICAL — Immediate action required"
  └─ Escalation: Auto-escalate to admin
```

---

## 7. API Reference

### 7.1 Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "preparer",
  "password": "preparer123"
}

Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "preparer",
    "email": "preparer@drms.com",
    "role": "preparer"
  }
}
```

### 7.2 Projects

```http
GET /api/projects
Authorization: Bearer <token>

Response:
[
  {
    "id": 1,
    "name": "Bank Reconciliation — US Corporate",
    "description": "GL vs Bank Statement",
    "created_by": 1,
    "status": "ACTIVE",
    "created_at": "2026-06-17T10:00:00",
    "updated_at": "2026-06-17T10:00:00"
  }
]
```

```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Reconciliation",
  "description": "Test project"
}

Response:
{
  "id": 6,
  "name": "New Reconciliation",
  ...
}
```

### 7.3 Datasets

```http
POST /api/projects/1/datasets
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
├─ file: [CSV file]
└─ dataset_type: SOURCE  (or TARGET)

Response:
{
  "id": 10,
  "project_id": 1,
  "dataset_type": "SOURCE",
  "row_count": 5000,
  "column_count": 12,
  "uploaded_at": "2026-06-17T10:05:00"
}
```

### 7.4 Field Mappings

```http
POST /api/projects/1/mappings
Authorization: Bearer <token>
Content-Type: application/json

{
  "mappings": [
    {
      "source_column": "GL_Account",
      "target_column": "Account_Number",
      "is_key_field": true
    },
    {
      "source_column": "Amount_USD",
      "target_column": "Transaction_Amount",
      "is_key_field": false
    }
  ]
}

Response:
{
  "created_count": 2,
  "mappings": [...]
}
```

### 7.5 Matching Rules

```http
POST /api/projects/1/rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Exact Match on GL Account",
  "rule_type": "EXACT",
  "fields": ["GL_Account"],
  "config": {}
}

Response:
{
  "id": 1,
  "project_id": 1,
  "rule_type": "EXACT",
  "enabled": true
}
```

### 7.6 Executions

```http
POST /api/projects/1/executions
Authorization: Bearer <token>
Content-Type: application/json

{}

Response:
{
  "id": 100,
  "project_id": 1,
  "status": "RUNNING",
  "started_at": "2026-06-17T10:10:00"
}
```

```http
GET /api/executions/100/status
Authorization: Bearer <token>

Response:
{
  "id": 100,
  "status": "COMPLETED",
  "match_count": 4950,
  "exception_count": 50,
  "completed_at": "2026-06-17T10:12:00",
  "result_summary": {...}
}
```

```http
POST /api/executions/100/promote
Authorization: Bearer <token>
Content-Type: application/json

{
  "profile_name": "Bank Recon — June 2026",
  "preparer_id": 2,
  "approver_id": 3,
  "certifier_id": 4
}

Response:
{
  "profile_id": 1,
  "status": "OPEN",
  "created_at": "2026-06-17T10:15:00"
}
```

### 7.7 Enterprise Profiles

```http
GET /api/enterprise/profiles
Authorization: Bearer <token>

Query Parameters:
├─ project_id: 1 (optional filter)
├─ status: SUBMITTED (optional filter)
├─ assigned_preparer_id: 2 (optional)
└─ limit: 50, offset: 0

Response:
[
  {
    "id": 1,
    "project_id": 1,
    "name": "Bank Recon — June 2026",
    "assigned_preparer": 2,
    "assigned_approver": 3,
    "assigned_certifier": 4,
    "source_balance": 1000000.00,
    "target_balance": 999950.50,
    "variance_amount": 49.50,
    "variance_severity": "MATERIAL_VARIANCE",
    "status": "SUBMITTED",
    "created_at": "2026-06-17T10:15:00"
  }
]
```

### 7.8 Balance Reconciliation

```http
GET /api/v1/balances/profiles/1/balances
Authorization: Bearer <token>

Response:
{
  "profile_id": 1,
  "source_balance": 1000000.00,
  "target_balance": 999950.50,
  "variance_amount": 49.50,
  "variance_percent": 0.00495,
  "variance_severity": "MATERIAL_VARIANCE",
  "variance_narrative": "FX adjustment pending on USD/EUR conversion",
  "explained_variance": 50.00,
  "unexplained_variance": 0.00,
  "reconciliation_status": "UNDER_REVIEW"
}
```

### 7.9 Workflow Actions

```http
POST /api/enterprise/workflows/1/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "comment": "Verified all evidence and attachments. Approved."
}

Response:
{
  "workflow_id": 1,
  "status": "APPROVED",
  "updated_at": "2026-06-17T10:20:00"
}
```

```http
POST /api/enterprise/workflows/1/return
Authorization: Bearer <token>
Content-Type: application/json

{
  "comment": "Please add supporting documentation for the FX variance.",
  "return_to_status": "PREPARED"
}

Response:
{
  "workflow_id": 1,
  "status": "PREPARED",
  "updated_at": "2026-06-17T10:20:00"
}
```

### 7.10 Audit Logs

```http
GET /api/audit/logs
Authorization: Bearer <token>

Query Parameters:
├─ actor_id: 2 (optional)
├─ resource_type: PROFILE (optional)
├─ action: APPROVE (optional)
├─ date_from: 2026-06-01 (optional)
└─ limit: 100, offset: 0

Response:
[
  {
    "id": 1001,
    "action": "APPROVE",
    "actor_id": 3,
    "resource_type": "PROFILE",
    "resource_id": 1,
    "before_state": {"status": "UNDER_REVIEW"},
    "after_state": {"status": "APPROVED"},
    "timestamp": "2026-06-17T10:20:00",
    "ip_address": "192.168.1.100"
  }
]
```

**Full Swagger UI:** `http://localhost:8000/api/docs`

---

## 8. Frontend Structure & Components

### 8.1 Pages & User Flows

#### Admin — Command Center (`/command-center`)
- **Access:** Admin only
- **Features:**
  - User management (create, deactivate, role assignment)
  - System settings (DEMO_MODE, database settings)
  - Audit log viewer
  - Demo data seeder button
  - Scheduler status monitor

#### Preparer — My Reconciliations (`/my-reconciliations`)
- **Access:** Preparer + Admin
- **Flow:**
  1. See list of projects assigned to me
  2. Click project → open Preparer Workbench
  3. Upload source & target CSV
  4. Define field mappings
  5. Create matching rules
  6. Run execution
  7. Review match groups & exceptions
  8. Attach evidence (screenshots, documents)
  9. Click "Submit for Review"

#### Preparer — Balance Workspace (`/balance-reconciliation/profile/:id`)
- **Access:** Preparer + Approver + Admin
- **Features:**
  - Source balance vs target balance
  - Variance display (raw, severity, flux)
  - Narrative input (required if MATERIAL/CRITICAL)
  - Prior period snapshots
  - Variance trend chart

#### Approver — Work Queue (`/work-queue`)
- **Access:** Approver + Admin
- **Features:**
  - List of SUBMITTED profiles waiting for review
  - Click profile → review preparer submission
  - View attached evidence
  - Approve / Return / Escalate buttons
  - Comment thread with preparer

#### Approver — Approver Workbench (`/approver-workbench`)
- **Access:** Approver + Admin
- **Features:**
  - Alternative view of work queue
  - Detailed evidence viewer
  - Approval/return/escalation workflow

#### Certifier — Close Certification (`/close-certification`)
- **Access:** Certifier + Admin
- **Features:**
  - List of APPROVED profiles awaiting certification
  - Review final evidence
  - Certify (lock period) / Return buttons
  - Close certification dashboard

#### Executive Dashboard (`/executive-dashboard`)
- **Access:** All roles
- **Features:**
  - KPIs (total profiles, certified %, SLA status)
  - Volume trends (chart)
  - Risk heat map
  - Exception summary

#### Analytics Dashboards
- **Variance Analytics** (`/variance-analytics/:profile_id`)
  - Period-over-period variance
  - Explained/unexplained split
  - Flux tracking chart

- **Exception Aging** (`/aging-dashboard`)
  - 30/60/90+ day buckets
  - Heat map by entity
  - Escalation recommendations

- **Risk Dashboard** (`/risk-dashboard`)
  - Risk-scored profiles
  - Heat map by risk level
  - Drill-down by profile

### 8.2 Key React Components

#### `ProtectedRoute.jsx`
```jsx
function ProtectedRoute({ requiredRoles, children }) {
  const user = useContext(AuthContext);
  
  if (!user || !requiredRoles.includes(user.role)) {
    return <Navigate to="/login" />;
  }
  
  return children;
}
```

#### `Layout.jsx` (Sidebar + Navbar)
- Role-aware navigation menu
- Shows different pages based on `user.role`
- Logout button
- Current user display

#### `BalanceReconciliationPage.jsx`
- Displays source/target balances
- Shows variance with severity
- Narrative input (gated by severity)
- Chart for period-over-period trends

### 8.3 State Management

**Auth Context:** `AuthProvider` holds login state and user info
**API Calls:** TanStack Query (React Query) for data fetching, caching, invalidation
**Component State:** Local `useState` for form inputs, modals, filters

---

## 9. Tech Stack Details

### 9.1 Backend — Python 3.11 + FastAPI

| Component | Version | Purpose |
|-----------|---------|---------|
| **FastAPI** | 0.115+ | Web framework, routing, dependency injection |
| **SQLAlchemy** | 2.x | ORM, database abstraction |
| **Pydantic** | 2.x | Request/response validation |
| **PyJWT** | 2.x | JWT token generation/verification |
| **python-multipart** | 0.x | Multipart form data (CSV upload) |
| **python-dateutil** | 2.x | Date parsing/calculations |
| **pandas** (optional) | 1.x | CSV processing, data transformation |
| **openpyxl** (optional) | 3.x | Excel export |

**Database Drivers:**
- `mysql-connector-python` (MySQL)
- `sqlite3` (SQLite, built-in)

### 9.2 Frontend — Node 18 + React 18

| Component | Version | Purpose |
|-----------|---------|---------|
| **React** | 18.x | UI library, components |
| **Vite** | 5.x | Build tool, dev server |
| **React Router** | 6.x | Client-side routing |
| **TanStack Query** | 5.x | Server state management, caching |
| **Vanilla CSS** | — | Global styles + CSS variables (dark/light theme) |
| **Axios** | Latest | HTTP client with JWT interceptor |
| **Apache ECharts** | 5.x | Charts (burndown, heatmap, variance, aging, risk) |
| **Zustand** | 4.x | Auth + project state management |
| **Lucide React** | Latest | Icon library |

### 9.3 Database Schema

**MySQL Configuration:**
- **Charset:** UTF8MB4 (supports emoji, extended characters)
- **Collation:** utf8mb4_unicode_ci
- **Engine:** InnoDB (transactions, FK constraints)

**SQLite Configuration (local dev):**
- **File:** `drms_demo.db` (checked into `.gitignore`)
- **Pragma:** `journal_mode=WAL` (write-ahead logging for concurrency)

### 9.4 Deployment

**Backend:**
```bash
# Production server (not uvicorn)
pip install gunicorn
gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

**Frontend:**
```bash
# Production build
npm run build
# Output in `dist/` — serve with nginx or similar
```

**Docker:**
```dockerfile
FROM python:3.11
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "app.main:app", "--bind", "0.0.0.0:8000"]
```

---

## 10. Comparison to Oracle ARCS & BlackLine

### 10.1 Feature Comparison Matrix

| Feature | DRMS | Oracle ARCS | BlackLine |
|---------|------|------------|-----------|
| **Core Reconciliation** | ✅ Full | ✅ Full | ✅ Full |
| **Multi-Currency** | ⚠️ USD equiv | ✅ Full FX | ✅ Full FX |
| **Exception Aging** | ✅ 30/60/90+ | ✅ Custom | ✅ Custom |
| **Risk Scoring** | ✅ Rule-based | ✅ ML-powered | ✅ ML-powered |
| **Segregation of Duties** | ✅ 4-role model | ✅ 8+ roles | ✅ 10+ roles |
| **Approval Chains** | ⚠️ Basic | ✅ Advanced | ✅ Advanced |
| **Audit Trail** | ✅ Full trail | ✅ Full trail | ✅ Full trail |
| **Workflow Automation** | ⚠️ Manual gates | ✅ Rules engine | ✅ Rules engine |
| **Real-time Collab** | ❌ No | ✅ Yes | ✅ Yes |
| **Mobile App** | ❌ No | ✅ iOS/Android | ✅ Mobile-web |
| **API-first** | ✅ REST + Swagger | ⚠️ Limited API | ⚠️ Limited API |
| **On-premises** | ✅ Yes | ✅ Yes | ❌ SaaS only |
| **Open-source** | ✅ Custom build | ❌ Proprietary | ❌ Proprietary |
| **Price** | 💰 Minimal (self-hosted) | 💰💰💰 Very High | 💰💰💰 Very High |

### 10.2 Architecture Comparison

#### Oracle ARCS
- **Stack:** Java + Oracle Database + proprietary UI
- **Strength:** Highly scalable, battle-tested in large enterprises
- **Weakness:** Very expensive, slow to customize, vendor lock-in
- **Use Case:** Fortune 500 global finance teams

#### BlackLine
- **Stack:** Cloud-native SaaS (AWS), proprietary backend
- **Strength:** Modern UX, real-time collab, mobile, strong ML
- **Weakness:** SaaS-only, high subscription costs, limited customization
- **Use Case:** Mid-market to enterprise, prefer cloud-first

#### DRMS
- **Stack:** Python + React + Open architecture
- **Strength:** Fast to customize, API-driven, on-premises friendly, low cost
- **Weakness:** Smaller user base, limited out-of-box ML, fewer integrations
- **Use Case:** Organizations with custom needs, finance tech teams, cost-sensitive buyers

### 10.3 When to Choose DRMS

✅ **Choose DRMS if:**
- You need a **customizable reconciliation platform** (Python backend is easy to modify)
- You want **on-premises deployment** (data residency requirements)
- You need **low total cost of ownership** (open-source foundation)
- Your org has **in-house engineering** (can maintain custom extensions)
- You want **API-first architecture** (integrate with custom workflows)
- You need **specific industry workflows** (healthcare, energy, telecom)

❌ **Don't choose DRMS if:**
- You need **out-of-box enterprise features** (8+ roles, advanced delegation, ML anomaly detection)
- You want **minimal IT overhead** (SaaS is simpler)
- You need **mobile-first** experience
- You require **24/7 vendor support** (open-source community is voluntary)
- You have **Fortune 500 scale** (>10M transactions/day)

---

## 11. Known Limitations & Roadmap

### 11.1 Current Limitations

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| **Single-threaded execution** | Large datasets (>500K rows) may timeout | Implement parallel matching in Phase 2 |
| **No real-time notifications** | Users must refresh page to see updates | Planned WebSocket upgrade in Q3 2026 |
| **USD-centric FX** | Multi-currency conversions lose precision | Add full FX conversion library |
| **No saved filters** | Users re-apply filters on each login | Add filter persistence to User prefs |
| **No workflow templates** | Workflows created manually for each profile | Add workflow template builder |
| **No integration hooks** | Can't auto-trigger external systems (Salesforce, SAP) | Add webhook support |

### 11.2 Roadmap (Next 12 Months)

#### Q3 2026 (Immediate)
- [ ] Add comprehensive unit test suite (services, workflows)
- [ ] Integration tests for end-to-end flows
- [ ] Performance tuning for 500K+ record executions
- [ ] Improved error messages and validation feedback

#### Q4 2026 (Near-term)
- [ ] Real-time notifications (WebSocket / Server-Sent Events)
- [ ] Advanced delegation workflows
- [ ] Full multi-currency FX conversion
- [ ] Saved filters and custom views

#### Q1 2027 (Mid-term)
- [ ] Workflow templates and scheduling
- [ ] ML-powered anomaly detection
- [ ] Webhook integrations (Salesforce, SAP, Oracle)
- [ ] Two-factor authentication

#### Q2+ 2027 (Long-term)
- [ ] Mobile app (React Native)
- [ ] SAML/OAuth2 SSO
- [ ] Advanced analytics (predictive SLA, anomaly forecasting)
- [ ] Data masking and PII redaction

---

## 12. How to Update This Document

### 12.1 When to Update

Update `CLAUDE_CONTEXT.md` **after each major change** to:
- Core workflow logic
- Role model changes
- Database schema migrations
- New features or APIs
- Removal of features or roles
- Architecture refactoring

### 12.2 Update Checklist

After making changes, ensure this document reflects:

- [ ] **Role Model:** Update Section 4 if roles added/removed/renamed
- [ ] **Data Model:** Update Section 5 if tables added/modified/dropped
- [ ] **Workflows:** Update Section 6 state machine diagrams
- [ ] **API:** Update Section 7 with new endpoints or changed signatures
- [ ] **Frontend:** Update Section 8 with new pages or removed pages
- [ ] **Tech Stack:** Update Section 9 if dependencies upgraded
- [ ] **Status:** Update Section 3 completed/in-progress items
- [ ] **Limitations:** Update Section 11 if new blockers discovered
- [ ] **Roadmap:** Update Section 11.2 priorities and timelines

### 12.3 Format Guidelines

**Use this format when documenting changes:**

```markdown
### [Feature Name]

**File(s):** `backend/app/enterprise/service.py`, `frontend/src/pages/ApproverWorkbench.jsx`

**Change Summary:**
Brief 1-2 sentence description of what changed.

**Before:**
Old behavior / code snippet

**After:**
New behavior / code snippet

**Impact:**
List affected roles, workflows, or APIs

**Date:** 2026-06-17
**Author:** Raghav Bhardwaj
```

### 12.4 Version Control

Include changelog entries in this format:

```markdown
## Change Log

### 2026-06-18 — Phase 2 Chunk 3: Financial Close Calendar
- **Change:** Added `ClosePeriod` + `ClosePeriodTask` models, 7 REST endpoints, `FinancialCloseCalendarPage.jsx`, close readiness validator
- **Impact:** Certifier can now orchestrate full month-end close across all profiles; demo seeds 3 periods
- **Files:** `models/models.py`, `models/close_calendar_migration.py`, `services/close_calendar_service.py`, `routes/close_calendar.py`, `pages/FinancialCloseCalendarPage.jsx`
- **Status:** ✅ Complete

### 2026-06-17 — Role-Based Collapsible Sidebars
- **Change:** Replaced flat sidebar with collapsible grouped nav for all 4 roles; added `ApproverDashboard.jsx`; updated Approver landing to `/approver-dashboard` and Certifier landing to `/executive-dashboard`
- **Files:** `components/Layout.jsx`, `pages/ApproverDashboard.jsx`, `App.jsx`
- **Status:** ✅ Complete

### 2026-06-17 — Role Model Consolidation
- **Change:** Merged REVIEWER into APPROVER; removed AUDITOR role; 4 core roles
- **Files:** `rbac/roles.py`, `enterprise/routes.py`, `workflow/routes.py`
- **Status:** ✅ Complete

### 2026-06-10 — Balance Narrative Gate
- **Change:** Added mandatory narrative for MATERIAL/CRITICAL variance
- **Files:** `balance_service.py`, `BalanceReconciliationPage.jsx`
- **Status:** ✅ Complete
```

---

## Appendix A: Running the System Locally

### A.1 Quick Start

```bash
# 1. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# .env settings
cat > .env << EOF
DATABASE_URL=sqlite:///./drms_demo.db
SECRET_KEY=dev-secret-key-change-in-prod
DEMO_MODE=true
EOF

uvicorn app.main:app --reload --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev
# http://localhost:5173

# 3. Demo data (new terminal, backend must be running)
cd backend
.\.venv\Scripts\Activate.ps1
python scripts/seed_demo_projects.py

# 4. Login
http://localhost:5173 → admin / admin123
```

### A.2 Demo Credentials

| Role | Username | Password | Landing Page |
|------|----------|----------|--------------|
| Admin | admin | admin123 | `/command-center` |
| Preparer | preparer | preparer123 | `/my-reconciliations` |
| Approver | approver | approver123 | `/approver-dashboard` ✨ |
| Certifier | certifier | certifier123 | `/executive-dashboard` ✨ |

---

## Appendix B: File Size & Complexity

### B.1 Largest Backend Files

| File | Lines | Complexity | Purpose |
|------|-------|-----------|---------|
| `enterprise/service.py` | ~1200 | High | Full profile & certification logic |
| `enterprise/routes.py` | ~1000 | High | 40+ endpoints for profiles |
| `services/execution_service.py` | ~600 | Medium | Execution orchestration |
| `balance_service.py` | ~500 | Medium | Balance reconciliation workflow |
| `variance_service.py` | ~400 | Medium | Variance calculations |
| `matching_engine.py` | ~400 | High | Matching algorithm core |
| `models/models.py` | ~700 | Medium | 20+ SQLAlchemy models |

### B.2 Frontend Bundle Size

- **Production build:** ~250 KB (gzipped)
- **Dev server:** ~1.2 MB (with source maps)
- **Main dependencies:** React (42KB), React Router (6KB), TanStack Query (30KB), Tailwind (8KB)

---

## Appendix C: Troubleshooting

### Backend Won't Start

**Error:** `NameError: name 'APPROVER' is not defined`
- **Cause:** Missing import after role refactor
- **Fix:** Add `APPROVER` to import in route file:
  ```python
  from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
  ```

**Error:** `ModuleNotFoundError: No module named 'pydantic_settings'`
- **Cause:** Missing dependency
- **Fix:** `pip install pydantic-settings`

**Error:** `sqlite3.OperationalError: database is locked`
- **Cause:** Multiple processes accessing SQLite simultaneously
- **Fix:** Use MySQL for production; restart backend

### Frontend Won't Load

**Error:** `GET /api/auth/login → 404`
- **Cause:** Backend not running or CORS misconfigured
- **Fix:** Ensure backend running on port 8000; check `CORSMiddleware` in `main.py`

**Error:** `TypeError: Cannot read property 'role' of undefined`
- **Cause:** Auth context not initialized
- **Fix:** Ensure `AuthProvider` wraps app in `App.jsx`

---

## Appendix D: References

- **API Documentation:** http://localhost:8000/api/docs (Swagger UI)
- **GitHub Repo:** (link to your monorepo)
- **Team Wiki:** (if applicable)
- **Database Diagrams:** (link to ERD if exists)

---

**End of Context Document**

**Last Reviewed:** 2026-06-18  
**Reviewed By:** Raghav Bhardwaj  
**Next Review:** After next major feature release or close calendar phase 2 completion
