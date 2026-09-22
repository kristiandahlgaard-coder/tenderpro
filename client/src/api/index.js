/**
 * TenderPro — API Client (Axios)
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Token aus localStorage anhängen
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tp_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → Logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tp_token')
      localStorage.removeItem('tp_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
