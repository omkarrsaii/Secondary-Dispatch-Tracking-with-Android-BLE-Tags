import { useEffect, useRef } from 'react'

function InfoRow({ icon, label, value, mono = false, highlight = false }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-rim/60 last:border-0">
      <span className="mt-0.5 text-ember flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-mist mb-0.5 uppercase tracking-widest">{label}</p>
        <p className={`text-sm break-words leading-snug ${mono ? 'font-mono' : ''} ${highlight ? 'text-ok font-semibold' : 'text-snow'}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

function Badge({ text, color = 'ember' }) {
  const colors = {
    ember: 'bg-ember/15 text-glow border-ember/30',
    ok:    'bg-ok/15 text-ok border-ok/30',
    warn:  'bg-warn/15 text-warn border-warn/30',
    mist:  'bg-rim text-mist border-rim',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[color]}`}>
      {text}
    </span>
  )
}

// Meters (a plain number, always road-distance from the backend now — see
// routingService.js) → a friendly "1.2 km" / "350 m" string.
function formatDistance(meters) {
  if (meters == null) return null
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const PIN_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>
)
const CLOCK_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
)

// Vehicle Status badge — one shared vocabulary with the admin dashboard:
// "At Hub" / "In Transit" / "Reached", sourced straight from the backend
// (data.vehicleStatus) rather than re-derived client-side, so the portal
// can never disagree with the admin side over a differently-tuned threshold.
function VehicleStatusBadge({ status }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-rim text-mist border-rim">
        ⚫ Location unavailable
      </span>
    )
  }
  if (status === 'Reached') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-ok/15 text-ok border-ok/30">
        ✓ Reached
      </span>
    )
  }
  if (status === 'At Hub') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-warn/10 text-warn border-warn/30">
        🟠 At Hub
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-ok/15 text-ok border-ok/30">
      🟢 In Transit
    </span>
  )
}

// Horizontal 3-card distance summary — Total (Hub → Destination) / Covered
// / Remaining, all three from the routing engine's road distances (never
// straight-line). Total is always derived as Covered + Remaining rather
// than fetched separately, so the three numbers can never disagree with
// each other.
function DistanceSummaryRow({ coveredMeters, remainingMeters }) {
  if (coveredMeters == null && remainingMeters == null) return null
  const totalMeters = (coveredMeters ?? 0) + (remainingMeters ?? 0)

  const cards = [
    { label: 'Total Distance',     sub: 'Hub → Destination', value: totalMeters,     accent: false },
    { label: 'Covered Distance',   sub: 'Hub → Vehicle',      value: coveredMeters,   accent: false },
    { label: 'Remaining Distance', sub: 'Vehicle → Destination', value: remainingMeters, accent: true },
  ]

  return (
    <div className="py-3 border-b border-rim/60">
      <p className="text-xs text-mist mb-2 uppercase tracking-widest">Road Distance</p>
      <div className="grid grid-cols-3 gap-2">
        {cards.map(c => (
          <div
            key={c.label}
            className={`rounded-xl border px-2.5 py-2.5 text-center ${c.accent ? 'bg-ember/10 border-ember/25' : 'bg-void/40 border-rim'}`}
          >
            <p className={`font-mono font-semibold leading-tight ${c.accent ? 'text-ember' : 'text-snow'} text-[15px]`}>
              {formatDistance(c.value) || '—'}
            </p>
            <p className="text-[10px] text-mist mt-1 leading-tight">{c.label}</p>
            <p className="text-[9px] text-mist/60 leading-tight">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ResultCard({ result }) {
  const cardRef = useRef(null)

  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  const { data } = result
  const loc  = data.location
  const meta = data.meta || {}
  const reached = !!data.reachedDestination

  // Determine battery color
  const batteryNum = parseInt(loc.battery)
  const batteryColor = !batteryNum ? 'mist' : batteryNum > 50 ? 'ok' : batteryNum > 20 ? 'warn' : 'bad'

  // Format timestamps
  function formatTs(ts) {
    if (!ts) return null
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true,
      }).format(new Date(ts))
    } catch { return ts }
  }

  return (
    <div ref={cardRef} className="animate-fade-up mt-2">
      {/* ── Status banner ── */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <span className="relative flex h-3 w-3">
          <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-ok" />
        </span>
        <span className="text-ok font-semibold text-sm tracking-wide">Location found</span>
        <span className="ml-auto text-xs text-mist font-mono">{formatTs(data.trackedAt)}</span>
      </div>

      {/* ── Main card ── */}
      <div className="rounded-2xl border border-rim bg-panel shadow-card overflow-hidden">

        {/* Card header */}
        <div className="px-5 py-4 border-b border-rim flex items-center justify-between gap-3 bg-gradient-to-r from-ember/10 to-transparent">
          <div>
            <p className="text-xs text-mist uppercase tracking-widest mb-0.5">Invoice</p>
            <p className="font-mono text-lg font-semibold text-snow tracking-wide">{data.invoiceNo}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Badge text={`🚛 ${data.vehicleNo}`} color="ember" />
            <Badge text={`📡 ${data.deviceName}`} color="mist" />
          </div>
        </div>

        {/* Details — in order:
            Chain/Customer → Destination → Current Location → Coordinates →
            Road Distance summary (Total / Covered / Remaining, one
            horizontal row) → Departure Time → Vehicle Status → Arrival
            Time → Last Seen → Data Updated At → Battery/Network.
            Everything describing the vehicle's CURRENT position (current
            location, coordinates, distances, last seen, updated-at,
            battery/network, map) only makes sense for an ONGOING trip —
            once Reached, those are replaced by a single completed-trip
            notice, while Destination/Vehicle Status/Departure/Arrival Time
            still show as a summary of what happened. */}
        <div className="px-5">
          {meta.chainName && (
            <InfoRow
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>}
              label="Chain / Customer"
              value={meta.chainName}
            />
          )}

          {/* Destination */}
          {meta.destination && (
            <InfoRow icon={PIN_ICON} label="Destination" value={meta.destination} />
          )}

          {!reached && (
            <>
              {/* Current Location — same value, same field, as the
                  Distributor Portal's Active Invoices list (both come from
                  formatDeviceLocation() server-side), so the two pages can
                  never disagree about where the vehicle currently is.
                  Never falls back to raw coordinates — a distributor
                  shouldn't have to read lat/lng to know where their
                  delivery is. */}
              <InfoRow
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/></svg>}
                label="Current Location"
                value={data.currentLocation || 'Location unavailable'}
                highlight
              />

              {/* Road distance summary — Total / Covered / Remaining, one
                  horizontal row instead of two separate vertical fields. */}
              <DistanceSummaryRow
                coveredMeters={data.distanceFromHubMeters}
                remainingMeters={data.distanceToDestinationMeters}
              />
            </>
          )}

          {/* Departure Time (IST) — a historical fact, shown regardless of
              whether the trip has since completed. */}
          {data.departureTime && (
            <InfoRow icon={CLOCK_ICON} label="Departure Time (IST)" value={data.departureTime} mono />
          )}

          {/* Vehicle Status — always shown */}
          <div className="py-3 border-b border-rim/60">
            <p className="text-xs text-mist mb-1.5 uppercase tracking-widest">Vehicle Status</p>
            <VehicleStatusBadge status={data.vehicleStatus} />
          </div>

          {/* Arrival Time (IST) */}
          {data.arrivalTime && (
            <InfoRow icon={CLOCK_ICON} label="Arrival Time (IST)" value={data.arrivalTime} mono />
          )}

          {!reached ? (
            <>
              {/* Last Seen */}
              <InfoRow icon={CLOCK_ICON} label="Last Seen" value={loc.lastSeen} />

              {/* Data Updated At */}
              <InfoRow
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
                label="Data Updated At"
                value={formatTs(loc.updatedAt)}
              />

              {/* Battery + Network row */}
              {(loc.battery || loc.network) && (
                <div className="flex items-center gap-4 py-3 border-b border-rim/60">
                  {loc.battery && (
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 text-${batteryColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><path d="M23 13v-2"/>
                      </svg>
                      <span className={`text-sm font-mono text-${batteryColor}`}>{loc.battery}%</span>
                      <span className="text-xs text-mist uppercase tracking-widest">Battery</span>
                    </div>
                  )}
                  {loc.network && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
                      </svg>
                      <span className="text-sm font-mono text-snow">{loc.network}</span>
                      <span className="text-xs text-mist uppercase tracking-widest">Network</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // Trip completed — the vehicle may already be on its next
            // delivery, so its current position is no longer relevant to
            // THIS invoice. Live location, coordinates, distances, last
            // seen, and the map are all hidden in favor of this notice.
            <div className="py-4 text-center">
              <p className="text-sm text-mist">Tracking unavailable – Trip completed.</p>
            </div>
          )}
        </div>

        {/* Google Maps deep link — only relevant while the trip is ongoing */}
        {!reached && data.mapsUrl && (
          <div className="px-5 py-4">
            <a
              href={data.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-ember/10 border border-ember/25 text-ember hover:bg-ember/20 hover:border-ember/50 transition-all text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
