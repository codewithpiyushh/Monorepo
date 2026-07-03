import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useNotificationStore } from './store/notificationStore'
import { normalizeRole } from './utils/roles'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

const Login                         = lazy(() => import('./pages/Login'))
const UnauthorizedPage              = lazy(() => import('./pages/UnauthorizedPage'))
const CommandCenter                 = lazy(() => import('./pages/CommandCenter'))
const ExecutiveDashboard            = lazy(() => import('./pages/ExecutiveDashboard'))
const ExceptionOpsPage              = lazy(() => import('./pages/ExceptionOpsPage'))
const ExceptionWorkbench            = lazy(() => import('./pages/ExceptionWorkbench'))
const ExceptionInvestigation        = lazy(() => import('./pages/ExceptionInvestigation'))
const CloseCertificationPage        = lazy(() => import('./pages/CloseCertificationPage'))
const ControlsGovernancePage        = lazy(() => import('./pages/ControlsGovernancePage'))
const PlatformAdminPage             = lazy(() => import('./pages/PlatformAdminPage'))
const AuditLogs                     = lazy(() => import('./pages/AuditLogs'))
const ProjectWorkflowPage           = lazy(() => import('./pages/ProjectWorkflowPage'))
const PreparerWorkbench             = lazy(() => import('./pages/PreparerWorkbench'))
const ReviewerWorkbench             = lazy(() => import('./pages/ReviewerWorkbench'))
const ApproverWorkbench             = lazy(() => import('./pages/ApproverWorkbench'))
const ApproverDashboard             = lazy(() => import('./pages/ApproverDashboard'))
const Schedules                     = lazy(() => import('./pages/Schedules'))
const WorkflowPage                  = lazy(() => import('./pages/Workflow'))
const RuleBuilder                   = lazy(() => import('./pages/RuleBuilder'))
const EnterpriseOps                 = lazy(() => import('./pages/EnterpriseOps'))
const EnterpriseReconciliationCenter = lazy(() => import('./pages/EnterpriseReconciliationCenter'))
const WorkQueue                     = lazy(() => import('./pages/WorkQueue'))
const ReconciliationsHub            = lazy(() => import('./pages/ReconciliationsHub'))
const AdminCenter                   = lazy(() => import('./pages/AdminCenter'))
const ReconciliationAnalyticsExplorer = lazy(() => import('./pages/ReconciliationAnalyticsExplorer'))
const RiskDashboard                 = lazy(() => import('./pages/RiskDashboard'))
const ReconciliationProfiles        = lazy(() => import('./pages/ReconciliationProfilesPage'))
const MyPerformance                 = lazy(() => import('./pages/MyPerformance'))
const TransactionMatchingWorkspace  = lazy(() => import('./pages/TransactionMatchingWorkspace'))
const BalanceReconciliationPage     = lazy(() => import('./pages/BalanceReconciliationPage'))
const AgingDashboard                = lazy(() => import('./pages/AgingDashboard'))
const VarianceAnalyticsDashboard     = lazy(() => import('./pages/VarianceAnalyticsDashboard'))
const FinancialCloseCalendarPage     = lazy(() => import('./pages/FinancialCloseCalendarPage'))
const SLAMonitorDashboard            = lazy(() => import('./pages/SLAMonitorDashboard'))
const EscalationWorkbench            = lazy(() => import('./pages/EscalationWorkbench'))
const FXManagementPage               = lazy(() => import('./pages/FXManagementPage'))
const BulkOperationsCenter = lazy(() => import('./pages/BulkOperationsCenter'))
const ApprovalChainsPage = lazy(() => import('./pages/ApprovalChainsPage'))
const RiskConfigurationPage = lazy(() => import('./pages/RiskConfigurationPage'))
const CompliancePolicyPage = lazy(() => import('./pages/CompliancePolicyPage'))
const EvidenceRetentionPage = lazy(() => import('./pages/EvidenceRetentionPage'))
const PreparerCloseManagement = lazy(() => import('./pages/PreparerCloseManagement'))
const ApproverCloseSignoffs = lazy(() => import('./pages/ApproverCloseSignoffs'))
const CloseReadinessPage = lazy(() => import('./pages/CloseReadinessPage'))
const DataIngestionCenter            = lazy(() => import('./pages/DataIngestionCenter'))
const AutoCertSettings               = lazy(() => import('./pages/AutoCertSettings'))

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

/**
 * DefaultPageRedirect — each role lands on the page that is the start
 * of their workflow. The APPROVER role now handles both review and approval,
 * so approvers start from /work-queue.
 */
function DefaultPageRedirect() {
  const user = useAuthStore((s) => s.user)
  const role = normalizeRole(user?.role)

  // Preparer → their reconciliation worklist
  if (role === 'preparer')  return <Navigate to="/my-reconciliations" replace />

  // Approver → their dedicated approval dashboard
  if (role === 'approver')  return <Navigate to="/approver-dashboard" replace />

  // Certifier → executive dashboard (their daily KPI landing page)
  if (role === 'certifier') return <Navigate to="/executive-dashboard" replace />

  // Admin → command centre
  return <Navigate to="/command-center" replace />
}

export default function App() {
  // ── SSE auto-connect / disconnect on login/logout ─────────────────────────
  const token = useAuthStore(s => s.token)
  const { connect, disconnect } = useNotificationStore()

  useEffect(() => {
    if (token) {
      connect()
    } else {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center text-sm text-slate-400">Loading...</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<DefaultPageRedirect />} />

            {/* ── Shared / admin ── */}
            <Route path="command-center"           element={<CommandCenter />} />
            <Route path="executive-dashboard"      element={<ExecutiveDashboard />} />
            <Route path="exception-ops"            element={<ExceptionOpsPage />} />
            <Route path="exception-workbench"      element={<ExceptionWorkbench />} />
            <Route path="exception-investigation"  element={<ExceptionInvestigation />} />
            <Route path="exception-investigation/:exceptionId" element={<ExceptionInvestigation />} />
            <Route path="analytics-explorer"       element={<ReconciliationAnalyticsExplorer />} />
            <Route path="analytics-explorer/:entity" element={<ReconciliationAnalyticsExplorer />} />
            <Route path="analytics-explorer/:entity/:account" element={<ReconciliationAnalyticsExplorer />} />
            <Route path="reconciliation-profiles"  element={<ReconciliationProfiles />} />
            <Route path="risk-dashboard"           element={<RiskDashboard />} />
            <Route path="risk-dashboard/:entity"   element={<RiskDashboard />} />
            <Route path="risk-dashboard/:entity/:account" element={<RiskDashboard />} />
            <Route path="close-certification"      element={<CloseCertificationPage />} />
            <Route path="controls-governance"      element={<ControlsGovernancePage />} />
            {/* ── Certifier (all routes are in shared section above) ── */}
            {/* /executive-dashboard, /risk-dashboard, /exception-workbench, */}
            {/* /aging-dashboard, /variance-analytics, /close-calendar,      */}
            {/* /audit, /controls-governance are all available above.        */}
            <Route path="platform-admin"           element={<PlatformAdminPage />} />
            <Route path="reconciliations"          element={<ReconciliationsHub />} />
            <Route path="enterprise-ops"           element={<EnterpriseOps />} />
            <Route path="enterprise-center"        element={<EnterpriseReconciliationCenter />} />
            <Route path="admin"                    element={<AdminCenter />} />
            <Route path="audit"                    element={<AuditLogs />} />
            <Route path="close-calendar"           element={<Schedules />} />
            <Route path="financial-close-calendar" element={<FinancialCloseCalendarPage />} />
            <Route path="certification-workflow"   element={<WorkflowPage />} />
            <Route path="rule-builder"             element={<RuleBuilder />} />

            {/* ── Preparer ── */}
            <Route path="my-reconciliations"       element={<PreparerWorkbench />} />
            <Route path="my-performance"           element={<MyPerformance />} />
            <Route path="preparer-worklist"        element={<Navigate to="/my-reconciliations" replace />} />

            {/* ── Reviewer ── */}
            <Route path="work-queue"               element={<WorkQueue />} />
            <Route path="workspaces"               element={<Navigate to="/work-queue" replace />} />
            <Route path="review-queue"             element={<Navigate to="/work-queue" replace />} />

            {/* ── Approver ── */}
            <Route path="approver-dashboard"      element={<ApproverDashboard />} />
            <Route path="approver-queue"           element={<ApproverWorkbench />} />

            {/* ── Project-scoped workflow ── */}
            <Route path="projects/:projectId/:section"   element={<ProjectWorkflowPage />} />
            <Route path="projects/:projectId/preparer"   element={<PreparerWorkbench />} />
            <Route path="projects/:projectId/reviewer"   element={<ReviewerWorkbench />} />
            <Route path="projects/:projectId/approver"   element={<ApproverWorkbench />} />

            {/* ── Transaction matching ── */}
            <Route path="transaction-matching-workspace" element={<TransactionMatchingWorkspace />} />
            <Route path="transaction-matching"           element={<TransactionMatchingWorkspace />} />

            {/* ── SLA Monitoring & Escalation (Phase 2 Chunk 4) ── */}
            <Route path="sla-monitor"             element={<SLAMonitorDashboard />} />
            <Route path="escalation-workbench"    element={<EscalationWorkbench />} />

            {/* ── FX Management (Phase 3 Chunk 5) ── */}
            <Route path="fx-management"           element={<FXManagementPage />} />

            {/* ── Bulk Operations (Phase 3) ── */}
            <Route path="bulk-operations"         element={<BulkOperationsCenter />} />
            <Route path="approval-chains"         element={<ApprovalChainsPage />} />
            <Route path="risk-configuration"      element={<RiskConfigurationPage />} />
            <Route path="compliance-policy"       element={<CompliancePolicyPage />} />
            <Route path="evidence-retention"      element={<EvidenceRetentionPage />} />
            <Route path="preparer-close-management" element={<PreparerCloseManagement />} />
            <Route path="approver-close-signoffs" element={<ApproverCloseSignoffs />} />
            <Route path="close-readiness"         element={<CloseReadinessPage />} />
            <Route path="auto-cert"               element={<AutoCertSettings />} />
            <Route path="ingestion"               element={<DataIngestionCenter />} />

            {/* ── Balance Reconciliation ── */}
            <Route path="balance-reconciliation"           element={<BalanceReconciliationPage />} />
            <Route path="balance-reconciliation/:balanceId" element={<BalanceReconciliationPage />} />
            <Route path="aging-dashboard"                  element={<AgingDashboard />} />
            <Route path="variance-analytics" element={<VarianceAnalyticsDashboard />} />

            {/* ── Legacy aliases ── */}
            <Route path="dashboard"                      element={<Navigate to="/command-center" replace />} />
            <Route path="governance-controls"            element={<Navigate to="/controls-governance" replace />} />
            <Route path="balance-reconciliations-workspace" element={<Navigate to="/balance-reconciliation" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
