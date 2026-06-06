import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { normalizeRole } from './utils/roles'
import Layout from './components/Layout'

const Login = lazy(() => import('./pages/Login'))
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'))
const CommandCenter = lazy(() => import('./pages/CommandCenter'))
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'))
const ExceptionOpsPage = lazy(() => import('./pages/ExceptionOpsPage'))
const ExceptionWorkbench = lazy(() => import('./pages/ExceptionWorkbench'))
const ExceptionInvestigation = lazy(() => import('./pages/ExceptionInvestigation'))
const CloseCertificationPage = lazy(() => import('./pages/CloseCertificationPage'))
const ControlsGovernancePage = lazy(() => import('./pages/ControlsGovernancePage'))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const ProjectWorkflowPage = lazy(() => import('./pages/ProjectWorkflowPage'))
const PreparerWorkbench = lazy(() => import('./pages/PreparerWorkbench'))
const ReviewerWorkbench = lazy(() => import('./pages/ReviewerWorkbench'))
const Schedules = lazy(() => import('./pages/Schedules'))
const WorkflowPage = lazy(() => import('./pages/Workflow'))
const RuleBuilder = lazy(() => import('./pages/RuleBuilder'))
const EnterpriseOps = lazy(() => import('./pages/EnterpriseOps'))
const EnterpriseReconciliationCenter = lazy(() => import('./pages/EnterpriseReconciliationCenter'))
const WorkQueue = lazy(() => import('./pages/WorkQueue'))
const ReconciliationsHub = lazy(() => import('./pages/ReconciliationsHub'))
const AdminCenter = lazy(() => import('./pages/AdminCenter'))
const ReconciliationAnalyticsExplorer = lazy(() => import('./pages/ReconciliationAnalyticsExplorer'))
const RiskDashboard = lazy(() => import('./pages/RiskDashboard'))
const ReconciliationProfiles = lazy(() => import('./pages/ReconciliationProfiles'))
const MyPerformance = lazy(() => import('./pages/MyPerformance'))
const TransactionMatchingWorkspace = lazy(() => import('./pages/TransactionMatchingWorkspace'))

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function DefaultPageRedirect() {
  const user = useAuthStore((s) => s.user)
  const role = normalizeRole(user?.role)

  if (role === 'preparer') {
    return <Navigate to="/my-reconciliations" replace />
  }
  if (role === 'reviewer') {
    return <Navigate to="/work-queue" replace />
  }
  return <Navigate to="/command-center" replace />
}

export default function App() {
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
            <Route path="command-center" element={<CommandCenter />} />
            <Route path="executive-dashboard" element={<ExecutiveDashboard />} />
            <Route path="exception-ops" element={<ExceptionOpsPage />} />
            <Route path="exception-workbench" element={<ExceptionWorkbench />} />
            <Route path="exception-investigation" element={<ExceptionInvestigation />} />
            <Route path="exception-investigation/:exceptionId" element={<ExceptionInvestigation />} />
            <Route path="analytics-explorer" element={<ReconciliationAnalyticsExplorer />} />
            <Route path="analytics-explorer/:entity" element={<ReconciliationAnalyticsExplorer />} />
            <Route path="analytics-explorer/:entity/:account" element={<ReconciliationAnalyticsExplorer />} />
            <Route path="reconciliation-profiles" element={<ReconciliationProfiles />} />
            <Route path="risk-dashboard" element={<RiskDashboard />} />
            <Route path="risk-dashboard/:entity" element={<RiskDashboard />} />
            <Route path="risk-dashboard/:entity/:account" element={<RiskDashboard />} />
            <Route path="close-certification" element={<CloseCertificationPage />} />
            <Route path="controls-governance" element={<ControlsGovernancePage />} />
            <Route path="platform-admin" element={<PlatformAdminPage />} />
            <Route path="work-queue" element={<WorkQueue />} />
            <Route path="my-reconciliations" element={<PreparerWorkbench />} />
            <Route path="workspaces" element={<Navigate to="/work-queue" replace />} />
            <Route path="preparer-worklist" element={<Navigate to="/my-reconciliations" replace />} />
            <Route path="review-queue" element={<Navigate to="/work-queue" replace />} />
            <Route path="my-performance" element={<MyPerformance />} />
            <Route path="reconciliations" element={<ReconciliationsHub />} />
            <Route path="enterprise-ops" element={<EnterpriseOps />} />
            <Route path="admin" element={<AdminCenter />} />
            <Route path="projects/:projectId/:section" element={<ProjectWorkflowPage />} />
            <Route path="projects/:projectId/preparer" element={<PreparerWorkbench />} />
            <Route path="projects/:projectId/reviewer" element={<ReviewerWorkbench />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="close-calendar" element={<Schedules />} />
            <Route path="certification-workflow" element={<WorkflowPage />} />
            <Route path="rule-builder" element={<RuleBuilder />} />
            <Route path="enterprise-center" element={<EnterpriseReconciliationCenter />} />
            <Route path="dashboard" element={<Navigate to="/command-center" replace />} />
            <Route path="governance-controls" element={<Navigate to="/controls-governance" replace />} />
            <Route path="transaction-matching-workspace" element={<TransactionMatchingWorkspace />} />
            <Route path="transaction-matching" element={<TransactionMatchingWorkspace />} />
            <Route path="balance-reconciliations-workspace" element={<Navigate to="/enterprise-ops" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
