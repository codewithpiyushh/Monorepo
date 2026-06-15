import client from './client'

const ANALYTICS = '/api/v1/analytics'
const BALANCES = '/api/v1/balances'

const varianceAPI = {
  getVarianceFlux: (params = {}) =>
    client.get(`${ANALYTICS}/variance-flux`, { params }).then((r) => r.data),
  getVarianceTrends: (params = {}) =>
    client.get(`${ANALYTICS}/variance-trends`, { params }).then((r) => r.data),
  refreshVariance: (balanceId) =>
    client.post(`${ANALYTICS}/variance-refresh/${balanceId}`).then((r) => r.data),
  getExplanation: (balanceId) =>
    client.get(`${BALANCES}/${balanceId}/explanation`).then((r) => r.data),
  saveExplanation: (balanceId, data) =>
    client.patch(`${BALANCES}/${balanceId}/explanation`, data).then((r) => r.data),
}

export default varianceAPI
