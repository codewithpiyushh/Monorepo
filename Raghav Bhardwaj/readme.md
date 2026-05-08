# DRMS - Data Reconciliation Management System

Enterprise reconciliation platform built with **FastAPI + React** for ingestion, mapping, matching, workflow approvals, evidence, and audit.

## Tech Stack
- Backend: FastAPI, SQLAlchemy, APScheduler, Pandas
- Frontend: React, Vite, Tailwind, React Query
- Auth/RBAC: JWT with Admin / Preparer / Reviewer roles

## Project Structure
```text
drms_AI/
|-- backend/
|   |-- app/
|   |-- scripts/
|   |-- seed.py
|   |-- requirements.txt
|   `-- .env.example
|-- frontend/
|   |-- src/
|   |-- package.json
|   `-- vite.config.js
|-- demo_check.ps1
`-- README.md
```

## Prerequisites
- Python 3.11+
- Node.js 18+
- npm

## Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
python seed.py
python scripts/apply_oracle_style_migration.py
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/api/docs`

## Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

## Demo Users
| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `preparer` | `preparer123` | Preparer |
| `reviewer` | `reviewer123` | Reviewer |

## Demo Flow (for presentation)
1. Login as `admin`.
2. Create project -> Ingestion: upload source + target files.
3. Mapping: auto-map / confirm one key field.
4. Rules: save matching rules.
5. Workspace: run reconciliation, review summary and transactions.
6. Login as `preparer`: add comments, submit workflow.
7. Login as `reviewer`: approve/reject.
8. Verify audit logs and export.

## Automated Demo Health Check
Run from repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\demo_check.ps1
```

Expected output:
- `DEMO_CHECK_OK`
- JSON with `project_id`, `execution_id`, `results_total`, `status: completed`

## Validation Completed (May 8, 2026)
- Frontend production build: `npm run build` -> passed.
- Backend compile sanity: `python -m compileall app` -> passed.
- End-to-end demo workflow script: `demo_check.ps1` -> passed (`DEMO_CHECK_OK`).

## GitHub Publishing Checklist
1. Ensure `backend/.env` is **not committed** (keep only `backend/.env.example`).
2. Confirm `.gitignore` excludes local DBs, uploads, venvs, and node_modules.
3. Optionally remove large local demo artifacts before first push.

## Notes
- Current repo includes local demo/runtime files (DB, uploads, CSV). `.gitignore` now prevents new ones from being committed.
- If any sensitive values were committed before, rotate credentials before publishing.
