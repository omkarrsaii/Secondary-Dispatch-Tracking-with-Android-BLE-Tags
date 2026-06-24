import { useState, useEffect, useCallback } from 'react'
import { getDistributorInvoices } from '../distributorApi'

function VehicleStatusBadge({ status }) {
  if (status === 'Assigned') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ok/15 text-ok border border-ok/30">
        🟢 Assigned
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rim text-mist border border-rim">
      ⚫ Not Assigned
    </span>
  )
}

// Sheet dates are DD.MM.YYYY (e.g. "12.02.2026" = 12th February).
// `new Date(dateStr)` misreads dot-separated dates as MM.DD.YYYY in most
// JS engines — "12.02.2026" silently becomes December 2nd instead of
// February 12th. Parse the day-month-year order explicitly instead.
function formatDate(dateStr) {
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

  // Fallback for any other format (e.g. ISO "2026-06-17") — native parsing
  // is safe for those since there's no day/month ambiguity.
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

const PAGE_SIZE = 20

// Props:
//   distributor = { distributorCode, distributorName, totalActiveInvoices } — from login response
//   onInvoiceClick(invoiceNo) — switches App to the InvoiceTracker view
//   onSignOut() — switches App back to the Login view
export default function DistributorDashboard({ distributor, onInvoiceClick, onSignOut }) {
  const { distributorCode, distributorName, totalActiveInvoices } = distributor

  const [invoices, setInvoices]     = useState([])
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]           = useState(null)

  const loadInvoices = useCallback((pageNum, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true)
    getDistributorInvoices(distributorCode, { page: pageNum, limit: PAGE_SIZE })
      .then(data => {
        // Backend already excludes Status = "Unloaded" before this response
        // is built — filtering happens before rendering, never on the client.
        setInvoices(prev => append ? [...prev, ...data.invoices] : data.invoices)
        setTotalPages(data.totalPages)
        setPage(data.page)
      })
      .catch(err => setError(err.response?.data?.message || 'Could not load invoices.'))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }, [distributorCode])

  useEffect(() => {
    loadInvoices(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorCode])

  const handleLoadMore = () => {
    if (page < totalPages) loadInvoices(page + 1, true)
  }

  return (
    <div className="min-h-dvh dot-grid flex flex-col">
      <header className="sticky top-0 z-30 border-b border-rim/60 bg-ink/90 backdrop-blur-md">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ember/15 border border-ember/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-extrabold text-snow leading-none text-base tracking-wide">FindMyInvoice</p>
            <p className="text-mist text-[10px] font-mono leading-none mt-0.5 tracking-widest uppercase">Invoice Tracker</p>
          </div>
          <button onClick={onSignOut} className="ml-auto text-xs text-mist/60 hover:text-ember transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 pt-8 pb-16">

        {/* Welcome — name only, Distributor Code is never shown anywhere on this page */}
        <div className="mb-6 animate-fade-up">
          <h1 className="font-display font-extrabold text-2xl text-snow leading-tight">
            Welcome, {distributorName}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-6 animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="rounded-2xl border border-rim bg-panel p-5">
            <p className="text-xs text-mist uppercase tracking-widest mb-1">Total Active Invoices</p>
            <p className="text-3xl font-display font-bold text-ember">{totalActiveInvoices}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-bad bg-bad/10 border border-bad/20 rounded-xl px-3 py-2.5 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-rim bg-panel overflow-hidden animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="px-5 py-3 border-b border-rim flex items-center justify-between">
            <h2 className="text-sm font-semibold text-snow">Active Invoices</h2>
            <span className="text-xs text-mist font-mono">{invoices.length} of {totalActiveInvoices}</span>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <span className="w-6 h-6 border-2 border-ember/30 border-t-ember rounded-full animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-mist text-sm">No active invoices found.</div>
          ) : (
            <div className="divide-y divide-rim/60">
              {invoices.map(inv => (
                <button
                  key={inv.invoiceNo}
                  onClick={() => onInvoiceClick(inv.invoiceNo)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-rim/30 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-snow">{inv.invoiceNo}</p>
                    <p className="text-xs text-mist mt-0.5">{formatDate(inv.invoiceDate)}</p>
                  </div>
                  <VehicleStatusBadge status={inv.vehicleStatus} />
                </button>
              ))}
            </div>
          )}

          {!loading && page < totalPages && (
            <div className="p-4 border-t border-rim">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-2.5 rounded-lg border border-rim text-mist hover:text-ember hover:border-ember/40 transition-colors text-sm disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more invoices'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
