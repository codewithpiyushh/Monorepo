# End-to-End ML Dashboard (Frontend + API + Database)

This project runs a full pipeline for:
- model training and evaluation
- anomaly detection
- net income prediction
- CSV output generation
- SQLite persistence of files and run history

The existing functionality is unchanged. A database layer has been added behind the same API flow.

## Tech Stack

- Frontend: React + Vite
- Backend API: FastAPI
- ML: scikit-learn, pandas, numpy
- Database: SQLite (local file `server/project_store.db`)

## Project Structure

- `src/`: React UI
- `server/api.py`: FastAPI endpoints used by frontend
- `server/*.csv`: input/output datasets
- `server/project_store.db`: auto-created SQLite database for persistence

## API Endpoints

- `GET /api/health`
- `GET /api/files`
- `GET /api/files/{file_name}/preview`
- `POST /api/run-pipeline`
- `POST /api/predict`
- `GET /api/download/predictions`
- `GET /api/database/summary`

## What Is Stored In The Database

- Workspace files metadata and content snapshots (`project_files`)
- Dataset previews (`file_previews`)
- Pipeline run details and outputs (`pipeline_runs`)
- Prediction run details and outputs (`prediction_runs`)

## Local Setup

### 1. Start backend

From the `server` folder:

```powershell
pip install -r requirements.txt
uvicorn api:main --reload --host 127.0.0.1 --port 8080
```

### 2. Start frontend

From the project root `frontend` folder:

```powershell
npm install
npm run dev
```

Frontend default URL: `http://127.0.0.1:5173`

## Notes

- The frontend calls `/api/*` and Vite proxies that to `http://127.0.0.1:8080` by default.
- To use a different backend port, set `VITE_API_PROXY_TARGET` before running `npm run dev`.
- Database persistence is automatic whenever files are listed, previews are opened, and pipeline/prediction operations are run.
- Uploaded files are now persisted to SQLite immediately in the upload API flow.
