// frontend/src/api/balancesAPI.js
// Balance Reconciliation Engine — API methods
// Follows the same patterns as profilesAPI.js and index.js

// NOTE: client.js baseURL is '/api' so paths here start with '/v1/...'

import client from './client';

const BASE = '/v1/balances';

const balancesAPI = {
  // ── Dashboard ─────────────────────────────────────────────────────────
  getDashboard: () =>
    client.get(`${BASE}/dashboard`).then(r => r.data),

  // ── List ──────────────────────────────────────────────────────────────
  list: (params = {}) =>
    client.get(BASE, { params }).then(r => r.data),

  // ── Single ────────────────────────────────────────────────────────────
  get: (balanceId) =>
    client.get(`${BASE}/${balanceId}`).then(r => r.data),

  getHistory: (balanceId) =>
    client.get(`${BASE}/${balanceId}/history`).then(r => r.data),

  // ── CRUD ──────────────────────────────────────────────────────────────
  create: (data) =>
    client.post(BASE, data).then(r => r.data),

  update: (balanceId, data) =>
    client.patch(`${BASE}/${balanceId}`, data).then(r => r.data),

  delete: (balanceId) =>
    client.delete(`${BASE}/${balanceId}`),

  // ── Workflow actions ──────────────────────────────────────────────────
  submit: (balanceId, data = {}) =>
    client.post(`${BASE}/${balanceId}/submit`, data).then(r => r.data),

  approve: (balanceId, data = {}) =>
    client.post(`${BASE}/${balanceId}/approve`, data).then(r => r.data),

  reject: (balanceId, data) =>
    client.post(`${BASE}/${balanceId}/reject`, data).then(r => r.data),

  certify: (balanceId, data = {}) =>
    client.post(`${BASE}/${balanceId}/certify`, data).then(r => r.data),
};

export default balancesAPI;
