import axios from 'axios'

// Separate instance, separate baseURL — completely independent of the
// existing api.js (which is scoped to /api/invoice). Nothing here can
// affect the existing tracking functionality.
const distributorApi = axios.create({
  baseURL: '/api/distributor',
  timeout: 15000,
})

/**
 * Log in with a distributor code. Throws on invalid code (404) — caller
 * should catch and show an error.
 */
export async function loginDistributor(distributorCode) {
  const { data } = await distributorApi.post('/login', { distributorCode: distributorCode.trim() })
  return data
}

export async function getDistributorSummary(distributorCode) {
  const { data } = await distributorApi.get(`/${encodeURIComponent(distributorCode)}/summary`)
  return data
}

export async function getDistributorInvoices(distributorCode, { page = 1, limit = 20 } = {}) {
  const { data } = await distributorApi.get(`/${encodeURIComponent(distributorCode)}/invoices`, {
    params: { page, limit },
  })
  return data
}

export default distributorApi
