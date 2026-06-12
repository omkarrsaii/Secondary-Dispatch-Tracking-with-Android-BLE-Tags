import axios from 'axios'

const api = axios.create({
  baseURL: '/api/invoice',
  timeout: 15000,
})

/**
 * Track a delivery by invoice number.
 * @param {string} invoiceNo
 * @returns {Promise<{ success: boolean, data: TrackResult }>}
 */
export async function trackInvoice(invoiceNo) {
  const { data } = await api.get(`/track/${encodeURIComponent(invoiceNo.trim())}`)
  return data
}

export default api
