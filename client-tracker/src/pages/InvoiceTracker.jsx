import { useState, useCallback, useEffect } from 'react'
import SearchBar  from '../components/SearchBar'
import ResultCard from '../components/ResultCard'
import MapView    from '../components/MapView'
import ErrorCard  from '../components/ErrorCard'
import { trackInvoice } from '../api'

const MB = '#1467B2'
const MG = '#7DC242'

function IdleHint() {
  return (
    <div className="mt-10 flex flex-col items-center gap-5 animate-fade-in text-center px-4">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full animate-pulse" style={{ background: '#EBF3FF' }} />
        <svg className="w-10 h-10 relative z-10" fill="none" viewBox="0 0 24 24" strokeWidth="1.6" stroke={MB}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2m8-12l4 8H5.5"/>
        </svg>
      </div>
      <div>
        <p className="font-bold text-base" style={{ color: MB }}>Track your delivery</p>
        <p className="text-slate text-sm mt-1 max-w-xs leading-relaxed">
          Enter the invoice number from your dispatch sheet to see the vehicle's live location.
        </p>
      </div>
    </div>
  )
}

function LoadingPulse() {
  return (
    <div className="mt-10 flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative flex items-center justify-center w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 animate-ping" style={{ borderColor: `${MB}30` }} />
        <div className="absolute inset-2 rounded-full border-2 animate-pulse" style={{ borderColor: `${MB}40` }} />
        <svg className="w-6 h-6 animate-spin-slow relative z-10" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke={MB} strokeWidth="2.5" />
          <path fill={MB} className="opacity-80" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <p className="text-slate text-sm font-medium">Locating vehicle…</p>
    </div>
  )
}

export default function InvoiceTracker({ initialInvoice, onBack }) {
  const [state,   setState]   = useState('idle')
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
    if (initialInvoice) handleSearch(initialInvoice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh: re-fetch the tracking data periodically so the location
  // and map update on their own whenever the vehicle's position changes,
  // without the person needing to tap "Refresh now" — matches the backend
  // fetch/geofence cycle rather than the frontend re-deriving anything.
  // Silent (doesn't flip back to the loading spinner) so the card doesn't
  // flicker every cycle. Stops once the delivery has Reached — there's
  // nothing left to refresh at that point.
  useEffect(() => {
    if (state !== 'result' || !lastInv || result?.data?.reachedDestination) return
    const intervalId = setInterval(async () => {
      try {
        const data = await trackInvoice(lastInv)
        setResult(data)
      } catch {
        // A silent refresh failing shouldn't disrupt what's already on
        // screen — the next tick (or a manual "Refresh now") will retry.
      }
    }, 45000)
    return () => clearInterval(intervalId)
  }, [state, lastInv, result?.data?.reachedDestination])

  const loc = result?.data?.location
  const data = result?.data

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
            <p className="text-[10px] text-slate tracking-widest uppercase leading-none mt-0.5 font-mono">
              {initialInvoice ? `Invoice ${initialInvoice}` : 'Invoice Tracker'}
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="ml-auto flex items-center gap-1.5 text-xs text-slate transition-colors"
              onMouseEnter={e => e.currentTarget.style.color = MB}
              onMouseLeave={e => e.currentTarget.style.color = ''}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
              </svg>
              My Invoices
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 pt-8 pb-16 flex flex-col">

        {!initialInvoice && (
          <>
            <div className="mb-6 animate-fade-up">
              <h1 className="font-extrabold text-2xl leading-tight" style={{ color: MB }}>
                Where is my delivery?
              </h1>
              <p className="text-slate text-sm mt-1.5">
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
            {/* Live Map only for an ongoing trip — once Reached, the vehicle
                may already be en route to its next delivery, so showing
                "where it is now" here would be misleading rather than just
                unnecessary. ResultCard already shows the completed-trip
                notice in this case. */}
            {!data?.reachedDestination && loc?.latitude && loc?.longitude && (
              <MapView
                vehicle={{ latitude: loc.latitude, longitude: loc.longitude, label: data.vehicleNo, address: loc.address }}
                hub={data.hub}
                destination={data.destination}
                route={data.route}
              />
            )}
            <p className="text-center text-xs text-slate/50 pt-2">
              {data?.reachedDestination
                ? 'This delivery has been completed.'
                : (<>Location updates automatically as the vehicle moves.{' '}
                    <button
                      onClick={() => handleSearch(lastInv)}
                      className="font-medium underline underline-offset-2 transition-colors"
                      style={{ color: MB }}
                    >
                      Refresh now
                    </button>
                  </>)}
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-rim bg-white py-3 text-center">
        <p className="text-[10px] text-slate/50 font-mono">
          Marico Secondary Dispatch Tracking · Live BLE data
        </p>
      </footer>
    </div>
  )
}
