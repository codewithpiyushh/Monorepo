# DRMS - Data Reconciliation Management System

Enterprise reconciliation platform inspired by Oracle EPM Reconciliation Compliance, built with FastAPI + React.

## Stack
- Backend: FastAPI, SQLAlchemy, APScheduler, Pandas
- Frontend: React, Vite, Tailwind
- Auth/RBAC: JWT (`admin`, `preparer`, `reviewer`, `approver`, `certifier`)

## Repository Layout
```text
Raghav Bhardwaj/
|-- backend/
|   |-- app/
|   |-- migrations/
|   |-- scripts/
|   |-- requirements.txt
|   `-- .env.example
|-- frontend/
|   |-- src/
|   `-- package.json
|-- evidences/
`-- readme.md
```

## Run On Another Laptop (Recommended: SQLite)

### 1) Clone
```powershell
git clone <your-repo-url>
cd Monorepo\Raghav Bhardwaj
```

### 2) Backend setup
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

Backend docs: `http://localhost:8000/api/docs`

### 3) Frontend setup
Open another terminal:
```powershell
cd Monorepo\Raghav Bhardwaj\frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Optional: MySQL Instead of SQLite
In `backend/.env`, set:
```env
DATABASE_URL=mysql+pymysql://<user>:<password>@localhost:3306/<database_name>
```

Then run:
```powershell
python seed.py
python scripts/apply_oracle_style_migration.py
```

## Demo Users
- `admin` / `admin123`
- `preparer` / `preparer123`
- `reviewer` / `reviewer123`

## One-Command Demo Reset (5 Fresh Projects)
Use this when you want to show complete project flow with clean demo data.

```powershell
cd backend
.\.venv\Scripts\python.exe seed.py
.\.venv\Scripts\python.exe scripts\bootstrap_demo_projects.py
```

What it does:
1. Removes existing projects (after clearing dependent sequence/workflow artifacts).
2. Creates 5 new projects with different reconciliation scenarios.
3. Uploads source/target datasets, applies mappings and rules.
4. Runs executions and advances workflow (assign -> submit -> approve).

Generated dataset files are exported to:
- `backend/generated_projects/`

Current seeded demo projects:
1. Retail Cash Reconciliation
2. Bank vs GL Month End
3. Intercompany AP-AR
4. Payroll Clearing
5. Suspense Account Cleanup

## Analyze Section Scope (Latest Change)
- `Executive Overview`, `Reconciliation Compliance`, and `Risk & Compliance Dashboard` now use the selected project context.
- Select a project once (header project selector), and all Analyze pages use that project’s latest execution data.

## Key Implemented Areas
- Project lifecycle, ingestion, mapping, rules, matching
- Workflow actions (assign/submit/approve/reject)
- Reconciliation profiles and rule builder APIs
- Close calendar, certification workflow, exceptions
- Evidence and audit package support
- Sequence runs and scheduler APIs
- Role-based dashboards and audit logs

## GitHub Safety Checklist
1. Do not commit `backend/.env` (only keep `.env.example`).
2. Ensure no local DB/exports/uploads are staged.
3. Validate with:
```powershell
git status
git diff --cached
```
