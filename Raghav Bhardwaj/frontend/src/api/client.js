import axios from 'axios'
import { errorTracker } from '../services/errorTracker'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})


api.interceptors.request.use((config) => {
  const token = localStorage.getItem('drms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const { config, response, message } = err
    
    // Log API errors
    if (config) {
      errorTracker.logAPIError(
        config.url,
        config.method?.toUpperCase() || 'UNKNOWN',
        response?.status || 0,
        err,
        { data: response?.data }
      )
    }

    // Handle 401 - clear auth
    if (err.response?.status === 401) {
      localStorage.removeItem('drms_token')
      localStorage.removeItem('drms_user')
      window.location.href = '/login'
    }

    // Handle 403 - unauthorized role
    if (err.response?.status === 403) {
      window.location.href = '/unauthorized'
    }

    return Promise.reject(err)
  }
)

export default api
