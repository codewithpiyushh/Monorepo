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
  approve: (data) => api.post('/workflow/approve', data).then((r) => r.data),
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
  listProfiles: () => api.get('/enterprise/profiles').then((r) => r.data),
  listProfileTransactions: (profileId) => api.get(`/enterprise/profiles/${profileId}/transactions`).then((r) => r.data),
  updateProfile: (profileId, data) => api.patch(`/enterprise/profiles/${profileId}`, data).then((r) => r.data),
  deleteProfile: (profileId) => api.delete(`/enterprise/profiles/${profileId}`).then((r) => r.data),
  runMatching: (data) => api.post('/enterprise/matching/run', data).then((r) => r.data),
  matchSuggestions: (data) => api.post('/enterprise/matching/suggestions', data).then((r) => r.data),
  listExceptions: (queueType = '') =>
    api.get(`/enterprise/exceptions${queueType ? `?queue_type=${encodeURIComponent(queueType)}` : ''}`).then((r) => r.data),
  listNotifications: (limit = 12) =>
    api.get(`/enterprise/notifications?limit=${encodeURIComponent(limit)}`).then((r) => r.data),
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
  variance: (profileId) => api.get(`/enterprise/variance/${profileId}`).then((r) => r.data),
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
