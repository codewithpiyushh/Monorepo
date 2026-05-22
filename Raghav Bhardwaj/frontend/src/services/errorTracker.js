import { useAuthStore } from '../store/authStore'

// Track API errors to help identify issues in production
class ErrorTrackerService {
  constructor() {
    this.errors = []
    this.maxErrors = 100
  }

  logError(error, context = {}) {
    const user = useAuthStore.getState().user
    const errorLog = {
      timestamp: new Date().toISOString(),
      message: error?.message || String(error),
      stack: error?.stack,
      context,
      userId: user?.id,
      url: window.location.href,
      userAgent: navigator.userAgent
    }

    this.errors.push(errorLog)
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorTracker]', errorLog)
    }

    // Send to backend (implement logging endpoint as needed)
    this.sendToBackend(errorLog)
  }

  logAPIError(endpoint, method, status, error, context = {}) {
    this.logError(error, {
      type: 'API_ERROR',
      endpoint,
      method,
      status,
      ...context
    })
  }

  getErrors() {
    return [...this.errors]
  }

  clearErrors() {
    this.errors = []
  }

  sendToBackend(errorLog) {
    // This would call a backend endpoint to persist errors
    // For now, errors are stored in localStorage for debugging
    try {
      const stored = JSON.parse(localStorage.getItem('drms_errors') || '[]')
      stored.push(errorLog)
      if (stored.length > 50) stored.shift()
      localStorage.setItem('drms_errors', JSON.stringify(stored))
    } catch (e) {
      console.error('Failed to persist error log', e)
    }
  }
}

export const errorTracker = new ErrorTrackerService()
export default errorTracker
