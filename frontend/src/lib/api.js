import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// ─── Original exports — unchanged, do not rename or remove ──────────────────
export const getStatus         = () => api.get('/status').then(r => r.data)
export const getDevices        = () => api.get('/devices').then(r => r.data)
export const getDevice         = (id) => api.get(`/devices/${id}`).then(r => r.data)
export const getDeviceHistory  = (id, limit = 50) => api.get(`/device/${id}/history?limit=${limit}`).then(r => r.data)
export const triggerRefresh    = () => api.post('/refresh').then(r => r.data)
export const triggerRefreshSync = () => api.post('/refresh/sync').then(r => r.data)
export const updateScheduler   = (interval) => api.post('/scheduler', { interval }).then(r => r.data)

// ─── Invoice sync (existing backend routes, not previously exposed here) ────
export const getSyncStatus = () => api.get('/invoice/sync/status').then(r => r.data)
export const triggerSync   = () => api.post('/invoice/sync').then(r => r.data)

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () => api.get('/dashboard/stats').then(r => r.data)

// ─── Global search ────────────────────────────────────────────────────────────
export const globalSearch = (q, type = '') =>
  api.get('/search', { params: { q, type } }).then(r => r.data)

// ─── Routes ───────────────────────────────────────────────────────────────────
export const getRoutes      = () => api.get('/routes').then(r => r.data)
export const getRouteDetail = (name) =>
  api.get(`/routes/${encodeURIComponent(name)}`).then(r => r.data)
export const getRouteStatus = () => api.get('/routes/status').then(r => r.data)
export const syncRoutes     = () => api.post('/routes/sync').then(r => r.data)

// ─── Hierarchy ────────────────────────────────────────────────────────────────
export const getHierarchyTree     = () => api.get('/hierarchy/tree').then(r => r.data)
export const getHierarchyStatus   = () => api.get('/hierarchy/status').then(r => r.data)
export const syncHierarchy        = () => api.post('/hierarchy/sync').then(r => r.data)
export const getZones             = () => api.get('/hierarchy/zones').then(r => r.data)
export const getClusters          = (params) => api.get('/hierarchy/clusters', { params }).then(r => r.data)
export const getAsms              = (params) => api.get('/hierarchy/asms', { params }).then(r => r.data)
export const getTsoes             = (params) => api.get('/hierarchy/tsoes', { params }).then(r => r.data)
export const getDistributors      = (params) => api.get('/hierarchy/distributors', { params }).then(r => r.data)
export const getDistributorDetail = (code) =>
  api.get(`/hierarchy/distributor/${encodeURIComponent(code)}`).then(r => r.data)

// ─── Hierarchy: Performance KPIs (Cluster/ASM/TSOE, with optional filters) ──
// params can include: dateFrom, dateTo, distributorCode
export const getClusterKpis = (name, params) =>
  api.get(`/hierarchy/kpis/cluster/${encodeURIComponent(name)}`, { params }).then(r => r.data)
export const getAsmKpis  = (name, params) =>
  api.get(`/hierarchy/kpis/asm/${encodeURIComponent(name)}`, { params }).then(r => r.data)
export const getTsoeKpis = (name, params) =>
  api.get(`/hierarchy/kpis/tsoe/${encodeURIComponent(name)}`, { params }).then(r => r.data)

// ─── Hierarchy: Active Invoice List + row-click tracking detail ────────────
// params: scope ('cluster'|'asm'|'tsoe'), name, dateFrom, dateTo, distributorCode, invoiceState
export const getActiveInvoiceList = (params) =>
  api.get('/hierarchy/invoices', { params }).then(r => r.data)
export const getInvoiceTrackingDetail = (invoiceNo) =>
  api.get(`/hierarchy/invoices/${encodeURIComponent(invoiceNo)}`).then(r => r.data)

// ─── Default export — unchanged, several existing files import this ─────────
export default api
