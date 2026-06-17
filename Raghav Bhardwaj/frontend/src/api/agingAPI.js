// frontend/src/api/agingAPI.js
// Exception Aging Analysis Engine — API methods
// Follows existing patterns from balancesAPI.js and index.js

import client from './client';

// NOTE: client.js baseURL is '/api' so paths here start with '/v1/...'
const BASE = '/v1/exceptions';

const agingAPI = {
  // Four-bucket KPI summary
  getSummary: (params = {}) =>
    client.get(`${BASE}/aging-summary`, { params }).then(r => r.data),

  // Paginated exception list with aging metadata
  // Pass { bucket: 'WARNING' } to filter by a specific bucket
  getDetails: (params = {}) =>
    client.get(`${BASE}/aging-details`, { params }).then(r => r.data),

  // Month-over-month trend data
  getTrend: (params = {}) =>
    client.get(`${BASE}/aging-trend`, { params }).then(r => r.data),

  // Admin: manually trigger escalation engine
  runEscalations: () =>
    client.post(`${BASE}/aging-escalate`).then(r => r.data),

  // Admin: write monthly snapshot
  writeSnapshot: () =>
    client.post(`${BASE}/aging-snapshot`).then(r => r.data),
};

export default agingAPI;
