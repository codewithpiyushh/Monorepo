import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

export default function ProtectedRoute({ 
  children, 
  requiredRoles = [],
  fallback = <Navigate to="/unauthorized" replace />
}) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  // Not logged in
  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  // Check role-based access if requiredRoles specified
  if (requiredRoles.length > 0) {
    const userRole = normalizeRole(user.role)
    const allowed = requiredRoles.some(r => normalizeRole(r) === userRole)
    
    if (!allowed) {
      return fallback
    }
  }

  return children
}
