import { useAuthStore } from '../store/authStore'

// Track user activity for audit purposes
class UserActivityAuditService {
  private activities = []
  private maxActivities = 200

  logAction(action, metadata = {}) {
    const user = useAuthStore.getState().user
    const activity = {
      timestamp: new Date().toISOString(),
      action,
      userId: user?.id,
      username: user?.username,
      userRole: user?.role,
      url: window.location.pathname,
      metadata
    }

    this.activities.push(activity)
    if (this.activities.length > this.maxActivities) {
      this.activities.shift()
    }

    // Persist to localStorage for debugging/audit trails
    this.persistActivity(activity)

    if (process.env.NODE_ENV === 'development') {
      console.log('[UserActivity]', activity)
    }
  }

  logPageView(pageName) {
    this.logAction('PAGE_VIEW', { pageName })
  }

  logFormSubmit(formName, formData = {}) {
    // Don't log sensitive data
    const sanitized = Object.keys(formData).reduce((acc, key) => {
      acc[key] = ['password', 'token', 'secret', 'key'].some(s => key.toLowerCase().includes(s))
        ? '***REDACTED***'
        : formData[key]
      return acc
    }, {})
    
    this.logAction('FORM_SUBMIT', { formName, fieldCount: Object.keys(sanitized).length })
  }

  logException(exceptionId, action, details = {}) {
    this.logAction('EXCEPTION_ACTION', { exceptionId, action, ...details })
  }

  logNavigation(from, to) {
    this.logAction('NAVIGATION', { from, to })
  }

  logDataExport(dataType, format, recordCount = 0) {
    this.logAction('DATA_EXPORT', { dataType, format, recordCount })
  }

  getActivities(limit = 50) {
    return this.activities.slice(-limit)
  }

  clearActivities() {
    this.activities = []
    localStorage.removeItem('drms_user_activities')
  }

  private persistActivity(activity) {
    try {
      const stored = JSON.parse(localStorage.getItem('drms_user_activities') || '[]')
      stored.push(activity)
      if (stored.length > 100) stored.shift()
      localStorage.setItem('drms_user_activities', JSON.stringify(stored))
    } catch (e) {
      console.error('Failed to persist activity log', e)
    }
  }
}

export const userActivityAudit = new UserActivityAuditService()
export default userActivityAudit
