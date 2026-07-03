import api from './client'

export const ingestionAPI = {
  ingestBalances: async (projectId, datasetType, balances) => {
    const res = await api.post(`/v1/projects/${projectId}/ingestion/balances`, { dataset_type: datasetType, balances })
    return res.data
  },
  listJobs: async (projectId) => {
    const res = await api.get(`/v1/projects/${projectId}/ingestion/jobs`)
    return res.data
  }
}
