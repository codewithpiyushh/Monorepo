import api from './client'

/**
 * fxAPI.js — Phase 3 Chunk 5
 * FX Management API client — new /api/v1/fx/* endpoints + existing enterprise FX.
 */
export const fxAPI = {
  /** FX exposure dashboard — currencies in use, latest rates, last refresh */
  dashboard: () => api.get('/v1/fx/dashboard').then(r => r.data),

  /** List stored exchange rates (optional from_currency filter) */
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get(`/v1/fx/rates${qs ? `?${qs}` : ''}`).then(r => r.data)
  },

  /** Get latest rate for a specific pair */
  getRate: (from, to) =>
    api.get(`/v1/fx/rates/${encodeURIComponent(from)}/${encodeURIComponent(to)}`).then(r => r.data),

  /** Admin: refresh live rates from open.er-api.com */
  refreshRates: (base = 'USD') =>
    api.post(`/v1/fx/rates/refresh?base=${encodeURIComponent(base)}`).then(r => r.data),

  /** Convert amount between currencies (existing enterprise endpoint) */
  convert: (data) => api.post('/enterprise/fx/convert', data).then(r => r.data),

  /** FX reconciliation for a profile (existing enterprise endpoint) */
  reconciliation: (profileId, reportingCurrency) =>
    api
      .get(`/enterprise/fx/reconciliation/${profileId}?reporting_currency=${encodeURIComponent(reportingCurrency)}`)
      .then(r => r.data),

  /** Manually add a rate entry (existing enterprise endpoint) */
  create: (data) => api.post('/enterprise/fx/rates', data).then(r => r.data),
}
