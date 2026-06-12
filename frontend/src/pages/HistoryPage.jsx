import { useState, useEffect } from 'react'
import { History, MapPin, Filter } from 'lucide-react'
import { getDevices, getDeviceHistory } from '../lib/api'
import { useDevices } from '../hooks/useDevices'
import Header from '../components/Header'

export default function HistoryPage() {
  const { status, refreshing, refresh } = useDevices()
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState('all')
  const [allHistory, setAllHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const devs = await getDevices()
        setDevices(devs)

        // Load history for all devices
        const histories = await Promise.all(
          devs.map(d => getDeviceHistory(d.id, 30).then(h => h.map(r => ({ ...r, deviceName: d.name }))))
        )
        const merged = histories.flat().sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
        setAllHistory(merged)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = selectedDevice === 'all'
    ? allHistory
    : allHistory.filter(h => h.device_id === parseInt(selectedDevice))

  return (
    <div className="min-h-screen">
      <Header title="History" status={status} refreshing={refreshing} onRefresh={refresh} />

      <div className="p-6 animate-fade-in">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-5">
          <Filter size={14} className="text-hub-muted" />
          <select
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
            className="bg-hub-card border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text focus:outline-none focus:border-hub-accent/50 transition-colors"
          >
            <option value="all">All Devices</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <span className="text-xs text-hub-muted ml-2">{filtered.length} records</span>
        </div>

        <div className="rounded-xl border border-hub-border bg-hub-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-hub-border flex items-center gap-2">
            <History size={14} className="text-hub-accent" />
            <h2 className="text-sm font-semibold text-hub-text font-display">Location History</h2>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
              <p className="text-hub-muted text-sm">Loading history...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <History size={32} className="text-hub-border mx-auto mb-3" />
              <p className="text-hub-muted text-sm">No history records yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hub-border">
                    {['Timestamp', 'Device', 'Latitude', 'Longitude', 'Battery', 'Network', 'Maps'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-hub-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => (
                    <tr key={h.id} className="border-b border-hub-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-xs text-hub-muted font-mono whitespace-nowrap">
                        {new Date(h.captured_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-hub-text font-medium">{h.deviceName}</td>
                      <td className="px-4 py-3 text-xs text-hub-text font-mono">{h.latitude || '—'}</td>
                      <td className="px-4 py-3 text-xs text-hub-text font-mono">{h.longitude || '—'}</td>
                      <td className="px-4 py-3 text-xs text-hub-text">{h.battery ? `${h.battery}%` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-hub-text">{h.network || '—'}</td>
                      <td className="px-4 py-3">
                        {h.latitude && h.longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-hub-accent text-xs hover:underline"
                          >
                            <MapPin size={11} /> View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
