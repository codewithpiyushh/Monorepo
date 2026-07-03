// frontend/src/api/closeCalendarAPI.js
// Financial Close Calendar API client — Phase 2, Chunk 3.
// Exports both named { closeCalendarAPI } and default, matching whichever
// import style the page uses (see lifecycleAPI.js fix for why this matters).

import client from './client'

const BASE = '/api/v1/close-calendar'

export const closeCalendarAPI = {
  listPeriods: () =>
    client.get(`${BASE}/periods`).then(r => r.data),

  getDashboard: (periodId) =>
    client.get(`${BASE}/${periodId}/dashboard`).then(r => r.data),

  getTasks: (periodId, myTasksOnly = false) =>
    client.get(`${BASE}/${periodId}/tasks`, { params: { my_tasks_only: myTasksOnly } }).then(r => r.data),

  updateTaskStatus: (taskId, payload) =>
    client.patch(`${BASE}/tasks/${taskId}/status`, payload).then(r => r.data),

  createPeriod: (payload) =>
    client.post(`${BASE}/create-period`, payload).then(r => r.data),

  validateClose: (periodId) =>
    client.get(`${BASE}/${periodId}/validate-close`).then(r => r.data),

  closePeriod: (periodId) =>
    client.patch(`${BASE}/${periodId}/close`).then(r => r.data),
}

export default closeCalendarAPI
