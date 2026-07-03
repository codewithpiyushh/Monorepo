// frontend/src/api/slaAPI.js
// SLA Monitoring & Escalation API client — Phase 2, Chunk 4.
// Named + default export (see lifecycleAPI.js fix earlier in this project
// for why both matter).

import client from './client'

const BASE = '/api/v1/sla'

export const slaAPI = {
  // ── Violations (role-scoped per backend RBAC) ──────────────────────────
  listMyViolations:         () => client.get(`${BASE}/violations`).then(r => r.data),
  listTeamViolations:       () => client.get(`${BASE}/violations/team`).then(r => r.data),
  listEnterpriseViolations: () => client.get(`${BASE}/violations/enterprise`).then(r => r.data),
  listAllViolations:        (params = {}) => client.get(`${BASE}/violations/all`, { params }).then(r => r.data),

  acknowledge: (violationId, note) =>
    client.post(`${BASE}/violations/${violationId}/acknowledge`, { note }).then(r => r.data),

  override: (violationId, payload) =>
    client.post(`${BASE}/violations/${violationId}/override`, payload).then(r => r.data),

  resolve: (violationId, note) =>
    client.post(`${BASE}/violations/${violationId}/resolve`, { note }).then(r => r.data),

  // ── Policies ────────────────────────────────────────────────────────────
  listPolicies:  () => client.get(`${BASE}/policies`).then(r => r.data),
  createPolicy:  (payload) => client.post(`${BASE}/policies`, payload).then(r => r.data),
  updatePolicy:  (id, payload) => client.put(`${BASE}/policies/${id}`, payload).then(r => r.data),

  // ── Manual scan trigger (admin convenience) ────────────────────────────
  triggerScan: () => client.post(`${BASE}/scan`).then(r => r.data),
}

export default slaAPI
