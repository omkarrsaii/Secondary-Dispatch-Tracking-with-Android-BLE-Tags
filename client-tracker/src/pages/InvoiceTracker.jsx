import { useState, useCallback, useEffect } from 'react'
import SearchBar  from '../components/SearchBar'
import ResultCard from '../components/ResultCard'
import MapView    from '../components/MapView'
import ErrorCard  from '../components/ErrorCard'
import { trackInvoice } from '../api'

// ─── Idle / skeleton state illustrations ──────────────────────────────────────
// Unchanged from the original app — copied verbatim.

function IdleHint() {
  return (
    <div className="mt-10 flex flex-col items-center gap-6 animate-fade-in text-center px-4">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-ember/10 animate-pulse" />
        <svg className="w-12 h-12 text-ember/70 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2m8-12l4 8H5.5"/>
        </svg>
      </div>

      <div>
        <p className="text-snow font-semibold text-lg">Track your delivery</p>
        <p className="text-mist text-sm mt-1 max-w-xs leading-relaxed">
          Enter the invoice number from your dispatch sheet to see the vehicle's live location.
        </p>
      </div>
    </div>
  )
}

function LoadingPulse() {
  return (
    <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-ember/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border-2 border-ember/40 animate-pulse" />
        <svg className="w-7 h-7 text-ember animate-spin-slow relative z-10" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <p className="text-mist text-sm">Locating vehicle…</p>
    </div>
  )
}

// ─── InvoiceTracker ────────────────────────────────────────────────────────────
// This is the EXACT existing tracking page content — same state machine
// (idle/loading/result/error), same components, same trackInvoice() call.
// Only two things changed from the original App.jsx:
//   1. It no longer reads the URL — it receives an optional `initialInvoice`
//      prop and auto-runs that search once on mount (used when a distributor
//      clicks an invoice in their dashboard).
//   2. The old "Distributor Portal →" footer link is replaced with
//      `onBack`, since this view is now reached FROM the dashboard rather
//      than being the default landing page.
export default function InvoiceTracker({ initialInvoice, onBack }) {
  const [state,   setState]   = useState('idle')   // 'idle' | 'loading' | 'result' | 'error'
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)
  const [lastInv, setLastInv] = useState('')

  const handleSearch = useCallback(async (invoiceNo) => {
    setLastInv(invoiceNo)
    setState('loading')
    setResult(null)
    setError(null)

    try {
      const data = await trackInvoice(invoiceNo)
      setResult(data)
      setState('result')
    } catch (err) {
      setError(err)
      setState('error')
    }
  }, [])

  useEffect(() => {
    if (initialInvoice) {
      handleSearch(initialInvoice)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loc = result?.data?.location

  return (
    <div className="min-h-dvh dot-grid flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-rim/60 bg-ink/90 backdrop-blur-md">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ember/15 border border-ember/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2m8-12l4 8H5.5"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-extrabold text-snow leading-none text-base tracking-wide">FindMyInvoice</p>
            <p className="text-mist text-[10px] font-mono leading-none mt-0.5 tracking-widest uppercase">Invoice Tracker</p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="ml-auto text-xs text-mist/60 hover:text-ember transition-colors"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-xl mx-auto w-full px-4 pt-8 pb-16 flex flex-col">

        {/* This generic "search any invoice" intro only makes sense when
            there's no invoice already chosen. When reached from the
            distributor dashboard (initialInvoice is set), the distributor
            already picked a specific invoice — there's nothing to search. */}
        {!initialInvoice && (
          <>
            <div className="mb-6 animate-fade-up">
              <h1 className="font-display font-extrabold text-2xl text-snow leading-tight">
                Where is my delivery?
              </h1>
              <p className="text-mist text-sm mt-1">
                Real-time vehicle location from your invoice number.
              </p>
            </div>

            <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
              <SearchBar onSearch={handleSearch} loading={state === 'loading'} />
            </div>
          </>
        )}

        {state === 'idle'    && <IdleHint />}
        {state === 'loading' && <LoadingPulse />}
        {state === 'error'   && <ErrorCard error={error} />}

        {state === 'result' && result && (
          <div className="mt-6 space-y-4">
            <ResultCard result={result} />

            {loc?.latitude && loc?.longitude && (
              <MapView
                latitude={loc.latitude}
                longitude={loc.longitude}
                label={result.data.vehicleNo}
                address={loc.address}
              />
            )}

            <p className="text-center text-xs text-mist/50 pt-2">
              Data refreshes automatically every few minutes. &nbsp;
              <button
                onClick={() => handleSearch(lastInv)}
                className="text-ember/70 hover:text-ember underline underline-offset-2 transition-colors"
              >
                Refresh now
              </button>
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-rim/40 py-4 text-center">
        <p className="text-xs text-mist/40 font-mono">
          Powered by&nbsp;
          <span className="text-ember/60">Find Hub Tracker</span>
          &nbsp;· Live device data
        </p>
      </footer>
    </div>
  )
}
