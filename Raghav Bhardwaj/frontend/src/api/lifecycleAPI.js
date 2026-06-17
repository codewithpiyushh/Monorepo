import client from './client'

const lifecycleAPI = {
  // Chain validation — maps to POST /api/v1/profiles/{id}/validate-chain
  validateChain: (profileId, chain, preparerId = null, certifierId = null) =>
    client.post(`/v1/profiles/${profileId}/validate-chain`, {
      approval_chain: chain,
      preparer_id: preparerId,
      certifier_id: certifierId,
      profile_id: profileId,
    }).then(r => r.data),

  // Get live approval chain progress for the stepper UI
  getChainStatus: (balanceId) =>
    client.get(`/v1/balances/${balanceId}/chain-status`).then(r => r.data),

  // Workflow history
  getWorkflowHistory: (balanceId) =>
    client.get(`/v1/balances/${balanceId}/workflow-history`).then(r => r.data),

  // State transitions
  submit: (balanceId, comment) =>
    client.post(`/v1/balances/${balanceId}/workflow/submit`, {
      submit_comment: comment,
    }).then(r => r.data),

  approve: (balanceId, comment = null) =>
    client.post(`/v1/balances/${balanceId}/workflow/approve`, {
      approval_comment: comment,
    }).then(r => r.data),

  reject: (balanceId, comment) =>
    client.post(`/v1/balances/${balanceId}/workflow/reject`, {
      rejection_comment: comment,
    }).then(r => r.data),

  certify: (balanceId, comment = null) =>
    client.post(`/v1/balances/${balanceId}/workflow/certify`, {
      certification_comment: comment,
    }).then(r => r.data),

  close: (balanceId) =>
    client.post(`/v1/balances/${balanceId}/workflow/close`).then(r => r.data),

  override: (balanceId, reason) =>
    client.post(`/v1/balances/${balanceId}/workflow/override`, {
      reason,
    }).then(r => r.data),
}

export { lifecycleAPI };
export default lifecycleAPI;