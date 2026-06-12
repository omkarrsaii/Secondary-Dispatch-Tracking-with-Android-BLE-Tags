import { useEffect, useRef } from 'react'
import { getVehicleStatus } from '../vehicleUtils'

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

// ── Vehicle Status Row ─────────────────────────────────────────────────────────
function VehicleStatusRow({ vehicleLat, vehicleLon }) {
  const { status, distance, isActive } = getVehicleStatus(vehicleLat, vehicleLon)

  // No coordinates → show "unavailable"
  if (status === null) {
    return (
      <div className="py-3 border-b border-rim/60">
        <p className="text-xs text-mist mb-1.5 uppercase tracking-widest">Vehicle Status</p>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-rim text-mist border-rim">
          ⚫ Location unavailable
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Vehicle Status */}
      <div className="py-3 border-b border-rim/60">
        <p className="text-xs text-mist mb-1.5 uppercase tracking-widest">Vehicle Status</p>
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-ok/15 text-ok border-ok/30">
            🟢 {status}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-warn/10 text-warn border-warn/30">
            🟠 {status}
          </span>
        )}
      </div>

      {/* Distance from Hub */}
      <div className="flex items-start gap-3 py-3 border-b border-rim/60">
        <span className="mt-0.5 text-ember flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-mist mb-0.5 uppercase tracking-widest">Distance from Hub</p>
          <p className="text-sm font-mono text-snow">
            {distance.toFixed(2)} km
          </p>
        </div>
      </div>
    </>
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

        {/* Details grid */}
        <div className="px-5">
          {meta.chainName && (
            <InfoRow
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>}
              label="Chain / Customer"
              value={meta.chainName}
            />
          )}
          {meta.destination && (
            <InfoRow
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
              label="Destination"
              value={meta.destination}
            />
          )}

          <InfoRow
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/></svg>}
            label="Current Location"
            value={loc.address || (loc.latitude ? `${parseFloat(loc.latitude).toFixed(5)}, ${parseFloat(loc.longitude).toFixed(5)}` : null)}
            highlight
          />

          {loc.latitude && loc.longitude && (
            <InfoRow
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>}
              label="Coordinates"
              value={`${parseFloat(loc.latitude).toFixed(6)}, ${parseFloat(loc.longitude).toFixed(6)}`}
              mono
            />
          )}

          {/* ── Vehicle Status + Distance from Hub ── */}
          <VehicleStatusRow vehicleLat={loc.latitude} vehicleLon={loc.longitude} />

          <InfoRow
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
            label="Last Seen"
            value={loc.lastSeen}
          />

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
        </div>

        {/* Google Maps deep link */}
        {data.mapsUrl && (
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
