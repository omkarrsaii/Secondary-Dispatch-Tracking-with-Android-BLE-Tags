import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Building2, AlertCircle, Layers, FileText, BarChart3, TrendingUp, Users, CheckCircle2, Clock, Filter, X, MapPin } from 'lucide-react'
import Header from '../components/Header'
import {
  getHierarchyTree, syncHierarchy, getDistributorDetail,
  getClusterKpis, getAsmKpis, getTsoeKpis,
  getActiveInvoiceList, getInvoiceTrackingDetail, getDistributors,
} from '../lib/api'

const MB = '#1467B2'
const MG = '#7DC242'
const MG_DK = '#5E9F2B'
const TEAL = '#0B6FCB'
const AMBER = '#D97706'

function formatInvoiceDate(dateStr) {
  if (!dateStr) return '—'
  const str = String(dateStr).trim()
  const match = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    const d = new Date(Number(year), Number(month) - 1, Number(day))
    if (!isNaN(d.getTime())) return new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric' }).format(d)
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? str : new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric' }).format(d)
}

function VehicleStatusPill({ status }) {
  if (status === 'Assigned') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ background:'rgba(94,159,43,.12)', color:MG_DK, borderColor:'rgba(94,159,43,.25)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />Assigned
    </span>
  )
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-m-bg border border-m-border text-m-muted">Not Assigned</span>
}

function Spinner() {
  return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-m-border rounded-full animate-spin" style={{ borderTopColor:MB }} /></div>
}

function ErrBanner({ msg }) {
  return (
    <div className="flex items-center gap-2 text-m-red bg-m-red-50 border border-m-red/25 rounded-xl p-4 text-sm">
      <AlertCircle size={15} />{msg}
    </div>
  )
}

/* ── Distributor flyout ─────────────────────────────────────────────── */
function DistributorFlyout({ code, onClose }) {
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null)
  useEffect(() => { setLoading(true); setError(null); getDistributorDetail(code).then(setDetail).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false)) }, [code])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-m-text/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-screen bg-m-surface border-l border-m-border overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-m-border sticky top-0 bg-m-surface z-10">
          <div>
            <h2 className="font-bold text-m-text">Distributor Detail</h2>
            <p className="text-xs text-m-muted font-mono mt-0.5">{code}</p>
          </div>
          <button onClick={onClose} className="text-m-muted hover:text-m-text text-sm px-2 py-1 rounded-lg hover:bg-m-border/30 transition-colors">✕</button>
        </div>
        <div className="p-5">
          {loading && <Spinner />}
          {error && <ErrBanner msg={error} />}
          {detail && !loading && (
            <div className="space-y-4">
              {/* Hierarchy chain */}
              <div className="rounded-xl border border-m-border bg-m-bg p-4">
                <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold mb-3">Hierarchy Chain</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[{label:detail.region,color:MB},{label:detail.clusterName,color:TEAL},{label:detail.asmArea,color:MG_DK},{label:detail.ddType,color:AMBER},{label:detail.tsoeName,color:'#0A1628'}]
                    .filter(n=>n.label).map((node,i,arr) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="font-semibold" style={{ color:node.color }}>{node.label}</span>
                        {i<arr.length-1 && <ChevronRight size={11} className="text-m-border" />}
                      </span>
                  ))}
                </div>
              </div>
              {/* Fields */}
              {[['Distributor Code',detail.distributorCode,'mono'],['Distributor Name',detail.distributorName],['Town / City',detail.townCity],['Status',detail.status],['ASM Name',detail.asmName],['Route',detail.route||'—'],['Dist Mobile',detail.distMobile,'mono'],['TSOE Mobile',detail.tsoeMobile,'mono']]
                .map(([label,value,style]) => value ? (
                  <div key={label} className="flex items-start justify-between border-b border-m-border/50 pb-2">
                    <span className="text-xs text-m-muted">{label}</span>
                    <span className={`text-xs text-m-text text-right ${style==='mono'?'font-mono':''}`}>{value}</span>
                  </div>
                ) : null)}
              {/* Live data */}
              {detail.liveData && (
                <div className="rounded-xl border border-m-border bg-m-bg p-4">
                  <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold mb-3">Live Data</p>
                  <div className="flex gap-6">
                    {[['Invoices',detail.liveData.invoiceCount],['Vehicles',detail.liveData.vehicleCount]].map(([l,v])=>(
                      <div key={l} className="text-center"><p className="text-2xl font-extrabold" style={{ color:MB }}>{v}</p><p className="text-xs text-m-muted">{l}</p></div>
                    ))}
                  </div>
                </div>
              )}
              {/* Active invoices */}
              <div className="rounded-xl border border-m-border overflow-hidden">
                <div className="px-4 py-3 bg-m-bg border-b border-m-border flex items-center justify-between">
                  <div className="flex items-center gap-2"><FileText size={13} style={{ color:MB }} /><p className="text-sm font-bold text-m-text">Active Invoices</p></div>
                  <span className="text-xs text-m-muted font-mono">{detail.totalActiveInvoices ?? detail.activeInvoices?.length ?? 0}</span>
                </div>
                {!detail.activeInvoices || detail.activeInvoices.length === 0 ? (
                  <p className="text-xs text-m-muted text-center py-6">No active invoices.</p>
                ) : (
                  <div className="divide-y divide-m-border/60 max-h-80 overflow-y-auto">
                    {detail.activeInvoices.map(inv => (
                      <div key={inv.invoiceNo} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div><p className="font-mono text-sm text-m-text font-semibold">{inv.invoiceNo}</p><p className="text-xs text-m-muted mt-0.5">{formatInvoiceDate(inv.invoiceDate)}</p></div>
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

/* ── Invoice tracking modal ─────────────────────────────────────────── */
function InvoiceTrackingModal({ invoiceNo, onClose }) {
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null)
  useEffect(() => { setLoading(true); setError(null); getInvoiceTrackingDetail(invoiceNo).then(setDetail).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false)) }, [invoiceNo])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-m-text/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-m-surface border border-m-border rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-m-border">
          <div><h2 className="font-bold text-m-text">Tracking</h2><p className="text-xs text-m-muted font-mono mt-0.5">{invoiceNo}</p></div>
          <button onClick={onClose} className="text-m-muted hover:text-m-text p-1 rounded hover:bg-m-border/30 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5">
          {loading && <Spinner />}
          {error && <ErrBanner msg={error} />}
          {detail && !loading && !error && (
            <div className="space-y-3">
              <div className="flex justify-center py-1"><VehicleStatusPill status={detail.vehicleStatus} /></div>
              {[['Distributor',`${detail.distributorName||''} ${detail.distributorCode?`(${detail.distributorCode})`:''}`],['ASM Area',detail.asmArea],['HQ',detail.tsoeName],['Status',detail.status],['Vehicle No.',detail.vehicleNo||'—'],['Invoice Date',formatInvoiceDate(detail.invoiceDate)],['Appt. Date',formatInvoiceDate(detail.appointmentDate)],['Age',detail.ageDays!=null?`${detail.ageDays} day(s)`:null]]
                .filter(([,v])=>v).map(([label,value])=>(
                  <div key={label} className="flex items-start justify-between border-b border-m-border/50 pb-2">
                    <span className="text-xs text-m-muted">{label}</span>
                    <span className="text-xs text-m-text text-right">{value}</span>
                  </div>
              ))}
              {detail.tracking && (
                <div className="rounded-xl border border-m-border bg-m-bg p-3 space-y-2 mt-1">
                  <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold">Live Location</p>
                  {detail.tracking.lastSeen && <div className="flex items-start justify-between"><span className="text-xs text-m-muted">Last Seen</span><span className="text-xs text-m-text">{detail.tracking.lastSeen}</span></div>}
                  {detail.tracking.latitude != null && <div className="flex items-start justify-between"><span className="text-xs text-m-muted">Coordinates</span><span className="text-xs font-mono text-m-text">{detail.tracking.latitude.toFixed(5)}, {detail.tracking.longitude.toFixed(5)}</span></div>}
                  {detail.tracking.battery && <div className="flex items-start justify-between"><span className="text-xs text-m-muted">Battery</span><span className="text-xs text-m-text">{detail.tracking.battery}</span></div>}
                  {detail.tracking.mapsUrl && (
                    <a href={detail.tracking.mapsUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center justify-center gap-1.5 w-full mt-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                       style={{ background:MB }}>
                      <MapPin size={11} /> View on Map
                    </a>
                  )}
                </div>
              )}
              {!detail.tracking && <p className="text-xs text-m-muted text-center pt-1">No vehicle tracking device assigned.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Tree nodes ─────────────────────────────────────────────────────── */
function DistributorNode({ dist, onSelect }) {
  const active = dist.status?.toLowerCase() === 'active'
  return (
    <button onClick={() => onSelect(dist.distributorCode)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-transparent hover:border-m-border hover:bg-m-bg text-left transition-colors w-full group">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? MG_DK : '#94A3B8' }} />
      <span className="text-xs text-m-text font-mono font-semibold group-hover:text-m-blue transition-colors">{dist.distributorCode}</span>
      {dist.distributorName && <span className="text-xs text-m-muted truncate">{dist.distributorName}</span>}
      {dist.townCity && <span className="text-xs text-m-muted ml-auto flex-shrink-0">{dist.townCity}</span>}
    </button>
  )
}

function TsoeNode({ tsoe, onSelect }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-m-bg transition-colors group">
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} style={{ color:AMBER }} />
        <span className="text-sm text-m-text group-hover:text-m-amber transition-colors" style={open?{color:AMBER}:{}}>{tsoe.tsoeName}</span>
        <span className="ml-auto text-xs text-m-muted font-mono">{tsoe.distributors.length}</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-m-border pl-3">
          {tsoe.distributors.map(d => <DistributorNode key={d.distributorCode} dist={d} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function DdTypeNode({ ddType, onSelect }) {
  const [open, setOpen] = useState(false)
  const distCount = ddType.tsoes.reduce((s,t) => s + t.distributors.length, 0)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-m-bg transition-colors group">
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} style={{ color:TEAL }} />
        <span className="px-1.5 py-0.5 rounded text-[11px] font-bold border" style={{ background:'rgba(11,111,203,.1)', color:TEAL, borderColor:'rgba(11,111,203,.2)' }}>{ddType.ddType}</span>
        <span className="ml-auto text-xs text-m-muted">{ddType.tsoes.length} TSOEs · {distCount} dists</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-m-border pl-3">
          {ddType.tsoes.map(t => <TsoeNode key={t.tsoeName} tsoe={t} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function AsmNode({ asm, onSelect }) {
  const [open, setOpen] = useState(false)
  const tsoeCount = asm.ddTypes.reduce((s,d) => s + d.tsoes.length, 0)
  const nameLabel = asm.asmNames?.length > 0 ? asm.asmNames.join(', ') : null
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-m-bg transition-colors group">
        <ChevronRight size={13} className={`transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} style={{ color:MG_DK }} />
        <span className="text-sm font-semibold text-m-text transition-colors" style={open?{color:MG_DK}:{}}>{asm.asmArea}</span>
        {nameLabel && <span className="text-xs text-m-muted px-1.5 py-0.5 rounded bg-m-border/40 truncate max-w-[160px]" title={nameLabel}>{nameLabel}</span>}
        <span className="ml-auto text-xs text-m-muted flex-shrink-0">{asm.ddTypes.length} DD · {tsoeCount} TSOEs</span>
      </button>
      {open && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-m-border pl-3">
          {asm.ddTypes.map(d => <DdTypeNode key={d.ddType} ddType={d} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function ClusterNode({ cluster, onSelect }) {
  const [open, setOpen] = useState(false)
  const distCount = cluster.asms.flatMap(a=>a.ddTypes).flatMap(d=>d.tsoes).flatMap(t=>t.distributors).length
  return (
    <div className="border border-m-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 w-full px-4 py-3 bg-m-bg hover:bg-m-blue-50/40 transition-colors">
        <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${open?'':'rotate-[-90deg]'}`} style={{ color:TEAL }} />
        <Layers size={13} style={{ color:TEAL }} />
        <span className="font-bold text-m-text">{cluster.clusterName}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-m-muted">{cluster.asms.length} ASMs</span>
          <span className="text-xs text-m-muted">{distCount} Dists</span>
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-1">
          {cluster.asms.map(a => <AsmNode key={a.asmArea} asm={a} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function ZoneNode({ zone, onSelect }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-m-bg transition-colors">
        <ChevronDown size={15} className={`transition-transform ${open?'':'rotate-[-90deg]'}`} style={{ color:MB }} />
        <span className="font-extrabold uppercase tracking-wider text-sm" style={{ color:MB }}>{zone.zone}</span>
        <span className="ml-auto text-xs text-m-muted">{zone.clusters.length} clusters</span>
      </button>
      {open && (
        <div className="space-y-2 ml-2">
          {zone.clusters.map(c => <ClusterNode key={c.clusterName} cluster={c} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

/* ── KPI card ───────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, suffix='', color=MB, sub=null }) {
  return (
    <div className="bg-m-surface rounded-xl border border-m-border shadow-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }} /><p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold">{label}</p>
      </div>
      <p className="text-2xl font-extrabold" style={{ color }}>{value}{suffix}</p>
      {sub && <p className="text-xs text-m-muted mt-1">{sub}</p>}
    </div>
  )
}

/* ── Performance panel ──────────────────────────────────────────────── */
function PerformancePanel({ clusters, asmsFlat, tsoesFlat }) {
  const [selectedCluster, setSelectedCluster] = useState('')
  const [level, setLevel] = useState('cluster')
  const [name, setName]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [distributorFilter, setDistributorFilter] = useState('')
  const [invoiceState, setInvoiceState] = useState('all')
  const [distributorOptions, setDistributorOptions] = useState([])
  const [kpis, setKpis]         = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [trackingInvoice, setTrackingInvoice] = useState(null)

  useEffect(() => { if (!selectedCluster && clusters.length) setSelectedCluster(clusters[0]) }, [clusters, selectedCluster])

  const asmOptions  = Array.from(new Set(asmsFlat.filter(a=>a.clusterName===selectedCluster).map(a=>a.asmArea))).sort()
  const tsoeOptions = Array.from(new Set(tsoesFlat.filter(t=>t.clusterName===selectedCluster).map(t=>t.tsoeName))).sort()

  useEffect(() => {
    if (level==='asm') setName(asmOptions[0]||'')
    else if (level==='tsoe') setName(tsoeOptions[0]||'')
    else setName('')
    setDistributorFilter('')
  }, [level, selectedCluster]) // eslint-disable-line

  useEffect(() => {
    if (!selectedCluster) return
    const p = { cluster: selectedCluster }
    if (level==='asm' && name) p.asm = name
    if (level==='tsoe' && name) p.tsoe = name
    getDistributors(p).then(d => setDistributorOptions(d.distributors||[])).catch(() => setDistributorOptions([]))
  }, [selectedCluster, level, name])

  useEffect(() => {
    const scopeName = level==='cluster' ? selectedCluster : name
    if (!scopeName) { setKpis(null); setInvoices([]); return }
    setLoading(true); setError(null)
    const fp = { dateFrom:dateFrom||undefined, dateTo:dateTo||undefined, distributorCode:distributorFilter||undefined }
    const kpiFetcher = level==='cluster' ? getClusterKpis(scopeName,fp) : level==='asm' ? getAsmKpis(scopeName,fp) : getTsoeKpis(scopeName,fp)
    Promise.all([kpiFetcher, getActiveInvoiceList({ scope:level, name:scopeName, ...fp, invoiceState })])
      .then(([k,list]) => { setKpis(k); setInvoices(list.invoices||[]) })
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false))
  }, [level, selectedCluster, name, dateFrom, dateTo, distributorFilter, invoiceState])

  const showAsmCol = level==='cluster', showHqCol = level==='cluster' || level==='asm'

  const selectCls = "px-3 py-1.5 rounded-xl bg-m-bg border border-m-border text-sm text-m-text focus:outline-none focus:border-m-blue/40 transition-colors"

  return (
    <div className="space-y-4">
      {/* Cluster + Level selector */}
      <div className="bg-m-surface rounded-xl border border-m-border shadow-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Layers size={13} style={{ color:TEAL }} />
          <label className="text-[11px] text-m-muted uppercase tracking-widest font-semibold">Cluster</label>
          <select value={selectedCluster} onChange={e => setSelectedCluster(e.target.value)} className={`flex-1 min-w-[160px] ${selectCls}`}>
            {clusters.length === 0 && <option value="">No clusters</option>}
            {clusters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex rounded-xl border border-m-border overflow-hidden">
            {['cluster','asm','tsoe'].map(l => (
              <button key={l} onClick={() => setLevel(l)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase transition-colors ${level===l ? 'text-white' : 'text-m-muted hover:bg-m-bg'}`}
                style={level===l ? { background:MB } : {}}>
                {l}
              </button>
            ))}
          </div>
          {level !== 'cluster' && (
            <select value={name} onChange={e => setName(e.target.value)} className={`flex-1 min-w-[160px] ${selectCls}`}>
              {(level==='asm' ? asmOptions : tsoeOptions).length === 0 && <option value="">No {level==='asm'?'ASMs':'TSOEs'} in cluster</option>}
              {(level==='asm' ? asmOptions : tsoeOptions).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-m-surface rounded-xl border border-m-border shadow-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={13} className="text-m-muted" />
          {[['From',dateFrom,setDateFrom],['To',dateTo,setDateTo]].map(([l,v,set]) => (
            <div key={l} className="flex items-center gap-2">
              <label className="text-xs text-m-muted font-semibold">{l}</label>
              <input type="date" value={v} onChange={e => set(e.target.value)}
                className="px-2 py-1.5 rounded-xl bg-m-bg border border-m-border text-xs text-m-text focus:outline-none focus:border-m-blue/40" />
            </div>
          ))}
          <select value={distributorFilter} onChange={e => setDistributorFilter(e.target.value)} className={`flex-1 min-w-[160px] text-xs ${selectCls}`}>
            <option value="">All Distributors</option>
            {distributorOptions.map(d => <option key={d.distributorCode} value={d.distributorCode}>{d.distributorName||d.distributorCode}</option>)}
          </select>
          <select value={invoiceState} onChange={e => setInvoiceState(e.target.value)} className={`text-xs ${selectCls}`}>
            <option value="all">All Active</option>
            <option value="active">On-Time Only</option>
            <option value="overdue">Overdue Only</option>
          </select>
          {(dateFrom||dateTo||distributorFilter||invoiceState!=='all') && (
            <button onClick={()=>{setDateFrom('');setDateTo('');setDistributorFilter('');setInvoiceState('all')}} className="text-xs text-m-muted hover:text-m-text underline">Clear</button>
          )}
        </div>
      </div>

      {loading && <Spinner />}
      {error && <ErrBanner msg={error} />}

      {kpis && !loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard icon={Users}        label="Distributors"     value={kpis.distributorCount} color="#0A1628" />
          <KpiCard icon={FileText}     label="Total Invoices"   value={kpis.totalInvoices}    color={MB} />
          <KpiCard icon={TrendingUp}   label="Active"           value={kpis.activeInvoices}   color={AMBER} />
          <KpiCard icon={CheckCircle2} label="Completion Rate"  value={kpis.completionRate} suffix="%" color={MG_DK} sub={`${kpis.completedInvoices} of ${kpis.totalInvoices} completed`} />
          <KpiCard icon={Clock}        label="Overdue"          value={kpis.overdueInvoices}  color={kpis.overdueInvoices>0?'#DC2626':'#64748B'} />
        </div>
      )}

      {/* Active Invoice List */}
      {!loading && !error && kpis && (
        <div className="bg-m-surface rounded-xl border border-m-border shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-m-border flex items-center gap-2">
            <FileText size={14} style={{ color:MB }} />
            <h2 className="font-bold text-sm text-m-text">Active Invoice List</h2>
            <span className="ml-auto text-xs text-m-muted font-mono">{invoices.length}</span>
          </div>
          {invoices.length === 0 ? (
            <p className="text-m-muted text-sm text-center py-8">No active invoices match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-m-muted uppercase tracking-widest border-b border-m-border bg-m-bg">
                    {['Invoice No', showAsmCol&&'ASM Area', showHqCol&&'HQ', 'Distributor','Status','Vehicle','Last Updated','Age'].filter(Boolean).map(h => (
                      <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-m-border/50">
                  {invoices.map(inv => (
                    <tr key={inv.invoiceNo} onClick={() => setTrackingInvoice(inv.invoiceNo)} className="cursor-pointer hover:bg-m-bg transition-colors">
                      <td className="px-4 py-2.5 font-mono text-m-text font-semibold whitespace-nowrap">{inv.invoiceNo}</td>
                      {showAsmCol && <td className="px-4 py-2.5 text-m-text whitespace-nowrap">{inv.asmArea||'—'}</td>}
                      {showHqCol  && <td className="px-4 py-2.5 text-m-text whitespace-nowrap">{inv.tsoeName||'—'}</td>}
                      <td className="px-4 py-2.5 text-m-text whitespace-nowrap">{inv.distributorName||inv.distributorCode}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${inv.isOverdue ? 'text-m-red bg-m-red-50 border-m-red/25' : 'text-m-amber bg-m-amber-50 border-m-amber/25'}`}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><VehicleStatusPill status={inv.vehicleStatus} /></td>
                      <td className="px-4 py-2.5 text-m-muted whitespace-nowrap text-xs">{formatInvoiceDate(inv.lastUpdated)}</td>
                      <td className="px-4 py-2.5 text-m-muted whitespace-nowrap text-xs">{inv.ageDays!=null?`${inv.ageDays}d`:'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {trackingInvoice && <InvoiceTrackingModal invoiceNo={trackingInvoice} onClose={() => setTrackingInvoice(null)} />}
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────────── */
export default function HierarchyPage() {
  const [tab, setTab]           = useState('performance')
  const [tree, setTree]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getHierarchyTree().then(d => setTree(d.tree)).catch(e => setError(e.response?.data?.message || e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => { setSyncing(true); try { await syncHierarchy(); load() } catch { /* ignore */ } finally { setSyncing(false) } }

  const allClusters = (tree||[]).flatMap(z=>z.clusters)
  const allAsms     = allClusters.flatMap(c=>c.asms)
  const allDdTypes  = allAsms.flatMap(a=>a.ddTypes)
  const allTsoes    = allDdTypes.flatMap(d=>d.tsoes)
  const totalDists  = allTsoes.flatMap(t=>t.distributors).length

  const clusterNames = allClusters.map(c=>c.clusterName).sort()
  const asmsFlat  = allClusters.flatMap(c=>c.asms.map(a=>({asmArea:a.asmArea,asmNames:a.asmNames,clusterName:c.clusterName})))
  const tsoesFlat = allClusters.flatMap(c=>c.asms.flatMap(a=>a.ddTypes.flatMap(d=>d.tsoes.map(t=>({tsoeName:t.tsoeName,clusterName:c.clusterName,asmArea:a.asmArea})))))

  return (
    <div className="min-h-screen bg-m-bg">
      <Header title="Organisation Hierarchy" status={null} refreshing={syncing} onRefresh={handleSync} />
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Tab switcher */}
        <div className="flex rounded-xl border border-m-border overflow-hidden w-fit bg-m-surface shadow-card">
          {[{key:'performance',label:'Performance',icon:BarChart3},{key:'tree',label:'Tree',icon:Building2}].map(({key,label,icon:Icon}) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold transition-colors ${tab===key ? 'text-white' : 'text-m-muted hover:bg-m-bg'}`}
              style={tab===key ? { background:MB } : {}}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* Performance */}
        {tab === 'performance' && <PerformancePanel clusters={clusterNames} asmsFlat={asmsFlat} tsoesFlat={tsoesFlat} />}

        {/* Stats bar */}
        {tab === 'tree' && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[{l:'Zones',v:tree?.length??'—',c:MB},{l:'Clusters',v:allClusters.length||'—',c:TEAL},{l:'ASMs',v:allAsms.length||'—',c:MG_DK},{l:'TSOEs',v:allTsoes.length||'—',c:AMBER},{l:'Distributors',v:totalDists||'—',c:'#0A1628'}]
              .map(({l,v,c}) => (
                <div key={l} className="bg-m-surface rounded-xl border border-m-border shadow-card p-4">
                  <p className="text-[10px] text-m-muted uppercase tracking-widest font-semibold">{l}</p>
                  <p className="text-2xl font-extrabold mt-1" style={{ color:c }}>{v}</p>
                </div>
            ))}
          </div>
        )}

        {/* Tree */}
        {tab === 'tree' && (
          <div className="bg-m-surface rounded-xl border border-m-border shadow-card">
            <div className="px-5 py-4 border-b border-m-border flex items-center gap-2">
              <Building2 size={14} style={{ color:MB }} />
              <h2 className="font-bold text-sm text-m-text">Zone → Cluster → ASM → DD Type → TSOE → Distributor</h2>
            </div>
            <div className="p-5">
              {loading && <Spinner />}
              {error && <ErrBanner msg={error} />}
              {tree && !loading && tree.length === 0 && <p className="text-m-muted text-sm text-center py-8">No hierarchy data found.</p>}
              {tree && !loading && tree.length > 0 && (
                <div className="space-y-4">
                  {tree.map(zone => <ZoneNode key={zone.zone} zone={zone} onSelect={setSelected} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && <DistributorFlyout code={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
