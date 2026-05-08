import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuditLogs from './pages/AuditLogs'
import ProjectWorkflowPage from './pages/ProjectWorkflowPage'
import PreparerWorkbench from './pages/PreparerWorkbench'
import ReviewerWorkbench from './pages/ReviewerWorkbench'
import Layout from './components/Layout'

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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
