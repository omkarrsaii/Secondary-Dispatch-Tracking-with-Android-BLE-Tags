import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Building2, AlertCircle, Layers, FileText } from 'lucide-react'
import Header from '../components/Header'
import { getHierarchyTree, syncHierarchy, getDistributorDetail } from '../lib/api'

// Sheet dates are DD.MM.YYYY (e.g. "12.02.2026" = 12th February). Native
// `new Date()` misreads dot-separated dates as MM.DD.YYYY — parse the
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
                    { label: detail.asmName,      color: 'text-hub-green' },
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
                ['ASM Area',         detail.asmArea],
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
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-hub-bg/50 transition-colors group"
      >
        <ChevronRight size={14} className={`text-hub-green transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-sm font-medium text-hub-text group-hover:text-hub-green transition-colors">{asm.asmName}</span>
        {asm.asmArea && (
          <span className="text-xs text-hub-muted px-1.5 py-0.5 rounded bg-hub-border/40">{asm.asmArea}</span>
        )}
        <span className="ml-auto text-xs text-hub-muted">{asm.ddTypes.length} DD types · {tsoeCount} TSOEs</span>
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
            <AsmNode key={a.asmName} asm={a} onSelect={onSelect} />
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

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function HierarchyPage() {
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

  return (
    <div className="min-h-screen">
      <Header title="Organisation Hierarchy" status={null} refreshing={syncing} onRefresh={handleSync} />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Stats bar */}
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

        {/* Tree */}
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
      </div>

      {selected && (
        <DistributorFlyout code={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
