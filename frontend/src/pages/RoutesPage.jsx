import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Route, Truck, FileText, Users, AlertCircle } from 'lucide-react'
import Header from '../components/Header'
import RouteMapPanel from '../components/RouteMapPanel'
import { getRoutes, syncRoutes } from '../lib/api'
import StatCard from '../components/StatCard'

export default function RoutesPage() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter]     = useState('')

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getRoutes().then(setData).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try { await syncRoutes(); load() } catch { /* ignore */ } finally { setSyncing(false) }
  }

  const filtered = (data?.routes || []).filter(r =>
    !filter || r.routeName.toLowerCase().includes(filter.toLowerCase()) || r.asmName.toLowerCase().includes(filter.toLowerCase())
  )

  const totalVehicles     = (data?.routes || []).reduce((s, r) => s + (r.vehicleCount || 0), 0)
  const totalDistributors = (data?.routes || []).reduce((s, r) => s + r.distributorCount, 0)
  const totalInvoices     = (data?.routes || []).reduce((s, r) => s + (r.invoiceCount || 0), 0)

  return (
    <div className="min-h-screen bg-m-bg">
      <Header title="Route Management" status={null} refreshing={syncing} onRefresh={handleSync} />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Route}    label="Total Routes"       value={data?.total ?? '—'} color="blue"  />
          <StatCard icon={Users}    label="Total Distributors" value={totalDistributors}   color="teal"  />
          <StatCard icon={Truck}    label="Active Vehicles"    value={totalVehicles}        color="green" />
          <StatCard icon={FileText} label="Total Invoices"     value={totalInvoices}        color="amber" />
        </div>

        <div className="bg-m-surface rounded-xl border border-m-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-m-border flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Route size={15} className="text-m-blue" />
              <h2 className="font-bold text-sm text-m-text">All Routes</h2>
              {data && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background:'#EBF3FF', color:'#1467B2' }}>{data.total}</span>}
            </div>
            <input
              type="text" placeholder="Filter by route or ASM…" value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-m-bg border border-m-border rounded-xl px-3 py-1.5 text-xs text-m-text placeholder-m-muted/60 focus:outline-none focus:border-m-blue/40 w-52 transition-colors"
            />
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="w-7 h-7 border-2 border-m-border rounded-full animate-spin mx-auto mb-3" style={{ borderTopColor:'#1467B2' }} />
              <p className="text-m-muted text-sm">Loading routes…</p>
            </div>
          ) : error ? (
            <div className="p-8 flex flex-col items-center gap-3">
              <AlertCircle size={24} className="text-m-muted" />
              <p className="text-m-muted text-sm text-center">{error}</p>
              <p className="text-xs text-m-muted">Make sure ROUTE_SHEET_ID is set in your .env</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center"><Route size={28} className="text-m-border mx-auto mb-3" /><p className="text-m-muted text-sm">No routes found.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-m-border bg-m-bg">
                    {['Route','ASM','Distributors','Invoices','Vehicles',''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-m-muted uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(route => (
                    <tr key={route.routeName} className="border-b border-m-border/60 hover:bg-m-bg cursor-pointer transition-colors group" onClick={() => setSelected(route.routeName)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Route size={13} className="text-m-blue flex-shrink-0" />
                          <span className="text-sm font-semibold text-m-text group-hover:text-m-blue transition-colors">{route.routeName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-m-muted">{route.asmName || '—'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-m-text">{route.distributorCount}</td>
                      <td className="px-4 py-3 text-sm font-mono text-m-text">{route.invoiceCount ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono font-bold ${route.vehicleCount > 0 ? 'text-m-green-dk' : 'text-m-muted'}`}>{route.vehicleCount ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={14} className="text-m-border group-hover:text-m-muted ml-auto transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {selected && <RouteMapPanel routeName={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
