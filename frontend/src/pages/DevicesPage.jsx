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
    d.vehicleNo?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-m-bg">
      <Header title="All Devices" status={status} refreshing={refreshing} onRefresh={refresh} />
      {status?.sessionExpired && <SessionExpiredBanner />}

      <div className="p-6 animate-fade-in">
        {/* Search + Export bar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-m-muted" />
            <input
              type="text"
              placeholder="Search by device, location, vehicle no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-m-surface border border-m-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-m-text placeholder:text-m-muted/60 focus:outline-none focus:border-m-blue/50 transition-colors shadow-card"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <a href="/api/export/csv"
               className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-m-surface hover:bg-m-bg text-m-muted hover:text-m-text border border-m-border text-xs font-medium transition-colors">
              <Download size={12} /> CSV
            </a>
            <a href="/api/export/excel"
               className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
               style={{ color:'#1467B2', borderColor:'#1467B2', background:'#EBF3FF' }}>
              <Download size={12} /> Excel
            </a>
          </div>
        </div>

        <div className="bg-m-surface rounded-xl border border-m-border shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-m-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={14} className="text-m-blue" />
              <h2 className="font-bold text-sm text-m-text">Device List</h2>
            </div>
            <span className="text-xs text-m-muted font-mono">{filtered.length} of {devices.length}</span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-m-border rounded-full animate-spin" style={{ borderTopColor:'#1467B2' }} />
              <p className="text-m-muted text-sm">Loading devices…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Smartphone size={28} className="text-m-border mx-auto mb-3" />
              <p className="text-m-muted text-sm font-medium">{search ? 'No devices match your search.' : 'No devices tracked yet.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-m-border bg-m-bg">
                    {['Device', 'Coordinates', 'Location', 'Vehicle No.', 'Status', 'Last Seen', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-m-muted uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(device => <DeviceRow key={device.id} device={device} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
