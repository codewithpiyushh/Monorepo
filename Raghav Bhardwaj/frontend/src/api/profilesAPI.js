/**
 * Standalone profilesAPI module.
 * Import directly: import { profilesAPI } from '../api/profilesAPI'
 *
 * Uses the shared axios instance from api/client.js.
 * Also exported from api/index.js for convenience.
 */
import api from './client'

export const profilesAPI = {
  // List with all filter/sort/pagination params
  list: ({ page = 1, pageSize = 20, search = '', riskLevel = [], status = [], sortBy = 'created_at', sortDir = 'desc' } = {}) => {
    const params = new URLSearchParams({ page, page_size: pageSize, sort_by: sortBy, sort_dir: sortDir })
    if (search)            params.set('search', search)
    riskLevel.forEach(r => params.append('risk_level', r))
    status.forEach(s =>    params.append('status', s))
    return api.get(`/v1/profiles?${params}`).then(r => r.data)
  },

  get:    (id)          => api.get(`/v1/profiles/${id}`).then(r => r.data),
  create: (payload)     => api.post('/v1/profiles', payload).then(r => r.data),
  update: (id, payload) => api.patch(`/v1/profiles/${id}`, payload).then(r => r.data),
  delete: (id, hard = false) => api.delete(`/v1/profiles/${id}?hard=${hard}`).then(r => r.data),
}
