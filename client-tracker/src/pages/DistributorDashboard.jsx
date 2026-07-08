import { useState, useEffect, useCallback } from 'react'
import { getDistributorInvoices } from '../distributorApi'

const MB    = '#1467B2'
const MG    = '#7DC242'
const MG_DK = '#5E9F2B'
const TEAL  = '#0B6FCB'

/* ── Inline icons (no external icon package needed) ───────────────── */
const IconPackage = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
  </svg>
)
const IconMapPin = (p) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
)
const IconTruck = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)
const IconChevronRight = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconLogOut = (p) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const IconFileText = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)

// Shipment status badge — "At Depot" / "In Transit" / "Reached" (or
// "Unassigned" if no vehicle at all yet), sourced directly from the
// backend (never re-derived client-side) so this always agrees with
// whatever threshold/rule the backend actually used.
function VehicleStatusBadge({ status }) {
  if (status === 'Reached') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
            style={{ background: 'rgba(11,111,203,.1)', color: TEAL, borderColor: 'rgba(11,111,203,.22)' }}>
        ✓ Reached
      </span>
    )
  }
  if (status === 'At Depot') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
            style={{ background: 'rgba(217,119,6,.1)', color: '#D97706', borderColor: 'rgba(217,119,6,.25)' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#D97706' }} />
        At Depot
      </span>
    )
  }
  if (status === 'In Transit') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
            style={{ background: 'rgba(94,159,43,.12)', color: MG_DK, borderColor: 'rgba(94,159,43,.25)' }}>
        <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: MG_DK }} />
        In Transit
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rim text-mist border border-rim">
      Unassigned
    </span>
  )
}

// Current location + remaining road distance — the distance shown here is
// ALWAYS the remaining road route (vehicle → destination) from the
// backend's routing engine, never a straight-line number. Location sits
// on its own line above the distance so a longer locality name doesn't
// crowd the number next to it — still compact (2 short lines), just
// readable instead of a single cramped line.
function LocationAndDistance({ location, distanceMeters, reached }) {
  if (reached) {
    return <span className="text-[11px] text-mist">Delivered</span>
  }
  const distanceLabel = distanceMeters == null ? null : (
    distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km away` : `${distanceMeters} m away`
  )
  if (!location && !distanceLabel) return <span className="text-[11px] text-mist">—</span>
  return (
    <div className="text-right max-w-[130px]">
      {location && <p className="text-[11px] font-medium text-slate truncate" title={location}>{location}</p>}
      {distanceLabel && (
        <p className="flex items-center justify-end gap-1 text-[11px] font-mono text-slate/70 mt-0.5">
          <IconMapPin style={{ color: MG, width: 9, height: 9 }} />
          {distanceLabel}
        </p>
      )}
    </div>
  )
}

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
  if (isNaN(d.getTime())) return str
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

const PAGE_SIZE = 20

export default function DistributorDashboard({ distributor, onInvoiceClick, onSignOut }) {
  const { distributorCode, distributorName, totalActiveInvoices } = distributor

  const [invoices, setInvoices]       = useState([])
  const [page, setPage]               = useState(1)
  const [totalPages, setTotalPages]   = useState(1)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState(null)

  const loadInvoices = useCallback((pageNum, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true)
    getDistributorInvoices(distributorCode, { page: pageNum, limit: PAGE_SIZE })
      .then(data => {
        setInvoices(prev => append ? [...prev, ...data.invoices] : data.invoices)
        setTotalPages(data.totalPages)
        setPage(data.page)
      })
      .catch(err => setError(err.response?.data?.message || 'Could not load invoices.'))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }, [distributorCode])

  useEffect(() => { loadInvoices(1, false) }, [distributorCode])

  const reached  = invoices.filter(i => i.reached).length
  const assigned = invoices.filter(i => i.vehicleStatus && i.vehicleStatus !== 'Not Assigned').length

  return (
    <div className="min-h-dvh dot-grid flex flex-col">

      {/* Header with real logo */}
      <header className="sticky top-0 z-30 bg-white border-b border-rim shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl border border-rim overflow-hidden p-0.5 flex-shrink-0">
            <img src="/marico-logo.png" alt="Marico" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-sm leading-tight" style={{ color: MB }}>Marico</p>
            <p className="text-[10px] text-slate tracking-widest uppercase leading-none mt-0.5 font-mono">Distributor Portal</p>
          </div>
          <button
            onClick={onSignOut}
            className="ml-auto flex items-center gap-1.5 text-xs text-slate hover:text-bad transition-colors px-2 py-1 rounded-lg hover:bg-bad/8"
          >
            <IconLogOut />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 pt-6 pb-16">

        {/* Welcome */}
        <div className="mb-5 animate-fade-up">
          <p className="text-[11px] text-slate uppercase tracking-widest font-semibold mb-1">Welcome back</p>
          <h1 className="font-extrabold text-2xl leading-tight" style={{ color: MB }}>
            {distributorName}
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5 animate-fade-up" style={{ animationDelay: '0.05s' }}>
          {[
            { label: 'Active Invoices',   value: totalActiveInvoices, Icon: IconFileText, color: MB,    bg: '#EBF3FF' },
            { label: 'Vehicles Assigned', value: assigned,            Icon: IconTruck,    color: MG_DK, bg: '#F0F9E8' },
            { label: 'Reached',           value: reached,             Icon: IconMapPin,   color: TEAL,  bg: '#EBF3FF' },
          ].map(({ label, value, Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-rim shadow-card p-3.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: bg }}>
                <Icon style={{ color, width:15, height:15 }} />
              </div>
              <p className="text-xl font-extrabold leading-none mb-1" style={{ color }}>{value ?? '—'}</p>
              <p className="text-[10px] text-slate font-semibold uppercase tracking-wide leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-bad bg-bad/8 border border-bad/20 rounded-xl px-3 py-2.5 text-xs mb-4">
            {error}
          </div>
        )}

        {/* Invoice list */}
        <div className="bg-white rounded-xl border border-rim shadow-card overflow-hidden animate-fade-up"
             style={{ animationDelay: '0.1s' }}>
          <div className="px-5 py-3.5 border-b border-rim flex items-center gap-2">
            <IconPackage style={{ color: MB }} />
            <h2 className="text-sm font-bold" style={{ color: MB }}>Active Invoices</h2>
            <span className="ml-auto text-[11px] text-slate font-mono">{invoices.length} of {totalActiveInvoices}</span>
          </div>

          {loading ? (
            <div className="py-14 flex justify-center">
              <span className="w-6 h-6 border-2 border-rim rounded-full animate-spin" style={{ borderTopColor: MB }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-14 text-center">
              <IconPackage style={{ width:24, height:24, color:'#CBD5E1', margin:'0 auto 12px' }} />
              <p className="text-sm text-slate font-medium">No active invoices</p>
            </div>
          ) : (
            <div className="divide-y divide-rim">
              {invoices.map(inv => (
                <button
                  key={inv.invoiceNo}
                  onClick={() => onInvoiceClick(inv.invoiceNo)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-mbg transition-colors text-left group"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: '#EBF3FF' }}>
                    <IconFileText style={{ color: MB }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm font-mono" style={{ color: MB }}>{inv.invoiceNo}</p>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-slate">
                      <span>{formatDate(inv.invoiceDate)}</span>
                      {inv.vehicleNo && (
                        <>
                          <span className="text-rim">•</span>
                          <span className="flex items-center gap-1 font-mono text-slate/80">
                            <IconTruck style={{ width: 10, height: 10 }} />
                            {inv.vehicleNo}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <VehicleStatusBadge status={inv.vehicleStatus} />
                    <LocationAndDistance location={inv.location} distanceMeters={inv.distanceMeters} reached={inv.reached} />
                  </div>
                  <IconChevronRight className="text-rim group-hover:text-slate transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {!loading && page < totalPages && (
            <div className="p-4 border-t border-rim">
              <button
                onClick={() => { if (page < totalPages) loadInvoices(page + 1, true) }}
                disabled={loadingMore}
                className="w-full py-2.5 rounded-lg border border-rim text-sm font-medium text-slate transition-colors disabled:opacity-50"
                onMouseEnter={e => { e.currentTarget.style.borderColor = MB; e.currentTarget.style.color = MB }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B' }}
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-rim rounded-full animate-spin" style={{ borderTopColor: MB }} />
                    Loading…
                  </span>
                ) : 'Load more invoices'}
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-rim bg-white py-3 text-center">
        <p className="text-[10px] text-slate/50 font-mono">
          Marico Secondary Dispatch Tracking · Live BLE data
        </p>
      </footer>
    </div>
  )
}
