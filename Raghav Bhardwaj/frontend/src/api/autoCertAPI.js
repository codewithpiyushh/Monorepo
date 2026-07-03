import api from './client'

export const autoCertAPI = {
  getRule: async (projectId) => {
    const res = await api.get(`/v1/projects/${projectId}/auto-cert/rule`)
    return res.data
  },
  updateRule: async (projectId, payload) => {
    const res = await api.patch(`/v1/projects/${projectId}/auto-cert/rule`, payload)
    return res.data
  },
  runEngine: async (projectId) => {
    const res = await api.post(`/v1/projects/${projectId}/auto-cert/run`)
    return res.data
  }
}
