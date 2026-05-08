-- Oracle-style workflow performance migration
-- Date: 2026-05-07
-- Safe to run multiple times (uses IF NOT EXISTS where supported by MySQL 8+)

CREATE INDEX IF NOT EXISTS idx_workflows_reconciliation_id ON workflows (reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows (status);
CREATE INDEX IF NOT EXISTS idx_workflows_assigned_to_status ON workflows (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows (updated_at);

CREATE INDEX IF NOT EXISTS idx_workflow_history_workflow_created ON workflow_history (workflow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_history_actor_created ON workflow_history (actor_id, created_at);

CREATE INDEX IF NOT EXISTS idx_results_execution_status ON results (execution_id, match_status);
CREATE INDEX IF NOT EXISTS idx_executions_project_status ON executions (project_id, status);
