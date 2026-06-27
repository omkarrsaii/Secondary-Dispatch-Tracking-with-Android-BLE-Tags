import { useState, useRef, useEffect } from 'react'
import { Search, FileText, Truck, Building2, Route, MapPin, ChevronRight, AlertCircle, X, Battery } from 'lucide-react'
import Header from '../components/Header'
import { globalSearch, getInvoiceTrackingDetail, getDistributorDetail } from '../lib/api'
import { useNavigate } from 'react-router-dom'

// ─── Type config ─────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  invoice:     { icon: FileText,   color: 'text-hub-accent',  bg: 'bg-hub-accent/10',  label: 'Invoice' },
  vehicle:     { icon: Truck,      color: 'text-hub-green',   bg: 'bg-hub-green/10',   label: 'Vehicle' },
  distributor: { icon: Building2,  color: 'text-hub-accent2', bg: 'bg-hub-accent2/10', label: 'Distributor' },
  route:       { icon: Route,      color: 'text-hub-yellow',  bg: 'bg-hub-yellow/10',  label: 'Route' },
}

const FILTERS = [
  { value: '',            label: 'All' },
  { value: 'invoice',     label: 'Invoices' },
  { value: 'vehicle',     label: 'Vehicles' },
  { value: 'distributor', label: 'Distributors' },
  { value: 'route',       label: 'Routes' },
]

// ─── Shared date formatter (DD.MM.YYYY → "12 Feb 2026") ─────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—'
  const str = String(dateStr).trim()
  const match = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    const d = new Date(Number(year), Number(month) - 1, Number(day))
    if (!isNaN(d.getTime()))
      return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? str : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

// ─── Shared modal shell ───────────────────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-hub-card border border-hub-border rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hub-border flex-shrink-0">
          <div>
            <h2 className="font-display font-semibold text-hub-text">{title}</h2>
            {subtitle && <p className="text-xs text-hub-muted font-mono mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-hub-muted hover:text-hub-text p-1 rounded hover:bg-hub-border/30 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// Reusable key-value row
function DetailRow({ label, value, mono = false }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between border-b border-hub-border/50 pb-2">
      <span className="text-xs text-hub-muted flex-shrink-0">{label}</span>
      <span className={`text-xs text-hub-text text-right ml-4 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// Spinner
function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
    </div>
  )
}

// ─── Invoice Detail Modal (Change 3) ─────────────────────────────────────────
// Calls the same /api/hierarchy/invoices/:invoiceNo endpoint the Hierarchy
// page uses — which after Change 2 also returns live GPS coords + lastSeen.

function InvoiceDetailModal({ invoiceNo, onClose }) {
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
    <ModalShell title="Invoice Detail" subtitle={invoiceNo} onClose={onClose}>
      {loading && <Spinner />}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
          <AlertCircle size={14} /><span className="text-sm">{error}</span>
        </div>
      )}
      {detail && !loading && !error && (
        <div className="space-y-3">
          {/* Status badge */}
          <div className="flex justify-center py-1">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              detail.isOverdue
                ? 'bg-hub-red/15 text-hub-red border border-hub-red/30'
                : 'bg-hub-yellow/15 text-hub-yellow border border-hub-yellow/30'
            }`}>
              {detail.status || 'Active'}
            </span>
          </div>

          {/* Core invoice fields */}
          <div className="space-y-2">
            <DetailRow label="Distributor"    value={`${detail.distributorName || ''} (${detail.distributorCode || ''})`.trim()} />
            <DetailRow label="ASM Area"       value={detail.asmArea} />
            <DetailRow label="HQ"             value={detail.tsoeName} />
            <DetailRow label="Vehicle No."    value={detail.vehicleNo || '—'} />
            <DetailRow label="Invoice Date"   value={formatDate(detail.invoiceDate)} />
            <DetailRow label="Appt. Date"     value={formatDate(detail.appointmentDate)} />
            <DetailRow label="Age"            value={detail.ageDays != null ? `${detail.ageDays} day(s)` : null} />
          </div>

          {/* Live GPS — only shown when device is assigned and has reported */}
          {detail.tracking && (
            <div className="rounded-lg border border-hub-border/60 bg-hub-bg/30 p-3 space-y-2 mt-1">
              <p className="text-xs text-hub-muted uppercase tracking-wider">Live Location</p>
              {detail.tracking.lastSeen && (
                <DetailRow label="Last Seen"    value={detail.tracking.lastSeen} />
              )}
              {detail.tracking.latitude != null && (
                <DetailRow label="Coordinates"
                  value={`${detail.tracking.latitude.toFixed(5)}, ${detail.tracking.longitude.toFixed(5)}`}
                  mono />
              )}
              {detail.tracking.city && (
                <DetailRow label="Location" value={[detail.tracking.city, detail.tracking.state].filter(Boolean).join(', ')} />
              )}
              {detail.tracking.battery && (
                <DetailRow label="Battery" value={detail.tracking.battery} />
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
            <p className="text-xs text-hub-muted text-center pt-1">No tracking device assigned to this vehicle.</p>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ─── Distributor Detail Modal (Change 3) ─────────────────────────────────────
// Calls the same /api/hierarchy/distributor/:code endpoint the Hierarchy
// page's DistributorFlyout uses — same data, same rule, compact modal form.

function DistributorDetailModal({ distributorCode, onClose }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    getDistributorDetail(distributorCode)
      .then(setDetail)
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [distributorCode])

  return (
    <ModalShell title="Distributor Detail" subtitle={distributorCode} onClose={onClose}>
      {loading && <Spinner />}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
          <AlertCircle size={14} /><span className="text-sm">{error}</span>
        </div>
      )}
      {detail && !loading && !error && (
        <div className="space-y-3">
          {/* Hierarchy chain */}
          <div className="rounded-xl border border-hub-border bg-hub-bg/30 p-3">
            <p className="text-xs text-hub-muted uppercase tracking-wider mb-2">Hierarchy Chain</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { label: detail.region,      color: 'text-hub-accent' },
                { label: detail.clusterName,  color: 'text-hub-accent2' },
                { label: detail.asmArea,      color: 'text-hub-green' },
                { label: detail.ddType,       color: 'text-hub-yellow' },
                { label: detail.tsoeName,     color: 'text-hub-text' },
              ].filter(n => n.label).map((node, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={`font-medium ${node.color}`}>{node.label}</span>
                  {i < arr.length - 1 && <ChevronRight size={11} className="text-hub-muted" />}
                </span>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <DetailRow label="Distributor Name"  value={detail.distributorName} />
            <DetailRow label="Town / City"       value={detail.townCity} />
            <DetailRow label="Status"            value={detail.status} />
            <DetailRow label="ASM Name"          value={detail.asmName} />
            <DetailRow label="Route"             value={detail.route || '—'} />
            <DetailRow label="Dist Mobile"       value={detail.distMobile}  mono />
            <DetailRow label="TSOE Mobile"       value={detail.tsoeMobile}  mono />
          </div>

          {/* Live data */}
          {detail.liveData && (
            <div className="rounded-xl border border-hub-border bg-hub-bg/30 p-3">
              <p className="text-xs text-hub-muted uppercase tracking-wider mb-2">Live Data</p>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xl font-bold text-hub-text">{detail.liveData.invoiceCount}</p>
                  <p className="text-xs text-hub-muted">Invoices</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-hub-text">{detail.liveData.vehicleCount}</p>
                  <p className="text-xs text-hub-muted">Vehicles</p>
                </div>
              </div>
            </div>
          )}

          {/* Active invoices count */}
          {detail.totalActiveInvoices > 0 && (
            <p className="text-xs text-hub-muted text-center">
              {detail.totalActiveInvoices} active invoice(s) for this distributor.
            </p>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ─── Vehicle Detail Modal (Change 3) ─────────────────────────────────────────
// Uses data already returned by the search result — no extra API call needed.

function VehicleDetailModal({ vehicle, onClose }) {
  return (
    <ModalShell title="Vehicle Detail" subtitle={vehicle.id} onClose={onClose}>
      <div className="space-y-2">
        <DetailRow label="Vehicle No."   value={vehicle.id}          mono />
        <DetailRow label="Device"        value={vehicle.deviceName}  mono />
        <DetailRow label="Invoice Count" value={vehicle.invoiceCount != null ? String(vehicle.invoiceCount) : null} />
        <DetailRow label="Last Seen"     value={vehicle.lastSeen} />
        <DetailRow label="Battery"       value={vehicle.battery} />
        <DetailRow label="Location"      value={vehicle.location} />
        {vehicle.lat && vehicle.lng && (
          <a
            href={`https://www.google.com/maps?q=${vehicle.lat},${vehicle.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full mt-2 px-3 py-1.5 rounded-lg bg-hub-accent/10 border border-hub-accent/30 text-hub-accent text-xs font-medium hover:bg-hub-accent/20 transition-colors"
          >
            <MapPin size={12} /> View on Map
          </a>
        )}
        {!vehicle.deviceName && (
          <p className="text-xs text-hub-muted text-center pt-2">No tracking device assigned.</p>
        )}
      </div>
    </ModalShell>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, onSelect }) {
  const navigate  = useNavigate()
  const config    = TYPE_CONFIG[result.type] || TYPE_CONFIG.invoice
  const Icon      = config.icon

  const handleClick = () => {
    if (result.type === 'route') {
      navigate('/routes')
      return
    }
    onSelect(result)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left flex items-start gap-4 p-4 rounded-xl border border-hub-border bg-hub-card hover:border-hub-accent/30 hover:bg-hub-bg/40 transition-all group"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
        <Icon size={16} className={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
            {config.label}
          </span>
          <span className="text-sm font-medium text-hub-text group-hover:text-hub-accent transition-colors truncate">
            {result.title}
          </span>
        </div>
        <p className="text-xs text-hub-muted truncate">{result.subtitle}</p>
        {result.location && (
          <p className="text-xs text-hub-muted flex items-center gap-1 mt-0.5">
            <MapPin size={11} className="text-hub-accent" /> {result.location}
          </p>
        )}
        {result.type !== 'route' && (
          <p className="text-xs text-hub-accent mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view details →
          </p>
        )}
      </div>
      <ChevronRight size={15} className="text-hub-muted group-hover:text-hub-accent transition-colors flex-shrink-0 mt-1" />
    </button>
  )
}

// ─── SearchPage ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery]     = useState('')
  const [typeFilter, setType] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Modal state
  const [selectedResult, setSelectedResult] = useState(null)   // the raw search result object

  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = (q, type) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true); setError(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      globalSearch(q, type)
        .then(setResults)
        .catch(e => setError(e.response?.data?.message || e.message))
        .finally(() => setLoading(false))
    }, 300)
  }

  const handleInput = e => {
    setQuery(e.target.value)
    doSearch(e.target.value, typeFilter)
  }

  const handleTypeChange = t => {
    setType(t)
    doSearch(query, t)
  }

  // Group results by type
  const grouped = results
    ? FILTERS.slice(1).reduce((acc, f) => {
        const items = results.results.filter(r => r.type === f.value)
        if (items.length) acc.push({ label: f.label, items })
        return acc
      }, [])
    : []

  return (
    <div className="min-h-screen">
      <Header title="Global Search" status={null} />

      <div className="p-6 max-w-3xl mx-auto space-y-5 animate-fade-in">
        {/* Search input */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-hub-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="Search invoices, vehicles, distributors, routes…"
            className="w-full bg-hub-card border border-hub-border rounded-xl pl-11 pr-4 py-3.5 text-hub-text placeholder-hub-muted focus:outline-none focus:border-hub-accent/50 text-sm"
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
          )}
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleTypeChange(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                typeFilter === f.value
                  ? 'bg-hub-accent/10 text-hub-accent border-hub-accent/30'
                  : 'bg-hub-card text-hub-muted border-hub-border hover:text-hub-text hover:border-hub-accent/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-4">
            <AlertCircle size={16} /><span className="text-sm">{error}</span>
          </div>
        )}

        {results && results.total === 0 && (
          <div className="text-center py-12">
            <Search size={32} className="text-hub-border mx-auto mb-3" />
            <p className="text-hub-muted text-sm">No results for "{query}"</p>
            <p className="text-hub-muted text-xs mt-1">Try a different search term or filter.</p>
          </div>
        )}

        {grouped.map(({ label, items }) => (
          <div key={label}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-hub-muted uppercase tracking-wider">{label}</span>
              <span className="text-xs text-hub-muted font-mono">({items.length})</span>
            </div>
            <div className="space-y-2">
              {items.map((r, i) => (
                <ResultCard key={i} result={r} onSelect={setSelectedResult} />
              ))}
            </div>
          </div>
        ))}

        {!query && !results && (
          <div className="text-center py-16">
            <Search size={40} className="text-hub-border mx-auto mb-4" />
            <p className="text-hub-muted text-sm">Start typing to search across all data</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-hub-muted">
              {['Invoice number', 'Vehicle number', 'Distributor code', 'Route name', 'ASM Area'].map(hint => (
                <span key={hint} className="px-2 py-1 bg-hub-card border border-hub-border rounded-lg">{hint}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail modals — rendered outside the scroll container */}
      {selectedResult?.type === 'invoice' && (
        <InvoiceDetailModal
          invoiceNo={selectedResult.id}
          onClose={() => setSelectedResult(null)}
        />
      )}
      {selectedResult?.type === 'distributor' && (
        <DistributorDetailModal
          distributorCode={selectedResult.id}
          onClose={() => setSelectedResult(null)}
        />
      )}
      {selectedResult?.type === 'vehicle' && (
        <VehicleDetailModal
          vehicle={selectedResult}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}
