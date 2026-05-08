import api from './client'

export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }).then((r) => r.data),
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
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
  assign: (data) => api.post('/workflow/assign', data).then((r) => r.data),
  submit: (data) => api.post('/workflow/submit', data).then((r) => r.data),
  approve: (data) => api.post('/workflow/approve', data).then((r) => r.data),
  reject: (data) => api.post('/workflow/reject', data).then((r) => r.data),
  get: (id) => api.get(`/workflow/${id}`).then((r) => r.data),
}

export const enterpriseAPI = {
  createBatch: (data) => api.post('/enterprise/ingestion/batches', data).then((r) => r.data),
  getIngestionSummary: () => api.get('/enterprise/ingestion/summary').then((r) => r.data),
  transformBatch: (batchId) => api.post(`/enterprise/ingestion/${batchId}/transform`).then((r) => r.data),
  validateBatch: (batchId) => api.post(`/enterprise/ingestion/${batchId}/validate`).then((r) => r.data),
  loadBatch: (batchId, profileId) => api.post(`/enterprise/ingestion/${batchId}/load/${profileId}`).then((r) => r.data),
  createProfile: (data) => api.post('/enterprise/profiles', data).then((r) => r.data),
  listProfiles: () => api.get('/enterprise/profiles').then((r) => r.data),
  runMatching: (data) => api.post('/enterprise/matching/run', data).then((r) => r.data),
  listExceptions: (queueType = '') =>
    api.get(`/enterprise/exceptions${queueType ? `?queue_type=${encodeURIComponent(queueType)}` : ''}`).then((r) => r.data),
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
}
