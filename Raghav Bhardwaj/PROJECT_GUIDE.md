**Project Guide**

- **Purpose:**: High-level description of the reconciliation application, roles, and user flows so new contributors can quickly understand and use the project.

**Current Status**
- The active source of truth for the latest repo state is [PROJECT_STATUS.md](./PROJECT_STATUS.md).
- This guide explains the application structure and workflows; the status file explains what is already built and what is still missing.
- Current build status at the time of this update:
  - Backend Python syntax check: passing.
  - Frontend production build: passing.
  - Remaining work: tests, migration rollout, and final QA for the new variance workflow.

**Project Overview**
- **What it is:**: A reconciliation platform that lets teams upload source/target datasets, map fields, define matching rules, run executions to reconcile transactions, manage exceptions, and run certification workflows.
- **Stack:**: Backend: FastAPI + SQLAlchemy (Python). Frontend: React + Vite + TanStack Query. DB: MySQL / SQLite for local development.
- **Where to look:**: Backend source: `backend/app/`. Frontend source: `frontend/src/`.

**Architecture & Key Components**
- **Backend (`backend/app`)**: API endpoints, services, models and migrations. Important folders:
  - `routes/` — REST endpoints (projects, executions, enterprise, auth).
  - `services/` — Core business logic (project creation, execution engine, enrichment, promotion).
  - `models/` — SQLAlchemy models for Projects, Datasets, Profiles, Rules, Executions, AuditLog, etc.
  - `migrations/` — DB migrations (keep these).
- **Frontend (`frontend/src`)**: Pages & components for workbenches and admin console.
  - `pages/PreparerWorkbench.jsx` — Preparer UI (upload, evidence, exceptions).
  - `pages/ReviewerWorkbench.jsx` — Reviewer UI and certification queue.
  - `pages/ExecutionWorkbench.jsx` — Execution UI for running reconciliations.

**Primary Roles & Responsibilities**
- **Admin**: Manage system-level settings, create users, view enterprise profile queue, and run migrations and seeds.
- **Preparer**: Uploads datasets, reviews matches, raises exceptions, attaches evidence, and submits for reviewer via the Preparer Workbench.
- **Reviewer**: Reviews prepared submissions, approves/rejects/returns to preparer, and manages certification actions via the Reviewer Workbench.
- **Approver / Certifier**: Approve final certified results and close the reconciliation according to workflow rules.
- **Executor** (system role): Runs reconciliation executions (matching engine), applies mappings and rules, and generates match groups.

**End-to-End Flows (high level)**
1. **Project Creation & Enrichment**
   - Create a Project via API or UI. The backend `project_service` will auto-seed default datasets/mappings/rules and create a reconciliation profile in many flows.
   - Seeded data includes source/target datasets, mapping definitions, matching rules, and a default certification workflow.
2. **Upload Datasets**
   - Preparer uploads `source` and `target` datasets (CSV) to the Project datasets endpoint/UI.
   - Datasets are stored and parsed into transactions.
3. **Mappings & Rules**
   - Define mappings that link source fields → target fields.
   - Add matching rules (key fields, match fields, tolerances, date windows) using the Rules endpoint or UI.
4. **Run Execution**
   - Trigger a reconciliation execution (via UI or `/api/projects/{id}/executions`). The execution engine runs the matching algorithm and persists match groups.
   - Monitor execution via the Executions endpoint and the Execution Workbench.
5. **Promote Execution → Enterprise Profile**
   - If you want the full preparer/reviewer/certification lifecycle, promote the execution to an enterprise profile (via the execution promote endpoint or UI button).
   - Until promotion, user-facing workbenches operate in `legacy mode` (limited feature set) and show the legacy banner.
6. **Preparer Workflow**
   - Preparer reviews matches, resolves exceptions, attaches evidence, and submits the profile for reviewer.
7. **Reviewer & Certification Workflow**
   - Reviewer inspects submissions, approves/rejects or returns to preparer.
   - Certification workflow advances through PREPARER → REVIEWER → APPROVER → CERTIFIER stages depending on workflow configuration.

**Why you see “legacy mode”**
- The UI detects `legacy mode` when a page is opened for a single `projectId` execution route (e.g., `/preparer/:projectId`). That route is a direct execution view that is not yet promoted. To access the full enterprise workbenches, promote the execution to an enterprise profile.

**Local Setup & Run (quick)**
1. Create Python virtualenv and install backend deps:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
2. Init DB & run migrations (or use the demo bootstrap):
```powershell
python -c "from app.database import init_db; init_db()"
# or run the bootstrap that seeds demo data
python scripts\bootstrap_demo_database.py
```
3. Run backend server:
```powershell
uvicorn app.main:app --reload --port 8000
```
4. Start frontend dev server:
```bash
cd frontend
npm install
npm run dev
```

**Important API Endpoints**
- `POST /api/projects` — create project
- `POST /api/projects/{id}/datasets` — upload dataset (source/target)
- `POST /api/projects/{id}/mappings` — create mappings
- `POST /api/projects/{id}/rules` — add matching rules
- `POST /api/projects/{id}/executions` — start an execution
- `POST /api/projects/{id}/executions/{exec_id}/promote` — promote execution to enterprise profile

**Troubleshooting / Notes**
- If the UI shows the legacy banner, check whether you opened a `projectId` route. Promote the execution or navigate via the enterprise profiles list to access full workbenches.
- Generated artifacts (node_modules, .venv, SQLite demo DBs) are safe to delete if you want a fresh start; they can be recreated with `npm install` and virtualenv + requirements.
- Use `backend/scripts/bootstrap_demo_database.py` to seed a full demo flow quickly (users, profiles, workflows).

**Next steps you can ask me to do**
- Add role-by-role sample screenshots and a short checklist for each role.
- Generate a shorter `README.md` with one-click dev commands.
- Remove any remaining demo artifacts or create a fresh starter repo branch.

---
Generated by the project assistant. If you want this written into `README.md` instead, tell me and I will move it.
 
**Role Checklists (quick actions per role)**

- **Admin**
   1. Create or manage users via the Admin Center (or `POST /api/users`).
   2. Seed demo data using `backend/scripts/bootstrap_demo_database.py` if starting fresh.
   3. Monitor enterprise profile queue and assign owners.
   4. Review system logs and run migrations from `backend/migrations/`.

- **Preparer**
   1. Create or select a Project (UI or `POST /api/projects`).
   2. Upload `source` and `target` datasets via the Preparer Workbench or `POST /api/projects/{id}/datasets`.
   3. Open the Preparer Workbench (if not legacy) and resolve match groups, add evidence, and submit.

- **Reviewer**
   1. Access the Review Queue (Enterprise profiles) — do not open the legacy `projectId` execution route.
   2. Review prepared submissions and use the certification actions to Approve/Reject/Escalate.
   3. Use reviewer dashboard metrics to prioritize high-risk profiles.

- **Approver / Certifier**
   1. Inspect the certification workflow assigned to a profile.
   2. Approve or request additional evidence as necessary.
   3. Close the profile once certification criteria are met.

- **Executor**
   1. Trigger executions (`POST /api/projects/{id}/executions`).
   2. Monitor execution progress and logs, then promote completed runs when ready.

**Sample API Calls**
Below are common API examples. Replace `BASE_URL` with `http://localhost:8000` for local dev and supply an `Authorization: Bearer <token>` header where required.

- Create a project
```bash
curl -X POST "${BASE_URL}/api/projects" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"name":"My Project","description":"Demo"}'
```

- Upload a CSV dataset (source or target)
```bash
curl -X POST "${BASE_URL}/api/projects/{project_id}/datasets" \
   -H "Authorization: Bearer $TOKEN" \
   -F "dataset_type=source" \
   -F "file=@/path/to/source.csv;type=text/csv"
```

- Create mappings
```bash
curl -X POST "${BASE_URL}/api/projects/{project_id}/mappings" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"mappings": [{"source_field":"account","target_field":"account"}]}'
```

- Add a matching rule
```bash
curl -X POST "${BASE_URL}/api/projects/{project_id}/rules" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"name":"Default rule","key_fields":["account"],"match_fields":["reference","amount"]}'
```

- Start an execution
```bash
curl -X POST "${BASE_URL}/api/projects/{project_id}/executions" \
   -H "Authorization: Bearer $TOKEN"
```

- Promote execution to enterprise profile
```bash
curl -X POST "${BASE_URL}/api/projects/{project_id}/executions/{exec_id}/promote" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{}' 
```

---
If you want, I can now generate `README.md` (condensed quickstart) and add role-specific screenshots placeholders. Let me know which option you prefer.

**Access Denied — Approver / Certifier / Auditor**

If you (or users) see a `403 Access Denied` page when trying to perform actions as an **Approver**, **Certifier**, or **Auditor**, check the following common causes and resolutions:

- 1) Role assignment: Ensure the user account has the correct role in the system. Check the `users` table or use the Admin Center to confirm the `role` field includes `approver`, `certifier`, or `auditor` as appropriate.

   - How to check (API):
      - `GET /api/users` — list users and verify the `role` value for the user account.

- 2) Profile-level assignment: Even with the correct role, a user must be assigned to the enterprise profile to act on it. Verify the reconciliation profile has `assigned_approver`, `assigned_certifier`, or `assigned_certifier` fields set to the user's id.

   - How to check (DB): inspect the `reconciliation_profiles` row for the profile and ensure the assigned fields reference the correct user id.

- 3) Workflow stage & lifecycle: The certification workflow must be at a stage that permits the role's action. If a workflow is not in the expected stage (PREPARED → UNDER_REVIEW → APPROVER → CERTIFIER), actions by later roles will be blocked.

   - How to check (API):
      - `GET /api/enterprise/certification/{profile_id}` or the `cert-workflows-all` endpoint to inspect status and current stage.

- 4) Legacy mode vs Enterprise profile: If you are viewing a legacy `projectId` execution route (UI shows "legacy mode" banner), many enterprise actions (certification and approver/certifier flows) are disabled. Promote the execution to an enterprise profile to enable full functionality.

- 5) Permissions middleware and RBAC configuration: The backend enforces role checks in routes. If a custom change was made to middleware, double-check `app/services/auth_service.py` and route decorators that authorize actions.

Quick remediation checklist:

- Verify user role: `GET /api/users` → confirm `role`.
- Verify profile assignment: query `reconciliation_profiles` → `assigned_approver` / `assigned_certifier` values.
- Check workflow status: `GET /api/projects/{id}/executions/{exec_id}/status` or certification endpoints.
- If on a legacy execution route, promote the execution: `POST /api/projects/{id}/executions/{exec_id}/promote`.

If you want, I can run quick read-only checks in your local dev environment (list users, show profile rows) if you grant me permission to run the commands here.

**Role-specific Screenshots — placeholders & capture instructions**

I added placeholders below that you can replace with real images. Suggested filenames and capture steps are included so any new user can reproduce them exactly.

- `screenshots/preparer_workbench.png` — Preparer Workbench (home view)
   - What to capture: Top of Preparer Workbench showing PageHeader and active profile selection.
   - How to capture: Open the Preparer Workbench in the browser, sign in as `preparer`, navigate to the active profile, press `PrtScn` or use OS snipping tool. Save as `preparer_workbench.png` at `frontend/public/screenshots/`.

- `screenshots/reviewer_workbench.png` — Reviewer Workbench (certificate queue)
   - What to capture: Reviewer queue with certification list and a highlighted submission.
   - How to capture: Sign in as `reviewer`, open Review Queue, expand a certification item, capture, and save as `reviewer_workbench.png`.

- `screenshots/execution_workbench.png` — Execution Workbench (running execution)
   - What to capture: Execution progress bar / execution results summary.
   - How to capture: Start an execution as an executor/admin, open Execution Workbench, capture the progress/results, and save as `execution_workbench.png`.

- `screenshots/approver_action.png` — Approver action modal (approve/return)
   - What to capture: Approval modal or action buttons available to `approver`.
   - How to capture: Log in as an `approver` assigned to a profile, navigate to the certification item in reviewer queue, open the approval modal, capture, and save as `approver_action.png`.

- `screenshots/certifier_action.png` — Certifier action view
   - What to capture: Certifier approval buttons and final sign-off UI.
   - How to capture: Log in as `certifier`, open the certification item at the certifier stage, capture, and save as `certifier_action.png`.

- `screenshots/auditor_view.png` — Auditor read-only view
   - What to capture: Auditor's dashboard showing audit trails or logs (if available).
   - How to capture: Log in as `auditor`, open the enterprise audit view or profile history, capture the timeline, and save as `auditor_view.png`.

Recommended capture settings

- Resolution: 1365x768 or larger for consistent layout.
- Format: PNG, max quality.
- Filenames: use the exact names above and place under `frontend/public/screenshots/`.

Adding placeholders

If you want, I will create the `frontend/public/screenshots/` folder and add placeholder files and a brief caption in `PROJECT_GUIDE.md` that references them. Tell me to proceed and I will add the folder and placeholder images (transparent PNGs) and update the guide to point to them.

