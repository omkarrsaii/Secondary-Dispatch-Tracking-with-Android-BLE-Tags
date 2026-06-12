import { useState, useEffect, useCallback, useRef } from 'react'
import { getDevices, getStatus, triggerRefresh } from '../lib/api'

export function useDevices(pollInterval = 15000) {
  const [devices, setDevices] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const [devicesData, statusData] = await Promise.all([getDevices(), getStatus()])
      setDevices(devicesData)
      setStatus(statusData)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await triggerRefresh()
      // Poll for completion
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        const s = await getStatus().catch(() => null)
        if (s && !s.fetching) {
          clearInterval(poll)
          await fetchData()
          setRefreshing(false)
        }
        if (attempts > 40) { // 2 min timeout
          clearInterval(poll)
          setRefreshing(false)
        }
      }, 3000)
    } catch (err) {
      setRefreshing(false)
    }
  }, [refreshing, fetchData])

  useEffect(() => {
    fetchData()
    timerRef.current = setInterval(fetchData, pollInterval)
    return () => clearInterval(timerRef.current)
  }, [fetchData, pollInterval])

  return { devices, status, loading, refreshing, error, refetch: fetchData, refresh }
}
