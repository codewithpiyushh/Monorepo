import api from './client'

/**
 * notificationsAPI.js — Phase 3 Chunk 5
 * REST helpers for the new /api/v1/notifications/* endpoints.
 * SSE is handled separately in notificationStore.js via EventSource.
 */
export const notificationsAPI = {
  /** Paginated notification list */
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/v1/notifications${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Unread badge count */
  unreadCount: () => api.get('/v1/notifications/unread-count').then(r => r.data),

  /** Mark one notification as read */
  markRead: (id) => api.post(`/v1/notifications/${id}/read`).then(r => r.data),

  /** Mark all as read */
  markAllRead: () => api.post('/v1/notifications/read-all').then(r => r.data),

  /** Dismiss (delete) one notification */
  dismiss: (id) => api.delete(`/v1/notifications/${id}`).then(r => r.data),

  /**
   * Build the SSE stream URL.
   * Token is passed as a query param because the browser EventSource API
   * does not support custom Authorization headers.
   */
  streamUrl: () => {
    const token = localStorage.getItem('drms_token') || ''
    const base  = (api.defaults.baseURL || '/api').replace(/\/$/, '')
    return `${base}/v1/notifications/stream?token=${encodeURIComponent(token)}`
  },
}
