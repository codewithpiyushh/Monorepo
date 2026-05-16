import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuditLogs from './pages/AuditLogs'
import ProjectWorkflowPage from './pages/ProjectWorkflowPage'
import PreparerWorkbench from './pages/PreparerWorkbench'
import ReviewerWorkbench from './pages/ReviewerWorkbench'
import Layout from './components/Layout'
import ReconciliationProfiles from './pages/ReconciliationProfiles'
import Schedules from './pages/Schedules'
import WorkflowPage from './pages/Workflow'
import RuleBuilder from './pages/RuleBuilder'
import EnterpriseReconciliationCenter from './pages/EnterpriseReconciliationCenter'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects/:projectId/:section" element={<ProjectWorkflowPage />} />
          <Route path="projects/:projectId/preparer" element={<PreparerWorkbench />} />
          <Route path="projects/:projectId/reviewer" element={<ReviewerWorkbench />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="reconciliation-profiles" element={<ReconciliationProfiles />} />
          <Route path="close-calendar" element={<Schedules />} />
          <Route path="certification-workflow" element={<WorkflowPage />} />
          <Route path="rule-builder" element={<RuleBuilder />} />
          <Route path="enterprise-center" element={<EnterpriseReconciliationCenter />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
