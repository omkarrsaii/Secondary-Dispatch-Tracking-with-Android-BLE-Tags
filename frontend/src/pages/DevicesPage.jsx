import { useState } from 'react'
import { Search, Smartphone, Download } from 'lucide-react'
import { useDevices } from '../hooks/useDevices'
import DeviceRow from '../components/DeviceRow'
import Header from '../components/Header'
import SessionExpiredBanner from '../components/SessionExpiredBanner'

export default function DevicesPage() {
  const { devices, status, loading, refreshing, refresh } = useDevices()
  const [search, setSearch] = useState('')

  const filtered = devices.filter(d =>
    !search ||
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.location?.toLowerCase().includes(search.toLowerCase()) ||
    d.network?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen">
      <Header title="All Devices" status={status} refreshing={refreshing} onRefresh={refresh} />
      {status?.sessionExpired && <SessionExpiredBanner />}

      <div className="p-6 animate-fade-in">
        {/* Search + Export bar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hub-muted" />
            <input
              type="text"
              placeholder="Search devices, location, network..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-hub-card border border-hub-border rounded-lg pl-9 pr-4 py-2 text-sm text-hub-text placeholder:text-hub-muted focus:outline-none focus:border-hub-accent/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <a href="/api/export/csv" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-hub-border/60 hover:bg-hub-border text-hub-muted hover:text-hub-text text-xs font-medium transition-colors">
              <Download size={13} /> CSV
            </a>
            <a href="/api/export/excel" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent border border-hub-accent/20 text-xs font-medium transition-colors">
              <Download size={13} /> Excel
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-hub-border bg-hub-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-hub-border flex items-center justify-between">
            <p className="text-xs text-hub-muted">
              {filtered.length} of {devices.length} devices
            </p>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
              <p className="text-hub-muted text-sm">Loading devices...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Smartphone size={32} className="text-hub-border mx-auto mb-3" />
              <p className="text-hub-muted text-sm">{search ? 'No devices match your search.' : 'No devices tracked yet.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hub-border">
                    {['Device', 'Coordinates', 'Location', 'Battery', 'Network', 'Last Seen', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-hub-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(device => (
                    <DeviceRow key={device.id} device={device} />
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
