import api from './client'

/**
 * bulkAPI.js — Phase 3 Bulk Operations
 * All /api/v1/bulk/* endpoints.
 */
export const bulkAPI = {
  /** Paginated + filtered profile list */
  listProfiles: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    ).toString()
    return api.get(`/v1/bulk/profiles${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Overall summary counts */
  summary: () => api.get('/v1/bulk/summary').then(r => r.data),

  /** User list for assign dropdowns */
  users: () => api.get('/v1/bulk/users').then(r => r.data),

  /** Bulk profile action: APPROVE | CERTIFY | RETURN | CLOSE | REOPEN | ASSIGN */
  profileAction: (data) => api.post('/v1/bulk/profiles/action', data).then(r => r.data),

  /** Bulk exception resolve with root cause */
  resolveExceptions: (data) => api.post('/v1/bulk/exceptions/resolve', data).then(r => r.data),

  /** Bulk exception assign */
  assignExceptions: (data) => api.post('/v1/bulk/exceptions/assign', data).then(r => r.data),

  /** Export selected profiles as xlsx or csv (returns a URL to trigger download) */
  exportProfiles: async (profileIds, format = 'xlsx') => {
    const resp = await api.post('/v1/bulk/profiles/export',
      { profile_ids: profileIds, format },
      { responseType: 'blob' }
    )
    const ext  = format === 'csv' ? 'csv' : 'xlsx'
    const mime = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const url  = URL.createObjectURL(new Blob([resp.data], { type: mime }))
    const a    = document.createElement('a')
    a.href = url
    a.download = `profiles_${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  },
}
