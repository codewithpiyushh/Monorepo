# Reconciliation App — Quickstart

This repository contains a reconciliation application (backend FastAPI + frontend React). For a full, detailed guide see `PROJECT_GUIDE.md`.

Quick start (local development):

1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -c "from app.database import init_db; init_db()"
uvicorn app.main:app --reload --port 8000
```

2. Frontend

```bash
cd frontend
npm install
npm run dev
```

3. Seed demo data (optional)

```powershell
cd backend
python scripts\bootstrap_demo_database.py
```

Where to go next:
- Read the full `PROJECT_GUIDE.md` for architecture, role descriptions, flows, and API examples.
- Open the Preparer/Reviewer/Execution workbenches in the UI to try a seeded demo flow.
# DRMS — Data Reconciliation Management System

Enterprise financial reconciliation platform inspired by **Oracle ARCS** and **BlackLine**, built with FastAPI + React.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, APScheduler, Pandas, RapidFuzz |
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query, ECharts |
| Auth / RBAC | JWT — `admin`, `preparer`, `reviewer`, `approver`, `certifier`, `auditor` |
| Database | SQLite (default) · MySQL / PostgreSQL (optional) |
| Matching | 4-phase advanced engine (holistic scoring, many-to-one, one-to-many, cross-period) |

---

## Repository Layout

```text
Raghav Bhardwaj/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, security, dependencies
│   │   ├── enterprise/     # Profiles, matching, exceptions, certifications, analytics
│   │   ├── models/         # SQLAlchemy ORM models (CloseTask, ReconciliationProfile, …)
│   │   ├── rbac/           # Role-based access control
│   │   ├── routes/         # Projects, executions, workflows, auth
│   │   ├── scheduler/      # APScheduler jobs
│   │   ├── services/       # execution_service, matching_engine, audit_service
│   │   └── main.py
│   ├── migrations/
│   ├── scripts/
│   │   └── apply_oracle_style_migration.py
│   ├── generate_enterprise_data.py   # Seed realistic enterprise data
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/            # index.js — all API methods (enterpriseAPI, advancedAPI, …)
│   │   ├── components/     # Layout, PageHeader, NotificationCenter, ProjectCreationModal, …
│   │   ├── pages/          # All application pages
│   │   ├── store/          # Zustand stores (auth, project, theme)
│   │   └── utils/
│   └── package.json
├── evidences/
└── README.md
```

---

## Run On Another Machine (SQLite — Recommended)

### 1. Clone
```powershell
git clone <your-repo-url>
cd "Monorepo\Raghav Bhardwaj"
```

### 2. Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env

# Seed access users + enterprise demo data
python seed.py
python generate_enterprise_data.py
python scripts/apply_oracle_style_migration.py

uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/api/docs`

### 3. Frontend
Open a new terminal:
```powershell
cd "Monorepo\Raghav Bhardwaj\frontend"
npm install
npm run dev
```

App: `http://localhost:5173`

### One-shot demo seed
From the repo root, run:
```powershell
.\seed-demo-flow.ps1
```
That resets and seeds the full demo flow automatically: users, projects, enterprise profiles, close calendars, workflows, exceptions, notifications, and supporting audit data.

---

## Optional: MySQL / PostgreSQL

In `backend/.env`:
```env
# MySQL
DATABASE_URL=mysql+pymysql://<user>:<password>@localhost:3306/<db>

# PostgreSQL
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db>
```

Then re-run:
```powershell
python seed.py
python generate_enterprise_data.py
python scripts/apply_oracle_style_migration.py
```

---

## Access Users

`seed.py` creates the following local accounts:

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | Admin — full access |
| sarah.chen | Password@123 | Preparer |
| emily.chan | Password@123 | Reviewer |
| grace.kim | Password@123 | Approver |
| cynthia.ford | Password@123 | Certifier |
| irene.scott | Password@123 | Auditor |
| preparer | preparer123 | Preparer (legacy) |
| reviewer | reviewer123 | Reviewer (legacy) |

> Default role redirect: **Preparer** → My Reconciliations · **Reviewer** → Work Queue · **Others** → Command Center

---

## Application Flow

### Ad-hoc Project Matching (CSV Upload)
1. Create a new project from the **Command Center**.
2. Upload source and target CSV files.
3. Map columns and define matching rules.
4. Run execution — view matched / partial / unmatched results.
5. Click **"Promote to Enterprise"** to push results into the full DRMS workflow.

### Enterprise Reconciliation Lifecycle
```
Create Profile → Ingest Data → Run Advanced Matching → Work Exceptions
      → Evidence Upload → Variance Explanation → Journal Adjustments
      → Submit (Preparer) → Review → Approve → Certify → Lock Period
```

---

## Advanced Matching Engine

Four-phase pipeline in `backend/app/services/matching_engine.py`:

| Phase | Description |
|---|---|
| 1 — Candidate Generation | Amount-bucketed index; finds ALL candidates within tolerance in O(k) |
| 2 — Holistic Scoring | Amount (40%) + Date (20%) + Reference fuzzy (25%) + Description (10%) + Entity (5%) |
| 3a — Many-to-One | Detects N source rows that sum to one target (e.g. $600 + $400 = $1,000) |
| 3b — One-to-Many | Detects one source split across N targets |
| 3c — Cross-Period | Queries prior-period unmatched records to settle current open items |
| 4 — AI Suggestions | Ranks remaining unmatched by composite score without forcing a match |

Run from **Transaction Matching Workspace** or via API:
```
POST /enterprise/matching/run-advanced
{ "profile_id": 1, "auto_match_threshold": 0.92, "cross_period_days": 90 }
```

---

## Preparer Workspace (My Reconciliations)

Each assigned profile exposes 9 sections:

| Tab | Purpose |
|---|---|
| Home | Live balance cards, completion checklist, overdue/due-soon tasks |
| Matching | Match groups — classification, strategy, confidence, variance |
| Exceptions | Exception queue filtered to this profile |
| Evidence | Drag-and-drop file upload (PDF, Excel, CSV, Word, Images) with document type tagging |
| Variance | Line-by-line variance explanation — category, resolution date, free-text |
| Adjustments | Create / view journal adjustments (account, amount, currency, period, reason) |
| Comments | Threaded discussion with reviewer |
| History | Workflow timeline — all prepare/submit/approve/reject/certify actions |
| Submit | Preparer justification + submit for reviewer approval |

---

## Key Pages

| Page | Route | Roles |
|---|---|---|
| Command Center | `/command-center` | All |
| My Reconciliations | `/my-reconciliations` | Preparer, Admin |
| Work Queue | `/work-queue` | Reviewer, Approver, Admin |
| Transaction Matching | `/transaction-matching` | All |
| Reconciliation Profiles | `/reconciliation-profiles` | All |
| Exception Workbench | `/exception-workbench` | All |
| Close Certification | `/close-certification` | Certifier, Approver, Admin |
| Executive Dashboard | `/executive-dashboard` | All |
| Risk Dashboard | `/risk-dashboard` | All |
| Reconciliation Analytics | `/analytics-explorer` | All |
| Audit Trail | `/audit` | Auditor, Admin |
| Admin Center | `/admin` | Admin |
| Rule Builder | `/rule-builder` | Admin, Preparer |

---

## Period Lock Enforcement

Once a close calendar period is locked (`POST /enterprise/close-calendar/{id}/lock`):
- No new transactions can be ingested for that period
- Match groups cannot be modified
- Journal adjustments cannot be posted
- All write operations return `400 — Period is locked`

Unlock requires **Admin** role and a written reason (`POST /enterprise/close-calendar/{id}/unlock`).

---

## Enterprise Data Generator

`generate_enterprise_data.py` seeds 7 enterprise company scenarios with realistic data:

| Company | Type | Tx Volume |
|---|---|---|
| GlobalMFG Corp | Global Manufacturing | ~2,500 |
| RetailMax Inc | Retail | ~3,500 |
| FirstNational Bank | Banking | ~5,000 |
| ShieldLife Insurance | Insurance | ~1,800 |
| MedCore Health | Healthcare | ~2,200 |
| TechNova Systems | Technology | ~1,500 |
| PetroCycle Energy | Energy | ~2,000 |

Populates: profiles, reconciliation records, match groups, exceptions, certification workflows, close calendar entries, journal adjustments, audit logs, UI notifications.

---

## Notification System

Role-aware notifications — each role sees notifications routed to the right page:

| Role | Clicks notification → |
|---|---|
| Preparer | My Reconciliations |
| Reviewer | Work Queue |
| Approver | Work Queue / Close Certification |
| Certifier | Close Certification |
| Auditor | Audit Trail |

---

## Controls & Compliance

- **SoD Enforcement**: Preparer ≠ Reviewer ≠ Approver ≠ Certifier (enforced at profile creation and workflow submission)
- **Risk Scoring**: Per-profile composite risk score (0–100) based on unmatched %, open exceptions, and base risk classification
- **SoD Violation Detection**: Risk Dashboard surfaces profiles where the same user is assigned multiple conflicting roles
- **Audit Trail**: Hash-chained tamper-evident log — every write operation is recorded with IP, user, entity, and previous-hash reference

---

## API Summary

| Area | Base Path |
|---|---|
| Auth | `/api/auth` |
| Projects | `/api/projects` |
| Enterprise | `/api/enterprise` |
| Matching | `/api/enterprise/matching` |
| Exceptions | `/api/enterprise/exceptions` |
| Certifications | `/api/enterprise/certification` |
| Close Calendar | `/api/enterprise/close-calendar` |
| Journals | `/api/enterprise/journals` |
| Analytics | `/api/enterprise/analytics` |
| Dashboards | `/api/enterprise/dashboard` |
| Risk | `/api/enterprise/risk` |
| Notifications | `/api/enterprise/notifications` |

Full interactive docs: `http://localhost:8000/api/docs`

---

## GitHub Safety Checklist

Before pushing:
```powershell
# Never commit these:
#   backend/.env
#   backend/drms.db
#   backend/uploads/
#   frontend/node_modules/

git status
git diff --cached
```

Ensure `.gitignore` includes:
```
.env
*.db
*.db-wal
*.db-shm
uploads/
node_modules/
__pycache__/
.venv/
dist/
```
