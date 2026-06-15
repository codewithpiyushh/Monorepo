// frontend/src/api/lifecycleAPI.js
// Lifecycle & Approval Chain API — Phase 2 Chunk 1 endpoints
// Follows the same pattern as balancesAPI.js, varianceAPI.js

import client from './client'

const BASE = '/api/v1/lifecycle'

const lifecycleAPI = {
  // ── Approval chain validation ────────────────────────────────
  // Validate a chain array before saving to a profile.
  // Returns { valid: bool, errors: string[], warnings: string[] }
  validateChain: (chain) =>
    client.post(`${BASE}/validate-chain`, { chain }).then(r => r.data),

  // ── Save approval chain on a profile ─────────────────────────
  // PATCH approval_chain_json onto an existing profile
  saveChain: (profileId, chain) =>
    client.patch(`${BASE}/profiles/${profileId}/approval-chain`, { chain }).then(r => r.data),

  // ── Get current chain for a profile ──────────────────────────
  getChain: (profileId) =>
    client.get(`${BASE}/profiles/${profileId}/approval-chain`).then(r => r.data),

  // ── Lifecycle state transitions ───────────────────────────────
  transition: (profileId, action, payload = {}) =>
    client.post(`${BASE}/profiles/${profileId}/transition`, { action, ...payload }).then(r => r.data),

  // ── Auto-certification check ──────────────────────────────────
  checkAutoCert: (profileId) =>
    client.get(`${BASE}/profiles/${profileId}/auto-cert-eligible`).then(r => r.data),
}

export default lifecycleAPI;