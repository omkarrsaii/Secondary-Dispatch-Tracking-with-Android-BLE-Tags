import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Building2, AlertCircle, Layers, FileText, BarChart3, TrendingUp, Users, CheckCircle2, Clock, Filter, X, MapPin } from 'lucide-react'
import Header from '../components/Header'
import {
  getHierarchyTree, syncHierarchy, getDistributorDetail,
  getClusterKpis, getAsmKpis, getTsoeKpis,
  getActiveInvoiceList, getInvoiceTrackingDetail, getDistributors,
} from '../lib/api'

// Sheet dates are DD.MM.YYYY (e.g. "12.02.2026" = 12th February). Native
// day-month-year order explicitly instead. Kept in sync with the same
// fix in the Distributor Portal's DistributorDashboard.jsx.
function formatInvoiceDate(dateStr) {
  if (!dateStr) return '—'
  const str = String(dateStr).trim()
  const match = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    const d = new Date(Number(year), Number(month) - 1, Number(day))
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
    }
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? str : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function VehicleStatusPill({ status }) {
  if (status === 'Assigned') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-hub-green/15 text-hub-green border border-hub-green/30">
        🟢 Assigned
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-hub-border/40 text-hub-muted border border-hub-border">
      ⚫ Not Assigned
    </span>
  )
}

// ─── Distributor detail flyout ─────────────────────────────────────────────────
function DistributorFlyout({ code, onClose }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    getDistributorDetail(code)
      .then(setDetail)
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [code])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-screen bg-hub-card border-l border-hub-border overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hub-border sticky top-0 bg-hub-card z-10">
          <div>
            <h2 className="font-display font-semibold text-hub-text">Distributor Detail</h2>
            <p className="text-xs text-hub-muted font-mono mt-0.5">{code}</p>
          </div>
          <button onClick={onClose} className="text-hub-muted hover:text-hub-text text-sm px-2 py-1 rounded hover:bg-hub-border/30 transition-colors">
            ✕
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
              <AlertCircle size={14} /><span className="text-sm">{error}</span>
            </div>
          )}
          {detail && !loading && (
            <div className="space-y-4">
              {/* Hierarchy chain — Zone → Cluster → ASM → DD Type → TSOE */}
              <div className="rounded-xl border border-hub-border bg-hub-bg/30 p-4">
                <p className="text-xs text-hub-muted uppercase tracking-wider mb-3">Hierarchy Chain</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { label: detail.region,      color: 'text-hub-accent' },
                    { label: detail.clusterName,  color: 'text-hub-accent2' },
                    { label: detail.asmArea,      color: 'text-hub-green' },   // ← Area now (Change 1)
                    { label: detail.ddType,       color: 'text-hub-yellow' },
                    { label: detail.tsoeName,     color: 'text-hub-text' },
                  ].filter(n => n.label).map((node, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={`font-medium ${node.color}`}>{node.label}</span>
                      {i < arr.length - 1 && <ChevronRight size={12} className="text-hub-muted" />}
                    </span>
                  ))}
                </div>
              </div>

              {/* Fields */}
              {[
                ['Distributor Code', detail.distributorCode, 'mono'],
                ['Distributor Name', detail.distributorName],
                ['Town / City',      detail.townCity],
                ['Status',           detail.status],
                ['ASM Name',         detail.asmName],    // person-name as supplementary info
                ['Route',            detail.route || '—'],
                ['Dist Mobile',      detail.distMobile, 'mono'],
                ['TSOE Mobile',      detail.tsoeMobile, 'mono'],
              ].map(([label, value, style]) => value ? (
                <div key={label} className="flex items-start justify-between border-b border-hub-border/50 pb-2">
                  <span className="text-xs text-hub-muted">{label}</span>
                  <span className={`text-xs text-hub-text text-right ${style === 'mono' ? 'font-mono' : ''}`}>{value}</span>
                </div>
              ) : null)}

              {/* Live data */}
              {detail.liveData && (
                <div className="rounded-xl border border-hub-border bg-hub-bg/30 p-4 mt-2">
                  <p className="text-xs text-hub-muted uppercase tracking-wider mb-3">Live Data</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Invoices', value: detail.liveData.invoiceCount },
                      { label: 'Vehicles', value: detail.liveData.vehicleCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-xl font-bold text-hub-text">{value}</p>
                        <p className="text-xs text-hub-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Invoices — same list, same rule (Status AND Remarks
                  both blank), same service the Distributor Portal itself
                  uses. An ASM sees exactly what the distributor would see. */}
              <div className="rounded-xl border border-hub-border overflow-hidden mt-2">
                <div className="px-4 py-3 bg-hub-bg/40 border-b border-hub-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-hub-accent" />
                    <p className="text-sm font-semibold text-hub-text">Active Invoices</p>
                  </div>
                  <span className="text-xs text-hub-muted font-mono">
                    {detail.totalActiveInvoices ?? detail.activeInvoices?.length ?? 0}
                  </span>
                </div>

                {!detail.activeInvoices || detail.activeInvoices.length === 0 ? (
                  <p className="text-xs text-hub-muted text-center py-6">No active invoices for this distributor.</p>
                ) : (
                  <div className="divide-y divide-hub-border/60 max-h-80 overflow-y-auto">
                    {detail.activeInvoices.map(inv => (
                      <div key={inv.invoiceNo} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-hub-text">{inv.invoiceNo}</p>
                          <p className="text-xs text-hub-muted mt-0.5">{formatInvoiceDate(inv.invoiceDate)}</p>
                        </div>
                        <VehicleStatusPill status={inv.vehicleStatus} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tree node components ──────────────────────────────────────────────────────
// Zone → Cluster → ASM (+ Area) → DD Type → TSOE → Distributor

function DistributorNode({ dist, onSelect }) {
  const active = dist.status?.toLowerCase() === 'active'
  return (
    <button
      onClick={() => onSelect(dist.distributorCode)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-hub-accent/5 hover:border-hub-accent/20 border border-transparent text-left transition-colors w-full group"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-hub-green' : 'bg-hub-muted'}`} />
      <span className="text-xs text-hub-text group-hover:text-hub-accent transition-colors font-mono">{dist.distributorCode}</span>
      {dist.distributorName && (
        <span className="text-xs text-hub-muted truncate">{dist.distributorName}</span>
      )}
      {dist.townCity && (
        <span className="text-xs text-hub-muted ml-auto flex-shrink-0">{dist.townCity}</span>
      )}
    </button>
  )
}

function TsoeNode({ tsoe, onSelect }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-hub-bg/50 transition-colors group"
      >
        <ChevronRight size={13} className={`text-hub-yellow transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-sm text-hub-text group-hover:text-hub-yellow transition-colors">{tsoe.tsoeName}</span>
        <span className="ml-auto text-xs text-hub-muted font-mono">{tsoe.distributors.length}</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-hub-border pl-3">
          {tsoe.distributors.map(d => (
            <DistributorNode key={d.distributorCode} dist={d} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function DdTypeNode({ ddType, onSelect }) {
  const [open, setOpen] = useState(false)
  const distCount = ddType.tsoes.reduce((s, t) => s + t.distributors.length, 0)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-hub-bg/50 transition-colors group"
      >
        <ChevronRight size={13} className={`text-hub-accent2 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-hub-accent2/10 text-hub-accent2 border border-hub-accent2/20">
          {ddType.ddType}
        </span>
        <span className="ml-auto text-xs text-hub-muted">{ddType.tsoes.length} TSOEs · {distCount} dists</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-hub-border pl-3">
          {ddType.tsoes.map(t => (
            <TsoeNode key={t.tsoeName} tsoe={t} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function AsmNode({ asm, onSelect }) {
  const [open, setOpen] = useState(false)
  const tsoeCount = asm.ddTypes.reduce((s, d) => s + d.tsoes.length, 0)
  // asmNames = people who hold/have held this area (may be empty if not yet populated)
  const nameLabel = asm.asmNames?.length > 0 ? asm.asmNames.join(', ') : null
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-hub-bg/50 transition-colors group"
      >
        <ChevronRight size={14} className={`text-hub-green transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-sm font-medium text-hub-text group-hover:text-hub-green transition-colors">{asm.asmArea}</span>
        {nameLabel && (
          <span className="text-xs text-hub-muted px-1.5 py-0.5 rounded bg-hub-border/40 truncate max-w-[160px]" title={nameLabel}>{nameLabel}</span>
        )}
        <span className="ml-auto text-xs text-hub-muted flex-shrink-0">{asm.ddTypes.length} DD types · {tsoeCount} TSOEs</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-hub-border pl-3">
          {asm.ddTypes.map(d => (
            <DdTypeNode key={d.ddType} ddType={d} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClusterNode({ cluster, onSelect }) {
  const [open, setOpen] = useState(false)
  const asmCount  = cluster.asms.length
  const distCount = cluster.asms
    .flatMap(a => a.ddTypes)
    .flatMap(d => d.tsoes)
    .flatMap(t => t.distributors).length
  return (
    <div className="border border-hub-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-4 py-3 bg-hub-bg/40 hover:bg-hub-bg/70 transition-colors"
      >
        <ChevronDown size={15} className={`text-hub-accent2 transition-transform ${open ? '' : '-rotate-90'}`} />
        <Layers size={14} className="text-hub-accent2" />
        <span className="font-semibold text-hub-text">{cluster.clusterName}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-hub-muted">{asmCount} ASMs</span>
          <span className="text-xs text-hub-muted">{distCount} Dists</span>
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-1">
          {cluster.asms.map(a => (
            <AsmNode key={a.asmArea} asm={a} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function ZoneNode({ zone, onSelect }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded-lg hover:bg-hub-bg/40 transition-colors"
      >
        <ChevronDown size={16} className={`text-hub-accent transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-display font-bold text-hub-accent uppercase tracking-wider text-sm">{zone.zone}</span>
        <span className="ml-auto text-xs text-hub-muted">{zone.clusters.length} clusters</span>
      </button>
      {open && (
        <div className="space-y-2 ml-2">
          {zone.clusters.map(c => (
            <ClusterNode key={c.clusterName} cluster={c} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Performance KPIs panel (ASM / TSOE) ───────────────────────────────────────
// New "Performance" tab: pick a level (ASM or TSOE), pick a name, see the
// 5 KPI metrics for that group. Reuses the same backend rule the rest of
// the app already uses for active invoices — these numbers will always
// match what you'd see drilling into individual distributors.

function KpiCard({ icon: Icon, label, value, suffix = '', color = 'text-hub-text', sub = null }) {
  return (
    <div className="rounded-xl border border-hub-border bg-hub-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <p className="text-xs text-hub-muted uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${color}`}>
        {value}{suffix}
      </p>
      {sub && <p className="text-xs text-hub-muted mt-1">{sub}</p>}
    </div>
  )
}

// ─── Invoice tracking modal (row-click from the Active Invoice List) ──────────
// Reuses the same backend invoice data already used everywhere else in the
// app — there's no separate client-tracker app/portal involved here, just
// an inline modal on top of the existing Hierarchy page.
function InvoiceTrackingModal({ invoiceNo, onClose }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    getInvoiceTrackingDetail(invoiceNo)
      .then(setDetail)
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [invoiceNo])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-hub-card border border-hub-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hub-border">
          <div>
            <h2 className="font-display font-semibold text-hub-text">Tracking</h2>
            <p className="text-xs text-hub-muted font-mono mt-0.5">{invoiceNo}</p>
          </div>
          <button onClick={onClose} className="text-hub-muted hover:text-hub-text p-1 rounded hover:bg-hub-border/30 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
              <AlertCircle size={14} /><span className="text-sm">{error}</span>
            </div>
          )}
          {detail && !loading && !error && (
            <div className="space-y-3">
              <div className="flex items-center justify-center py-2">
                <VehicleStatusPill status={detail.vehicleStatus} />
              </div>
              {[
                ['Distributor',     `${detail.distributorName || ''} ${detail.distributorCode ? `(${detail.distributorCode})` : ''}`.trim()],
                ['ASM Area',        detail.asmArea],
                ['HQ',              detail.tsoeName],
                ['Status',          detail.status],
                ['Vehicle No.',     detail.vehicleNo || '—'],
                ['Invoice Date',    formatInvoiceDate(detail.invoiceDate)],
                ['Appointment Date', formatInvoiceDate(detail.appointmentDate)],
                ['Age',             detail.ageDays != null ? `${detail.ageDays} day(s)` : '—'],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between border-b border-hub-border/50 pb-2">
                  <span className="text-xs text-hub-muted">{label}</span>
                  <span className="text-xs text-hub-text text-right">{value}</span>
                </div>
              ))}

              {/* Live GPS section — only renders when vehicle has a device (Change 2) */}
              {detail.tracking && (
                <div className="rounded-lg border border-hub-border/60 bg-hub-bg/30 p-3 space-y-2 mt-1">
                  <p className="text-xs text-hub-muted uppercase tracking-wider">Live Location</p>
                  {detail.tracking.lastSeen && (
                    <div className="flex items-start justify-between">
                      <span className="text-xs text-hub-muted">Last Seen</span>
                      <span className="text-xs text-hub-text text-right">{detail.tracking.lastSeen}</span>
                    </div>
                  )}
                  {detail.tracking.latitude != null && (
                    <div className="flex items-start justify-between">
                      <span className="text-xs text-hub-muted">Coordinates</span>
                      <span className="text-xs font-mono text-hub-text text-right">
                        {detail.tracking.latitude.toFixed(5)}, {detail.tracking.longitude.toFixed(5)}
                      </span>
                    </div>
                  )}
                  {detail.tracking.battery && (
                    <div className="flex items-start justify-between">
                      <span className="text-xs text-hub-muted">Battery</span>
                      <span className="text-xs text-hub-text">{detail.tracking.battery}</span>
                    </div>
                  )}
                  {detail.tracking.mapsUrl && (
                    <a
                      href={detail.tracking.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-lg bg-hub-accent/10 border border-hub-accent/30 text-hub-accent text-xs font-medium hover:bg-hub-accent/20 transition-colors"
                    >
                      <MapPin size={12} /> View on Map
                    </a>
                  )}
                  {!detail.tracking.latitude && !detail.tracking.lastSeen && (
                    <p className="text-xs text-hub-muted text-center">Device found but no location data yet.</p>
                  )}
                </div>
              )}
              {!detail.tracking && (
                <p className="text-xs text-hub-muted text-center pt-1">No vehicle tracking device assigned.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Performance KPIs panel (Cluster → ASM / TSOE drill-down) ─────────────────
// Pick a Cluster first, then optionally drill down to a specific ASM or
// TSOE within it. KPI cards + the Active Invoice List below them always
// reflect the same scope and the same Date Range / Distributor filters —
// the Invoice Status filter (Active/Overdue) only narrows the list itself.

function PerformancePanel({ clusters, asmsFlat, tsoesFlat }) {
  const [selectedCluster, setSelectedCluster] = useState('')
  const [level, setLevel]     = useState('cluster') // 'cluster' | 'asm' | 'tsoe'
  const [name, setName]       = useState('')

  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')
  const [distributorFilter, setDistributorFilter] = useState('')
  const [invoiceState, setInvoiceState]     = useState('all') // 'all' | 'active' | 'overdue'
  const [distributorOptions, setDistributorOptions] = useState([])

  const [kpis, setKpis]         = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [trackingInvoice, setTrackingInvoice] = useState(null)

  // Default to the first cluster once the list loads.
  useEffect(() => {
    if (!selectedCluster && clusters.length) setSelectedCluster(clusters[0])
  }, [clusters, selectedCluster])

  const asmOptions = Array.from(
    new Set(asmsFlat.filter(a => a.clusterName === selectedCluster).map(a => a.asmArea))
  ).sort()
  const tsoeOptions = Array.from(
    new Set(tsoesFlat.filter(t => t.clusterName === selectedCluster).map(t => t.tsoeName))
  ).sort()

  // Reset the drill-down name whenever cluster or level changes.
  useEffect(() => {
    if (level === 'asm')  setName(asmOptions[0] || '')
    else if (level === 'tsoe') setName(tsoeOptions[0] || '')
    else setName('')
    setDistributorFilter('') // distributor list will change scope too
  }, [level, selectedCluster]) // eslint-disable-line react-hooks/exhaustive-deps

  // Distributor filter options, scoped to the current cluster/ASM/TSOE.
  useEffect(() => {
    if (!selectedCluster) return
    const params = { cluster: selectedCluster }
    if (level === 'asm' && name)  params.asm  = name
    if (level === 'tsoe' && name) params.tsoe = name
    getDistributors(params)
      .then(d => setDistributorOptions(d.distributors || []))
      .catch(() => setDistributorOptions([]))
  }, [selectedCluster, level, name])

  // Main data load: KPI cards + Active Invoice List, same scope & filters.
  useEffect(() => {
    const scopeName = level === 'cluster' ? selectedCluster : name
    if (!scopeName) { setKpis(null); setInvoices([]); return }

    setLoading(true); setError(null)
    const filterParams = {
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
      distributorCode: distributorFilter || undefined,
    }
    const kpiFetcher =
      level === 'cluster' ? getClusterKpis(scopeName, filterParams) :
      level === 'asm'     ? getAsmKpis(scopeName, filterParams)     :
                             getTsoeKpis(scopeName, filterParams)

    Promise.all([
      kpiFetcher,
      getActiveInvoiceList({ scope: level, name: scopeName, ...filterParams, invoiceState }),
    ])
      .then(([k, list]) => { setKpis(k); setInvoices(list.invoices || []) })
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [level, selectedCluster, name, dateFrom, dateTo, distributorFilter, invoiceState])

  // Hierarchy-aware columns — drop the levels already implied by the current scope.
  const showAsmCol  = level === 'cluster'
  const showHqCol   = level === 'cluster' || level === 'asm'

  return (
    <div className="space-y-4">
      {/* Cluster selector — always required, drives everything below */}
      <div className="rounded-xl border border-hub-border bg-hub-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Layers size={14} className="text-hub-accent2 flex-shrink-0" />
          <label className="text-xs text-hub-muted uppercase tracking-wider flex-shrink-0">Cluster</label>
          <select
            value={selectedCluster}
            onChange={e => setSelectedCluster(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-sm text-hub-text focus:outline-none focus:border-hub-accent/50"
          >
            {clusters.length === 0 && <option value="">No clusters found</option>}
            {clusters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex rounded-lg border border-hub-border overflow-hidden">
            {['cluster', 'asm', 'tsoe'].map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  level === l ? 'bg-hub-accent/15 text-hub-accent' : 'text-hub-muted hover:bg-hub-bg/50'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {level !== 'cluster' && (
            <select
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-sm text-hub-text focus:outline-none focus:border-hub-accent/50"
            >
              {(level === 'asm' ? asmOptions : tsoeOptions).length === 0 &&
                <option value="">No {level === 'asm' ? 'ASMs' : 'TSOEs'} in this cluster</option>}
              {(level === 'asm' ? asmOptions : tsoeOptions).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Filters — narrow the KPI cards AND the Active Invoice List together */}
      <div className="rounded-xl border border-hub-border bg-hub-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-hub-muted flex-shrink-0" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-hub-muted">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-xs text-hub-text focus:outline-none focus:border-hub-accent/50" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-hub-muted">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-xs text-hub-text focus:outline-none focus:border-hub-accent/50" />
          </div>

          <select
            value={distributorFilter}
            onChange={e => setDistributorFilter(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-xs text-hub-text focus:outline-none focus:border-hub-accent/50"
          >
            <option value="">All Distributors</option>
            {distributorOptions.map(d => (
              <option key={d.distributorCode} value={d.distributorCode}>{d.distributorName || d.distributorCode}</option>
            ))}
          </select>

          <select
            value={invoiceState}
            onChange={e => setInvoiceState(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-hub-bg/40 border border-hub-border text-xs text-hub-text focus:outline-none focus:border-hub-accent/50"
          >
            <option value="all">All Active</option>
            <option value="active">On-Time Only</option>
            <option value="overdue">Overdue Only</option>
          </select>

          {(dateFrom || dateTo || distributorFilter || invoiceState !== 'all') && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setDistributorFilter(''); setInvoiceState('all') }}
              className="text-xs text-hub-muted hover:text-hub-text underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
          <AlertCircle size={14} /><span className="text-sm">{error}</span>
        </div>
      )}

      {kpis && !loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard icon={Users}        label="Distributors"       value={kpis.distributorCount} color="text-hub-text" />
          <KpiCard icon={FileText}     label="Total Invoices"     value={kpis.totalInvoices}    color="text-hub-accent" />
          <KpiCard icon={TrendingUp}   label="Active"             value={kpis.activeInvoices}   color="text-hub-yellow" />
          <KpiCard icon={CheckCircle2} label="Completion Rate"    value={kpis.completionRate} suffix="%" color="text-hub-green"
            sub={`${kpis.completedInvoices} of ${kpis.totalInvoices} completed`} />
          <KpiCard icon={Clock}        label="Overdue (active)"   value={kpis.overdueInvoices}  color={kpis.overdueInvoices > 0 ? 'text-hub-red' : 'text-hub-muted'} />
        </div>
      )}

      {/* Active Invoice List — hierarchy-aware columns, click a row to track */}
      {!loading && !error && kpis && (
        <div className="rounded-xl border border-hub-border bg-hub-card overflow-hidden">
          <div className="px-5 py-4 border-b border-hub-border flex items-center gap-2">
            <FileText size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-sm text-hub-text">Active Invoice List</h2>
            <span className="ml-auto text-xs text-hub-muted font-mono">{invoices.length}</span>
          </div>

          {invoices.length === 0 ? (
            <p className="text-hub-muted text-sm text-center py-8">No active invoices match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-hub-muted uppercase tracking-wider border-b border-hub-border">
                    <th className="px-4 py-2.5 font-medium">Invoice No</th>
                    {showAsmCol && <th className="px-4 py-2.5 font-medium">ASM Area</th>}
                    {showHqCol  && <th className="px-4 py-2.5 font-medium">HQ</th>}
                    <th className="px-4 py-2.5 font-medium">Distributor</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Vehicle</th>
                    <th className="px-4 py-2.5 font-medium">Last Updated</th>
                    <th className="px-4 py-2.5 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hub-border/60">
                  {invoices.map(inv => (
                    <tr
                      key={inv.invoiceNo}
                      onClick={() => setTrackingInvoice(inv.invoiceNo)}
                      className="cursor-pointer hover:bg-hub-bg/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-hub-text whitespace-nowrap">{inv.invoiceNo}</td>
                      {showAsmCol && <td className="px-4 py-2.5 text-hub-text whitespace-nowrap">{inv.asmArea || '—'}</td>}
                      {showHqCol  && <td className="px-4 py-2.5 text-hub-text whitespace-nowrap">{inv.tsoeName || '—'}</td>}
                      <td className="px-4 py-2.5 text-hub-text whitespace-nowrap">{inv.distributorName || inv.distributorCode}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          inv.isOverdue ? 'bg-hub-red/15 text-hub-red border border-hub-red/30' : 'bg-hub-yellow/15 text-hub-yellow border border-hub-yellow/30'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><VehicleStatusPill status={inv.vehicleStatus} /></td>
                      <td className="px-4 py-2.5 text-hub-muted whitespace-nowrap">{formatInvoiceDate(inv.lastUpdated)}</td>
                      <td className="px-4 py-2.5 text-hub-muted whitespace-nowrap">{inv.ageDays != null ? `${inv.ageDays}d` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {trackingInvoice && (
        <InvoiceTrackingModal invoiceNo={trackingInvoice} onClose={() => setTrackingInvoice(null)} />
      )}
    </div>
  )
}


export default function HierarchyPage() {
  const [tab, setTab]           = useState('tree') // 'tree' | 'performance'
  const [tree, setTree]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getHierarchyTree()
      .then(d => setTree(d.tree))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try { await syncHierarchy(); load() } catch { /* ignore */ } finally { setSyncing(false) }
  }

  const allClusters = (tree || []).flatMap(z => z.clusters)
  const allAsms      = allClusters.flatMap(c => c.asms)
  const allDdTypes   = allAsms.flatMap(a => a.ddTypes)
  const allTsoes     = allDdTypes.flatMap(d => d.tsoes)
  const totalDists   = allTsoes.flatMap(t => t.distributors).length

  // Cluster-aware flattening for the Performance panel — same tree data,
  // just carrying clusterName (and asmArea, for TSOEs) along so the panel
  // can filter ASMs/TSOEs down to the selected cluster.
  const clusterNames = allClusters.map(c => c.clusterName).sort()
  const asmsFlat = allClusters.flatMap(c =>
    c.asms.map(a => ({ asmArea: a.asmArea, asmNames: a.asmNames, clusterName: c.clusterName }))
  )
  const tsoesFlat = allClusters.flatMap(c =>
    c.asms.flatMap(a =>
      a.ddTypes.flatMap(d =>
        d.tsoes.map(t => ({ tsoeName: t.tsoeName, clusterName: c.clusterName, asmArea: a.asmArea }))
      )
    )
  )

  return (
    <div className="min-h-screen">
      <Header title="Organisation Hierarchy" status={null} refreshing={syncing} onRefresh={handleSync} />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Tab switcher */}
        <div className="flex rounded-lg border border-hub-border overflow-hidden w-fit">
          {[
            { key: 'tree',        label: 'Tree',        icon: Building2 },
            { key: 'performance', label: 'Performance', icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                tab === key ? 'bg-hub-accent/15 text-hub-accent' : 'text-hub-muted hover:bg-hub-bg/50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {tab === 'tree' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Zones',        value: tree?.length ?? '—',        color: 'text-hub-accent' },
            { label: 'Clusters',     value: allClusters.length || '—',  color: 'text-hub-accent2' },
            { label: 'ASMs',         value: allAsms.length || '—',      color: 'text-hub-green' },
            { label: 'TSOEs',        value: allTsoes.length || '—',     color: 'text-hub-yellow' },
            { label: 'Distributors', value: totalDists || '—',          color: 'text-hub-text' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-hub-border bg-hub-card p-4">
              <p className="text-xs text-hub-muted uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-display font-bold mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
        )}

        {/* Tree */}
        {tab === 'tree' && (
        <div className="rounded-xl border border-hub-border bg-hub-card">
          <div className="px-5 py-4 border-b border-hub-border flex items-center gap-2">
            <Building2 size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-sm text-hub-text">
              Zone → Cluster → ASM → DD Type → TSOE → Distributor
            </h2>
          </div>
          <div className="p-5">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center gap-3 py-8">
                <AlertCircle size={28} className="text-hub-muted" />
                <p className="text-hub-muted text-sm text-center">{error}</p>
                <p className="text-xs text-hub-muted">Make sure HIERARCHY_SHEET_ID is set in your .env</p>
              </div>
            )}
            {tree && !loading && tree.length === 0 && (
              <p className="text-hub-muted text-sm text-center py-8">No hierarchy data found.</p>
            )}
            {tree && !loading && tree.length > 0 && (
              <div className="space-y-4">
                {tree.map(zone => (
                  <ZoneNode key={zone.zone} zone={zone} onSelect={setSelected} />
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Performance */}
        {tab === 'performance' && (
          <PerformancePanel clusters={clusterNames} asmsFlat={asmsFlat} tsoesFlat={tsoesFlat} />
        )}
      </div>

      {selected && (
        <DistributorFlyout code={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
