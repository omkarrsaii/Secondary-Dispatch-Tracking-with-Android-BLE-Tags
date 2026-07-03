import { useState, useRef, useEffect } from 'react'
import { Search, FileText, Truck, Building2, Route, MapPin, ChevronRight, AlertCircle, X, Battery } from 'lucide-react'
import Header from '../components/Header'
import { globalSearch, getInvoiceTrackingDetail, getDistributorDetail } from '../lib/api'
import { useNavigate } from 'react-router-dom'

const MB = '#1467B2'
const MG = '#7DC242'

const TYPE_CONFIG = {
  invoice:     { icon: FileText,  color: 'text-m-blue',    bg: 'bg-m-blue-50',   label: 'Invoice' },
  vehicle:     { icon: Truck,     color: 'text-m-green-dk', bg: 'bg-m-green-50',  label: 'Vehicle' },
  distributor: { icon: Building2, color: 'text-m-blue-lt',  bg: 'bg-m-blue-50',   label: 'Distributor' },
  route:       { icon: Route,     color: 'text-m-amber',    bg: 'bg-m-amber-50',  label: 'Route' },
}

const FILTERS = [
  { value: '',            label: 'All' },
  { value: 'invoice',     label: 'Invoices' },
  { value: 'vehicle',     label: 'Vehicles' },
  { value: 'distributor', label: 'Distributors' },
  { value: 'route',       label: 'Routes' },
]

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).trim()
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (m) { const d = new Date(Number(m[3]), Number(m[2])-1, Number(m[1])); if (!isNaN(d)) return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(d) }
  const d = new Date(s); return isNaN(d) ? s : new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(d)
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-m-text/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-m-surface border border-m-border rounded-xl overflow-hidden max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-m-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-m-text">{title}</h2>
            {subtitle && <p className="text-xs text-m-muted font-mono mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-m-muted hover:text-m-text p-1 rounded hover:bg-m-border/30 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono = false }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between border-b border-m-border/50 pb-2">
      <span className="text-xs text-m-muted flex-shrink-0">{label}</span>
      <span className={`text-xs text-m-text text-right ml-4 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-m-border rounded-full animate-spin" style={{ borderTopColor:MB }} /></div>
}

function VehicleStatusPill({ status }) {
  if (status === 'Assigned') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ background:'rgba(94,159,43,.12)', color:'#5E9F2B', borderColor:'rgba(94,159,43,.25)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />Assigned
    </span>
  )
  if (status === 'Trip Completed') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ background:'rgba(11,111,203,.10)', color:'#0B6FCB', borderColor:'rgba(11,111,203,.25)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />Trip Completed
    </span>
  )
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-m-bg border border-m-border text-m-muted">Not Assigned</span>
}

function InvoiceDetailModal({ invoiceNo, onClose }) {
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null)
  useEffect(() => { setLoading(true); setError(null); getInvoiceTrackingDetail(invoiceNo).then(setDetail).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false)) }, [invoiceNo])
  return (
    <ModalShell title="Invoice Detail" subtitle={invoiceNo} onClose={onClose}>
      {loading && <Spinner />}
      {error && <div className="flex items-center gap-2 text-m-red bg-m-red-50 border border-m-red/25 rounded-xl p-3"><AlertCircle size={13}/><span className="text-sm">{error}</span></div>}
      {detail && !loading && !error && (
        <div className="space-y-3">
          <div className="flex justify-center py-1"><VehicleStatusPill status={detail.vehicleStatus} /></div>
          <div className="space-y-2">
            <DetailRow label="Distributor"   value={`${detail.distributorName||''} (${detail.distributorCode||''})`.trim()} />
            <DetailRow label="ASM Area"      value={detail.asmArea} />
            <DetailRow label="HQ"            value={detail.tsoeName} />
            <DetailRow label="Vehicle No."   value={detail.vehicleNo||'—'} />
            <DetailRow label="Invoice Date"  value={formatDate(detail.invoiceDate)} />
            <DetailRow label="Appt. Date"    value={formatDate(detail.appointmentDate)} />
            <DetailRow label="Age"           value={detail.ageDays!=null ? `${detail.ageDays} day(s)` : null} />
          </div>
          {detail.tracking && (
            <div className="rounded-xl border border-m-border bg-m-bg p-3 space-y-2 mt-1">
              <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold">Live Location</p>
              {detail.tracking.lastSeen && <DetailRow label="Last Seen" value={detail.tracking.lastSeen} />}
              {detail.tracking.latitude != null && <DetailRow label="Coordinates" value={`${detail.tracking.latitude.toFixed(5)}, ${detail.tracking.longitude.toFixed(5)}`} mono />}
              {detail.tracking.battery && <DetailRow label="Battery" value={detail.tracking.battery} />}
              {detail.tracking.mapsUrl && (
                <a href={detail.tracking.mapsUrl} target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors"
                   style={{ background:MB }}>
                  <MapPin size={11} /> View on Map
                </a>
              )}
            </div>
          )}
          {/* Trip completed — the vehicle may already be on its next delivery,
              so its current location is no longer relevant to this invoice. */}
          {!detail.tracking && detail.trackingAvailable === false && (
            <p className="text-xs text-m-muted text-center pt-1">Tracking unavailable – Trip completed.</p>
          )}
          {!detail.tracking && detail.trackingAvailable !== false && (
            <p className="text-xs text-m-muted text-center pt-1">No tracking device assigned to this vehicle.</p>
          )}
        </div>
      )}
    </ModalShell>
  )
}

function DistributorDetailModal({ distributorCode, onClose }) {
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null)
  useEffect(() => { setLoading(true); setError(null); getDistributorDetail(distributorCode).then(setDetail).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false)) }, [distributorCode])
  return (
    <ModalShell title="Distributor Detail" subtitle={distributorCode} onClose={onClose}>
      {loading && <Spinner />}
      {error && <div className="flex items-center gap-2 text-m-red bg-m-red-50 border border-m-red/25 rounded-xl p-3"><AlertCircle size={13}/><span className="text-sm">{error}</span></div>}
      {detail && !loading && !error && (
        <div className="space-y-3">
          <div className="rounded-xl border border-m-border bg-m-bg p-3">
            <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold mb-2">Hierarchy Chain</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[{label:detail.region,color:'text-m-blue'},{label:detail.clusterName,color:'text-m-blue-lt'},{label:detail.asmArea,color:'text-m-green-dk'},{label:detail.ddType,color:'text-m-amber'},{label:detail.tsoeName,color:'text-m-text'}]
                .filter(n=>n.label).map((node,i,arr) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={`font-semibold ${node.color}`}>{node.label}</span>
                    {i<arr.length-1 && <ChevronRight size={11} className="text-m-border" />}
                  </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <DetailRow label="Name"       value={detail.distributorName} />
            <DetailRow label="Town/City"  value={detail.townCity} />
            <DetailRow label="Status"     value={detail.status} />
            <DetailRow label="ASM Name"   value={detail.asmName} />
            <DetailRow label="Route"      value={detail.route||'—'} />
            <DetailRow label="Dist Mobile" value={detail.distMobile} mono />
            <DetailRow label="TSOE Mobile" value={detail.tsoeMobile} mono />
          </div>
          {detail.liveData && (
            <div className="rounded-xl border border-m-border bg-m-bg p-3">
              <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold mb-2">Live Data</p>
              <div className="flex gap-6">
                {[['Invoices',detail.liveData.invoiceCount],['Vehicles',detail.liveData.vehicleCount]].map(([l,v])=>(
                  <div key={l} className="text-center"><p className="text-xl font-extrabold text-m-blue">{v}</p><p className="text-xs text-m-muted">{l}</p></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}

function VehicleDetailModal({ vehicle, onClose }) {
  return (
    <ModalShell title="Vehicle Detail" subtitle={vehicle.id} onClose={onClose}>
      <div className="space-y-2">
        <DetailRow label="Vehicle No."   value={vehicle.id}          mono />
        <DetailRow label="Device"        value={vehicle.deviceName}  mono />
        <DetailRow label="Invoice Count" value={vehicle.invoiceCount!=null ? String(vehicle.invoiceCount) : null} />
        <DetailRow label="Last Seen"     value={vehicle.lastSeen} />
        <DetailRow label="Battery"       value={vehicle.battery} />
        <DetailRow label="Location"      value={vehicle.location} />
        {vehicle.lat && vehicle.lng && (
          <a href={`https://www.google.com/maps?q=${vehicle.lat},${vehicle.lng}`} target="_blank" rel="noopener noreferrer"
             className="flex items-center justify-center gap-1.5 w-full mt-2 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
             style={{ background:MB }}>
            <MapPin size={11} /> View on Map
          </a>
        )}
      </div>
    </ModalShell>
  )
}

function ResultCard({ result, onSelect }) {
  const navigate = useNavigate()
  const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.invoice
  const Icon = config.icon
  const handleClick = () => { if (result.type === 'route') { navigate('/routes'); return } onSelect(result) }
  return (
    <button onClick={handleClick}
      className="w-full text-left flex items-start gap-4 p-4 rounded-xl border border-m-border bg-m-surface hover:border-m-blue/30 hover:bg-m-blue-50/30 transition-all group shadow-card">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg}`}>
        <Icon size={15} className={config.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${config.bg} ${config.color}`}>{config.label}</span>
          <span className="text-sm font-semibold text-m-text group-hover:text-m-blue transition-colors truncate">{result.title}</span>
        </div>
        <p className="text-xs text-m-muted truncate">{result.subtitle}</p>
        {result.location && <p className="text-xs text-m-muted flex items-center gap-1 mt-0.5"><MapPin size={10} className="text-m-green" />{result.location}</p>}
      </div>
      <ChevronRight size={14} className="text-m-border group-hover:text-m-muted transition-colors flex-shrink-0 mt-1" />
    </button>
  )
}

export default function SearchPage() {
  const [query, setQuery]         = useState('')
  const [typeFilter, setType]     = useState('')
  const [results, setResults]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [selectedResult, setSelectedResult] = useState(null)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = (q, type) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true); setError(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      globalSearch(q, type).then(setResults).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false))
    }, 300)
  }

  const handleInput = e => { setQuery(e.target.value); doSearch(e.target.value, typeFilter) }
  const handleTypeChange = t => { setType(t); doSearch(query, t) }

  const grouped = results ? FILTERS.slice(1).reduce((acc, f) => {
    const items = results.results.filter(r => r.type === f.value)
    if (items.length) acc.push({ label: f.label, items })
    return acc
  }, []) : []

  return (
    <div className="min-h-screen bg-m-bg">
      <Header title="Global Search" status={null} />
      <div className="p-6 max-w-3xl mx-auto space-y-5 animate-fade-in">
        {/* Search input */}
        <div className="relative">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-m-muted pointer-events-none" />
          <input
            ref={inputRef} type="text" value={query} onChange={handleInput}
            placeholder="Search invoices, vehicles, distributors, routes…"
            className="w-full bg-m-surface border border-m-border rounded-xl pl-11 pr-4 py-3.5 text-m-text placeholder:text-m-muted/60 focus:outline-none focus:border-m-blue/40 text-sm shadow-card transition-colors"
          />
          {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-m-border rounded-full animate-spin" style={{ borderTopColor:MB }} />}
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => handleTypeChange(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                typeFilter === f.value
                  ? 'text-white border-transparent'
                  : 'bg-m-surface text-m-muted border-m-border hover:text-m-text hover:border-m-blue/30'
              }`}
              style={typeFilter === f.value ? { background:MB } : {}}>
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-m-red bg-m-red-50 border border-m-red/25 rounded-xl p-4">
            <AlertCircle size={15} /><span className="text-sm">{error}</span>
          </div>
        )}

        {results && results.total === 0 && (
          <div className="text-center py-12">
            <Search size={28} className="text-m-border mx-auto mb-3" />
            <p className="text-m-muted text-sm font-medium">No results for "{query}"</p>
            <p className="text-m-muted text-xs mt-1">Try a different search term or filter.</p>
          </div>
        )}

        {grouped.map(({ label, items }) => (
          <div key={label}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-m-muted uppercase tracking-widest">{label}</span>
              <span className="text-xs text-m-muted font-mono bg-m-bg border border-m-border px-1.5 py-0.5 rounded-full">({items.length})</span>
            </div>
            <div className="space-y-2">
              {items.map((r, i) => <ResultCard key={i} result={r} onSelect={setSelectedResult} />)}
            </div>
          </div>
        ))}

        {!query && !results && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-m-blue-50 border border-m-blue-100 flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-m-blue" />
            </div>
            <p className="text-m-text font-semibold text-sm">Start typing to search across all data</p>
            <p className="text-m-muted text-xs mt-1 mb-5">Invoices, vehicles, distributors, routes</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Invoice number','Vehicle number','Distributor code','Route name','ASM Area'].map(hint => (
                <span key={hint} className="px-2.5 py-1 bg-m-surface border border-m-border rounded-lg text-xs text-m-muted">{hint}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedResult?.type === 'invoice'     && <InvoiceDetailModal     invoiceNo={selectedResult.id}            onClose={() => setSelectedResult(null)} />}
      {selectedResult?.type === 'distributor' && <DistributorDetailModal distributorCode={selectedResult.id}       onClose={() => setSelectedResult(null)} />}
      {selectedResult?.type === 'vehicle'     && <VehicleDetailModal     vehicle={selectedResult}                  onClose={() => setSelectedResult(null)} />}
    </div>
  )
}
