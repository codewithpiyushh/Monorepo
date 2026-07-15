# DRMS - Dynamic Reconciliation Management System

DRMS is a comprehensive, enterprise-grade financial close, transaction matching, and exception management platform. It is designed to automate the reconciliation lifecycle, enforce SOX compliance workflows, and provide real-time visibility into financial close readiness.

## Core Roles & Permissions
The system enforces strict Segregation of Duties (SoD) across four primary roles:
1. **Admin**: Platform configuration, data ingestion, rule building, compliance policy management, approval chain setup, and global visibility.
2. **Preparer**: Investigates exceptions, resolves unmatched transactions, attaches supporting evidence, and submits period balances.
3. **Approver**: Reviews the Preparer's manual interventions, validates evidence, and approves or rejects reconciliation profiles.
4. **Certifier**: Executive oversight. Monitors the financial close calendar, audits governance violations, and provides final sign-off on accounting periods.

## End-to-End Application Flow

### 1. Data Ingestion & Staging
Data from source systems (GL, Sub-ledgers, Bank Statements) is ingested via the **Data Ingestion Center**. Records land in `RawStagingRecord` tables and are transformed/normalized before processing.

### 2. Transaction Matching Engine
The core execution engine runs customizable matching rules (Exact, Tolerance, Fuzzy, Date-Diff) against the ingested datasets. It supports automated 1-to-1 and 1-to-Many matching using a high-performance 4-phase algorithmic pipeline.

### 3. Exception Management
Transactions that fail the matching rules drop into the **Exception Queue**. 
- Exceptions are aged and tracked (`ExceptionAgingSnapshot`).
- SLA Monitors automatically escalate aging items to managers.
- **Preparers** use the Exception Workbench to investigate root causes, attach evidence, and propose adjusting journal entries.

### 4. Approval Workflows
Once a Preparer resolves their exceptions and submits a reconciliation profile, the workflow engine routes it to the designated **Approver**. Approvers review the attached evidence and comments before approving. Built-in SoD checks prevent a user from approving their own work.

### 5. Financial Close & Auto-Certification
The **Financial Close Calendar** orchestrates monthly and quarterly close cycles. 
- Profiles that meet zero-variance thresholds are **Auto-Certified**, skipping the manual approval chain completely.
- Certifiers use the Executive Dashboard to monitor close readiness and provide final sign-off to lock the period.

### 6. Governance, Risk & Compliance (GRC)
DRMS tracks a continuous, immutable audit log for every state transition. The Platform includes Risk Scoring, Compliance Policy enforcement, and Evidence Retention modules to guarantee enterprise auditability.

---

## Technical Stack & Architecture
- **Backend Architecture**: API-driven modular monolith with strict Controller-Service-Data segregation.
- **Backend Tech**: FastAPI (Python 3.11), SQLAlchemy 2.0 ORM, Pydantic, MySQL (Production) / SQLite (Local/Demo).
- **Frontend Tech**: React (Vite), Vanilla CSS (Custom Design System), Zustand (Global State), TanStack Query (Data Fetching).
- **Real-Time Engine**: Server-Sent Events (SSE) for zero-latency toast notifications and workflow updates.
- **Authentication**: Stateless JSON Web Tokens (JWT) stored in secure local storage.

---

## Local Development Setup

To run DRMS locally, you will need two terminal windows running simultaneously.

### 1. Backend (FastAPI)
Navigate to the backend directory, activate your virtual environment, and install dependencies:
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate | Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
```
Start the local server (runs on `http://localhost:8000`):
```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (React / Vite)
Navigate to the frontend directory and install the Node packages:
```bash
cd frontend
npm install
```
Start the local development server (runs on `http://localhost:5173`):
```bash
npm run dev
```

*Note: The frontend is configured to proxy all `/api` requests automatically to `localhost:8000` to prevent CORS issues during development.*

## Generating Demo Data
If your database is empty, you can seed it with thousands of generated transactions, dummy users, and pre-configured balances to test the system:
1. Log into the application.
2. Navigate to the **Admin / Command Center**.
3. Click **Reset Demo Data** to initialize the SQLite database with full reporting metrics.
