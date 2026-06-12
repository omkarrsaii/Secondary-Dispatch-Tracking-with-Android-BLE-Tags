import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

export const getStatus = () => api.get('/status').then(r => r.data)
export const getDevices = () => api.get('/devices').then(r => r.data)
export const getDevice = (id) => api.get(`/devices/${id}`).then(r => r.data)
export const getDeviceHistory = (id, limit = 50) => api.get(`/device/${id}/history?limit=${limit}`).then(r => r.data)
export const triggerRefresh = () => api.post('/refresh').then(r => r.data)
export const triggerRefreshSync = () => api.post('/refresh/sync').then(r => r.data)
export const updateScheduler = (interval) => api.post('/scheduler', { interval }).then(r => r.data)

export default api
