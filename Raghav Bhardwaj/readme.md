# DRMS

Data Reconciliation Management System.

## Start Here

- [PROJECT_GUIDE.md](./PROJECT_GUIDE.md) for the full project overview, architecture, and workflows.
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the current repo state, what is implemented, and what is still missing.

## Current Snapshot

- Backend: FastAPI + SQLAlchemy
- Frontend: React + Vite + TanStack Query
- Core flows: project execution, enterprise reconciliation, balance reconciliation, supporting items, and variance analytics
- Validation: backend syntax and frontend build are currently passing locally

## Local Run

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -c "from app.database import init_db; init_db()"
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

