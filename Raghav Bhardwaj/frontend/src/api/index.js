import api from './client'

export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }).then((r) => r.data),
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  listUsers: () => api.get('/auth/users').then((r) => r.data),
}

export const projectsAPI = {
  list: () => api.get('/projects').then((r) => r.data),
  get: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data) => api.post('/projects', data).then((r) => r.data),
  update: (id, data) => api.patch(`/projects/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/projects/${id}`),
}

export const datasetsAPI = {
  list: (projectId) =>
    api.get(`/projects/${projectId}/datasets`).then((r) => r.data),
  upload: (projectId, datasetType, file) => {
    const form = new FormData()
    form.append('dataset_type', datasetType)
    form.append('file', file)
    return api
      .post(`/projects/${projectId}/datasets`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
  preview: (projectId, datasetId, limit = 20) =>
    api
      .get(`/projects/${projectId}/datasets/${datasetId}/preview?limit=${limit}`)
      .then((r) => r.data),
}

export const mappingsAPI = {
  list: (projectId) =>
    api.get(`/projects/${projectId}/mappings`).then((r) => r.data),
  autoSuggest: (projectId) =>
    api.get(`/projects/${projectId}/mappings/auto-suggest`).then((r) => r.data),
  save: (projectId, mappings) =>
    api.post(`/projects/${projectId}/mappings`, { mappings }).then((r) => r.data),
}

export const rulesAPI = {
  list: (projectId) =>
    api.get(`/projects/${projectId}/rules`).then((r) => r.data),
  create: (projectId, data) =>
    api.post(`/projects/${projectId}/rules`, data).then((r) => r.data),
  update: (projectId, ruleId, data) =>
    api.patch(`/projects/${projectId}/rules/${ruleId}`, data).then((r) => r.data),
  delete: (projectId, ruleId) =>
    api.delete(`/projects/${projectId}/rules/${ruleId}`),
}

export const executionsAPI = {
  trigger: (projectId) =>
    api.post(`/projects/${projectId}/executions`).then((r) => r.data),
  list: (projectId) =>
    api.get(`/projects/${projectId}/executions`).then((r) => r.data),
  get: (projectId, execId) =>
    api.get(`/projects/${projectId}/executions/${execId}`).then((r) => r.data),
  results: (projectId, execId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api
      .get(`/projects/${projectId}/executions/${execId}/results?${qs}`)
      .then((r) => r.data)
  },
  promote: (projectId, execId, payload = {}) =>
    api.post(`/projects/${projectId}/executions/${execId}/promote`, payload).then((r) => r.data),
}

export const exportsAPI = {
  _downloadBlob: (response, fallbackName) => {
    const contentDisposition = response.headers['content-disposition'] || ''
    const filenameMatch = contentDisposition.match(/filename=\"?([^\"]+)\"?/)
    const filename = filenameMatch?.[1] || fallbackName
    const fileType = response.headers['content-type'] || 'application/octet-stream'
    const blob = new Blob([response.data], { type: fileType })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  },
  downloadReport: async (projectId, status = 'all') => {
    const executions = await executionsAPI.list(projectId)
    const latestCompleted = executions.find((execution) => execution.status === 'completed')
    if (!latestCompleted) {
      throw new Error('No completed reconciliation found for export')
    }

    const executionId = latestCompleted.id
    const endpoint = status === 'exceptions'
      ? `/reconciliation/${executionId}/export/exceptions`
      : `/reconciliation/${executionId}/export?status=${encodeURIComponent(status || 'all')}`

    const response = await api.get(endpoint, { responseType: 'blob' })
    exportsAPI._downloadBlob(response, `recon_${executionId}_${Date.now()}.xlsx`)
  },
  downloadSequenceReport: async (sequenceId) => {
    const response = await api.get(`/sequences/${sequenceId}/export`, { responseType: 'blob' })
    exportsAPI._downloadBlob(response, `sequence_${sequenceId}_${Date.now()}.xlsx`)
  }
}

export const auditAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/audit-logs?${qs}`).then((r) => r.data)
  },
}

export const sequencesAPI = {
  create: (data) => api.post('/sequences', data).then((r) => r.data),
  list: () => api.get('/sequences').then((r) => r.data),
  run: (id) => api.post(`/sequences/${id}/run`).then((r) => r.data),
  status: (id) => api.get(`/sequences/${id}/status`).then((r) => r.data),
}

export const schedulesAPI = {
  create: (data) => api.post('/schedules', data).then((r) => r.data),
  list: () => api.get('/schedules').then((r) => r.data),
  toggle: (id) => api.patch(`/schedules/${id}/toggle`).then((r) => r.data),
}

export const workflowAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/workflow${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
  get: (id) => api.get(`/workflow/${id}`).then((r) => r.data),
  assign: (data) => api.post('/workflow/assign', data).then((r) => r.data),
  submit: (data) => api.post('/workflow/submit', data).then((r) => r.data),
  review: (data) => api.post('/workflow/review', data).then((r) => r.data),
  approve: (data) => api.post('/workflow/approve', data).then((r) => r.data),
  returnForRework: (data) => api.post('/workflow/return-for-rework', data).then((r) => r.data),
  reject: (data) => api.post('/workflow/reject', data).then((r) => r.data),
  delete: (data) => api.post('/workflow/delete', data).then((r) => r.data),
  listAttachments: (workflowId) => api.get(`/workflow/${workflowId}/attachments`).then((r) => r.data),
  uploadAttachment: (workflowId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/workflow/${workflowId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  downloadAttachmentUrl: (attachmentId) => `${api.defaults.baseURL}/workflow/attachments/${attachmentId}/download`,
}

export const enterpriseAPI = {
  createBatch: (data) => api.post('/enterprise/ingestion/batches', data).then((r) => r.data),
  getIngestionSummary: () => api.get('/enterprise/ingestion/summary').then((r) => r.data),
  transformBatch: (batchId) => api.post(`/enterprise/ingestion/${batchId}/transform`).then((r) => r.data),
  validateBatch: (batchId) => api.post(`/enterprise/ingestion/${batchId}/validate`).then((r) => r.data),
  loadBatch: (batchId, profileId) => api.post(`/enterprise/ingestion/${batchId}/load/${profileId}`).then((r) => r.data),
  createProfile: (data) => api.post('/enterprise/profiles', data).then((r) => r.data),
  listProfiles: (projectId) =>
    api.get(`/enterprise/profiles${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`).then((r) => r.data),
  listProfileTransactions: (profileId) => api.get(`/enterprise/profiles/${profileId}/transactions`).then((r) => r.data),
  updateProfile: (profileId, data) => api.patch(`/enterprise/profiles/${profileId}`, data).then((r) => r.data),
  deleteProfile: (profileId) => api.delete(`/enterprise/profiles/${profileId}`).then((r) => r.data),
  runMatching: (data) => api.post('/enterprise/matching/run', data).then((r) => r.data),
  matchSuggestions: (data) => api.post('/enterprise/matching/suggestions', data).then((r) => r.data),
  listExceptions: (queueType = '') =>
    api.get(`/enterprise/exceptions${queueType ? `?queue_type=${encodeURIComponent(queueType)}` : ''}`).then((r) => r.data),
  listNotifications: (limit = 12, unreadOnly = false) =>
    api.get(`/enterprise/notifications?limit=${encodeURIComponent(limit)}&unread_only=${unreadOnly}`).then((r) => r.data),
  markNotificationRead: (id) =>
    api.put(`/enterprise/notifications/${id}/read`).then((r) => r.data),
  markAllNotificationsRead: () =>
    api.post('/enterprise/notifications/mark-all-read').then((r) => r.data),
  deleteNotification: (id) =>
    api.delete(`/enterprise/notifications/${id}`).then((r) => r.data),
  assignException: (data) => api.post('/enterprise/exceptions/assign', data).then((r) => r.data),
  submitException: (data) => api.post('/enterprise/exceptions/submit', data).then((r) => r.data),
  approveException: (data) => api.post('/enterprise/exceptions/approve', data).then((r) => r.data),
  rejectException: (data) => api.post('/enterprise/exceptions/reject', data).then((r) => r.data),
  finalizeRecord: (recordId) => api.post(`/enterprise/records/${recordId}/finalize`).then((r) => r.data),
  uploadAttachment: (recordId, payload) => {
    const form = new FormData()
    form.append('document_type', payload.document_type || 'supporting')
    form.append('document_name', payload.document_name || 'evidence')
    if (payload.document_path) form.append('document_path', payload.document_path)
    if (payload.file) form.append('file', payload.file)
    return api.post(`/enterprise/records/${recordId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  listAttachments: (recordId) => api.get(`/enterprise/records/${recordId}/attachments`).then((r) => r.data),
  createCloseCalendar: (data) => api.post('/enterprise/close-calendar', data).then((r) => r.data),
  listCloseCalendar: (profileId) =>
    api.get(`/enterprise/close-calendar${profileId ? `?profile_id=${encodeURIComponent(profileId)}` : ''}`).then((r) => r.data),
  lockClosePeriod: (calendar_id) => api.post('/enterprise/close-calendar/lock', { calendar_id }).then((r) => r.data),
  unlockClosePeriod: (calendar_id) => api.post('/enterprise/close-calendar/unlock', { calendar_id }).then((r) => r.data),
  createCertificationWorkflow: (data) => api.post('/enterprise/certification/workflows', data).then((r) => r.data),
  listCertificationWorkflows: (profileId) =>
    api.get(`/enterprise/certification/workflows${profileId ? `?profile_id=${encodeURIComponent(profileId)}` : ''}`).then((r) => r.data),
  actionCertificationWorkflow: (data) => api.post('/enterprise/certification/workflows/action', data).then((r) => r.data),
  getCertificationWorkflowHistory: (workflowId) =>
    api.get(`/enterprise/certification/workflows/${workflowId}/history`).then((r) => r.data),
  listReconciliationTemplates: () => api.get('/enterprise/templates/reconciliation').then((r) => r.data),
  createRuleDefinition: (data) => api.post('/enterprise/rule-definitions', data).then((r) => r.data),
  listRuleDefinitions: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/rule-definitions${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
  updateRuleDefinition: (ruleId, data) => api.patch(`/enterprise/rule-definitions/${ruleId}`, data).then((r) => r.data),
  deleteRuleDefinition: (ruleId) => api.delete(`/enterprise/rule-definitions/${ruleId}`).then((r) => r.data),
  executiveDashboard: () => api.get('/enterprise/dashboard/executive').then((r) => r.data),
  reviewerDashboard: () => api.get('/enterprise/dashboard/reviewer').then((r) => r.data),
  preparerDashboard: () => api.get('/enterprise/dashboard/preparer').then((r) => r.data),
  analyticsExplorer: () => api.get('/enterprise/analytics/explorer').then((r) => r.data),
  analyticsSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/analytics/summary${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
  analyticsDrilldown: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/analytics/drilldown${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
  generateAgingReminders: () => api.post('/enterprise/aging/reminders/generate').then((r) => r.data),
  riskHeatmap: (entity = '') =>
    api.get(`/enterprise/risk/heatmap${entity ? `?entity=${encodeURIComponent(entity)}` : ''}`).then((r) => r.data),
  calculateRisk: () => api.post('/enterprise/risk/calculate').then((r) => r.data),
  getGovernancePolicies: () => api.get('/enterprise/governance/policies').then((r) => r.data),
  upsertGovernancePolicy: (data) => api.post('/enterprise/governance/policies', data).then((r) => r.data),
  enforceApprovalPolicy: (data) => api.post('/enterprise/governance/enforce-approval', data).then((r) => r.data),
  createFxRate: (data) => api.post('/enterprise/fx/rates', data).then((r) => r.data),
  convertFx: (data) => api.post('/enterprise/fx/convert', data).then((r) => r.data),
  fxReconciliation: (profileId, reportingCurrency) => api.get(`/enterprise/fx/reconciliation/${profileId}?reporting_currency=${encodeURIComponent(reportingCurrency)}`).then((r) => r.data),
  createJournal: (data) => api.post('/enterprise/journals', data).then((r) => r.data),
  autoJournal: (data) => api.post('/enterprise/journals/auto', data).then((r) => r.data),
  journalAction: (adjustmentId, action, comments = '') => api.post(`/enterprise/journals/${adjustmentId}/${action}`, { adjustment_id: adjustmentId, comments }).then((r) => r.data),
  // Alias used by ReviewerWorkbench
  actionJournal: ({ adjustment_id, action, comments = '' }) =>
    api.post(`/enterprise/journals/${adjustment_id}/${action}`, { adjustment_id, comments }).then((r) => r.data),
  variance: (profileId) => api.get(`/enterprise/variance/${profileId}`).then((r) => r.data),
  // Aliases used by PreparerWorkbench
  getVariance: (profileId) => api.get(`/enterprise/variance/${profileId}`).then((r) => r.data),
  listJournalAdjustments: (profileId) =>
    api.get(`/enterprise/journals?profile_id=${encodeURIComponent(profileId)}`).then((r) => r.data),
  advancedSearch: (data) => api.post('/enterprise/search', data).then((r) => r.data),
  bulkActions: (data) => api.post('/enterprise/bulk-actions', data).then((r) => r.data),
  addComment: (data) => api.post('/enterprise/comments', data).then((r) => r.data),
  listComments: (profileId) => api.get(`/enterprise/comments/${profileId}`).then((r) => r.data),
  addExceptionComment: (data) => api.post('/enterprise/exceptions/comment', data).then((r) => r.data),
  listExceptionComments: (exceptionId) => api.get(`/enterprise/exceptions/${exceptionId}/comments`).then((r) => r.data),
  classifyException: (data) => api.post('/enterprise/exceptions/classify', data).then((r) => r.data),
  resolveException: (data) => api.post('/enterprise/exceptions/resolve', data).then((r) => r.data),
  escalateException: (data) => api.post('/enterprise/exceptions/escalate', data).then((r) => r.data),
  reopenException: (data) => api.post('/enterprise/exceptions/reopen', data).then((r) => r.data),
  scheduleReport: (data) => api.post('/enterprise/reports/schedule', data).then((r) => r.data),
  listReportSchedules: () => api.get('/enterprise/reports/schedule').then((r) => r.data),
  listRetentionPolicies: () => api.get('/enterprise/retention/policies').then((r) => r.data),
  listDependencies: (profileId) =>
    api.get(`/enterprise/dependencies${profileId ? `?profile_id=${encodeURIComponent(profileId)}` : ''}`).then((r) => r.data),
  jobMetrics: () => api.get('/enterprise/metrics/jobs').then((r) => r.data),
}

// ── Extended Enterprise API (Phase 1-4) ──────────────────────
export const enterpriseExtAPI = {
  cloneProfile: (profileId, payload) =>
    api.post(`/enterprise/profiles/${profileId}/clone`, payload).then((r) => r.data),
  rolloverProfile: (profileId, payload = {}) =>
    api.post(`/enterprise/profiles/${profileId}/rollover`, payload).then((r) => r.data),
  listCloseTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/close-tasks${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
  createCloseTask: (data) => api.post('/enterprise/close-tasks', data).then((r) => r.data),
  updateCloseTask: (taskId, data) => api.patch(`/enterprise/close-tasks/${taskId}`, data).then((r) => r.data),
  enhancedAnalytics: () => api.get('/enterprise/analytics/enhanced').then((r) => r.data),
}

// ── Phase 5 API (advanced matching + period lock + real dashboards) ──
export const advancedAPI = {
  // Advanced matching
  runAdvancedMatching: (payload) =>
    api.post('/enterprise/matching/run-advanced', payload).then((r) => r.data),
  getMatchSuggestionsAdvanced: (profileId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/matching/suggestions-advanced/${profileId}${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },

  // Period lock
  lockPeriod:   (calendarId) => api.post(`/enterprise/close-calendar/${calendarId}/lock`, {}).then((r) => r.data),
  unlockPeriod: (calendarId, reason) => api.post(`/enterprise/close-calendar/${calendarId}/unlock`, { reason }).then((r) => r.data),

  // Real dashboards
  executiveDashboard: () => api.get('/enterprise/dashboard/executive-real').then((r) => r.data),
  riskDashboard:      () => api.get('/enterprise/dashboard/risk-real').then((r) => r.data),

  // Profile transactions
  profileTransactions: (profileId) =>
    api.get(`/enterprise/profiles/${profileId}/transactions`).then((r) => r.data),

  // Exceptions with profile context
  exceptionsWithProfile: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/enterprise/exceptions/with-profile${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },
}

export const profilesAPI = {
  list: ({ page = 1, pageSize = 20, search = '', riskLevel = [], status = [], sortBy = 'created_at', sortDir = 'desc' } = {}) => {
    const params = new URLSearchParams({ page, page_size: pageSize, sort_by: sortBy, sort_dir: sortDir })
    if (search)            params.set('search', search)
    riskLevel.forEach(r => params.append('risk_level', r))
    status.forEach(s =>    params.append('status', s))
    return api.get(`/v1/profiles?${params}`).then(r => r.data)
  },
  get:    (id)               => api.get(`/v1/profiles/${id}`).then(r => r.data),
  create: (payload)          => api.post('/v1/profiles', payload).then(r => r.data),
  update: (id, payload)      => api.patch(`/v1/profiles/${id}`, payload).then(r => r.data),
  delete: (id, hard = false) => api.delete(`/v1/profiles/${id}?hard=${hard}`).then(r => r.data),
}

export const approvalChainsAPI = {
  list: (params) => api.get('/v1/approval-chains', { params }).then(r => r.data),
  get: (id) => api.get(`/v1/approval-chains/${id}`).then(r => r.data),
  create: (payload) => api.post('/v1/approval-chains', payload).then(r => r.data),
  update: (id, payload) => api.patch(`/v1/approval-chains/${id}`, payload).then(r => r.data),
  delete: (id) => api.delete(`/v1/approval-chains/${id}`).then(r => r.data),
}

export const riskConfigAPI = {
  get: (projectId) => api.get(`/v1/risk-config/project/${projectId}`).then(r => r.data),
  update: (projectId, payload) => api.put(`/v1/risk-config/project/${projectId}`, payload).then(r => r.data),
  create: (payload) => api.post('/v1/risk-config/', payload).then(r => r.data),
}

export const compliancePolicyAPI = {
  list: () => api.get('/v1/compliance-policy').then(r => r.data),
  create: (payload) => api.post('/v1/compliance-policy', payload).then(r => r.data),
  update: (id, payload) => api.patch(`/v1/compliance-policy/${id}`, payload).then(r => r.data),
  delete: (id) => api.delete(`/v1/compliance-policy/${id}`).then(r => r.data),
}

export const evidenceRetentionAPI = {
  listPolicies: () => api.get('/v1/evidence-retention/policies').then(r => r.data),
  createPolicy: (payload) => api.post('/v1/evidence-retention/policies', payload).then(r => r.data),
  listJobs: () => api.get('/v1/evidence-retention/jobs').then(r => r.data),
  getMetrics: () => api.get('/v1/evidence-retention/metrics').then(r => r.data),
}

export { default as lifecycleAPI } from './lifecycleAPI'
export { default as agingAPI } from './agingAPI'
export { supportingItemsAPI } from './supportingItemsAPI'
export { default as varianceAPI } from './varianceAPI'
export { commentsAPI } from './commentsAPI';
export { closeCalendarAPI } from './closeCalendarAPI'
export { default as closeCalendarAPIDefault } from './closeCalendarAPI'
export { slaAPI, default as slaAPIDefault } from './slaAPI'
export { notificationsAPI } from './notificationsAPI'
export { fxAPI } from './fxAPI'
export { matchingAPI } from './matchingAPI'
export { bulkAPI } from './bulkAPI'
export { ingestionAPI } from './ingestionAPI'
export { autoCertAPI } from './autoCertAPI'