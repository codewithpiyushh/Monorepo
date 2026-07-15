import api from './client'

/**
 * matchingAPI.js — Phase 3 Full Transaction Matching
 * All /api/v1/matching/* endpoints.
 */
export const matchingAPI = {
  // ── Profile data ──────────────────────────────────────────────────────────
  /** All raw records split into source/target sides */
  profileRecords: (profileId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/v1/matching/profile/${profileId}/records${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Match groups with full record detail */
  profileGroups: (profileId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/v1/matching/profile/${profileId}/groups${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Single group full detail */
  groupDetail: (groupId) =>
    api.get(`/v1/matching/group/${groupId}`).then(r => r.data),

  /** Match summary statistics */
  summary: (profileId) =>
    api.get(`/v1/matching/profile/${profileId}/summary`).then(r => r.data),

  /** Audit trail of confirm/reject actions */
  auditTrail: (profileId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/v1/matching/profile/${profileId}/audit${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Unmatched records available for manual pairing */
  unmatchedRecords: (profileId) =>
    api.get(`/v1/matching/profile/${profileId}/unmatched-records`).then(r => r.data),

  /** Promote the project to a Balance Reconciliation record */
  promoteToBalance: (profileId) =>
    api.post(`/v1/matching/profile/${profileId}/promote-to-balance`).then(r => r.data),

  // ── Matching actions ───────────────────────────────────────────────────────
  /** Create a manual match from selected source + target IDs */
  createManualMatch: (data) =>
    api.post('/v1/matching/manual', data).then(r => r.data),

  /** Confirm / approve a match group */
  confirmMatch: (groupId) =>
    api.post(`/v1/matching/group/${groupId}/confirm`).then(r => r.data),

  /** Reject / break a match group */
  rejectMatch: (groupId, reason = '') =>
    api.post(`/v1/matching/group/${groupId}/reject`, { reason }).then(r => r.data),

  /** Add/update notes on a match group */
  updateNotes: (groupId, notes) =>
    api.post(`/v1/matching/group/${groupId}/notes`, { notes }).then(r => r.data),

  /** Assign exception to a user */
  assignException: (groupId, userId) =>
    api.post(`/v1/matching/group/${groupId}/assign`, { user_id: userId }).then(r => r.data),

  /** Bulk confirm multiple groups */
  bulkConfirm: (groupIds) =>
    api.post('/v1/matching/bulk-confirm', { group_ids: groupIds }).then(r => r.data),

  // ── Legacy / advanced endpoints (keep compat) ──────────────────────────────
  /** Run the 4-phase advanced engine */
  runAdvanced: (data) =>
    api.post('/enterprise/matching/run-advanced', data).then(r => r.data),

  /** Run legacy matching */
  runLegacy: (data) =>
    api.post('/enterprise/matching/run', data).then(r => r.data),

  /** Get AI suggestions (advanced) */
  suggestions: (profileId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/matching/suggestions-advanced/${profileId}${qs ? `?${qs}` : ''}`).then(r => r.data)
  },
}
