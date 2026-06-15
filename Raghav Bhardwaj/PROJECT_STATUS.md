# Project Status

Last updated: 2026-06-14

## What This Project Is

DRMS is a reconciliation platform with:
- FastAPI backend and SQLAlchemy models
- React + Vite frontend
- RBAC roles for `admin`, `preparer`, `reviewer`, `approver`, `certifier`, and `auditor`
- Project execution, enterprise profile, balance reconciliation, supporting items, and analytics flows

## Current State

The repo currently contains both the original project/execution flow and the newer balance-variance workflow.

### Implemented Areas
- Project creation, datasets, mappings, rules, and executions
- Enterprise profiles, lifecycle routing, and supporting items
- Balance reconciliation workspace
- Variance engine with:
  - raw variance
  - explained variance
  - unexplained variance
  - flux tracking
  - narrative gating for material/critical items
- Variance analytics dashboard in the frontend
- Balance narrative block in the preparer UI

### Current Repo Notes
- The working tree has many untracked source files under `backend/app/` and `frontend/src/`.
- That means the code exists locally, but some of it still needs to be reviewed, committed, or intentionally ignored.
- The frontend build now passes locally.
- Backend Python syntax check now passes locally.

## What Is Missing

These are the main gaps I would still treat as open:

1. Test coverage
   - No dedicated automated tests were added for the new variance service, route, and UI flow.
   - The submission-blocking behavior should be covered with backend tests.

2. End-to-end QA
   - The new variance analytics route should be clicked through in the browser.
   - The balance narrative block should be validated on `MATERIAL_VARIANCE` and `CRITICAL_VARIANCE` records.

3. Migration execution
   - The new Alembic migration file exists, but the database still needs the actual migration run in your environment.
   - If you are using SQLite dev mode, verify the compatibility patch path too.

4. Data validation
   - Existing balances may need a refresh so `variance_severity_classification`, `explained_variance`, `flux_amount`, and snapshot rows are populated.
   - Any demo or seed data should be checked to make sure it produces material and critical cases.

5. Documentation cleanup
   - The older quickstart and guide text still contains some legacy wording.
   - Screenshots, user walkthroughs, and API examples can still be tightened up.

## Where To Look First

- Backend entrypoint: `backend/app/main.py`
- Balance workflow: `backend/app/services/balance_service.py`
- Variance engine: `backend/app/services/variance_service.py`
- Variance routes: `backend/app/routes/variance.py`
- Frontend route wiring: `frontend/src/App.jsx`
- Layout navigation: `frontend/src/components/Layout.jsx`
- Preparer narrative block: `frontend/src/components/balance/RootCauseNarrativeBlock.jsx`
- Variance dashboard: `frontend/src/pages/VarianceAnalyticsDashboard.jsx`

## Recommended Next Steps

1. Run the new migration against your local database.
2. Add tests for the variance submission gate and explanation endpoints.
3. Review the untracked source files and decide which should be committed.
4. Update any screenshots or user docs that still reference the older state.

