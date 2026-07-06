import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Fix default marker icons broken by Vite/Webpack asset handling
import markerIcon2x  from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon    from 'leaflet/dist/images/marker-icon.png'
import markerShadow  from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
})

// ── Vehicle marker — pulsing ember dot ──────────────────────────────────────
const vehicleIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <div style="
        position:absolute;
        width:36px;height:36px;
        border-radius:50%;
        background:rgba(249,115,22,0.18);
        animation:pulseRing 1.8s ease-out infinite;
      "></div>
      <div style="
        width:16px;height:16px;
        border-radius:50%;
        background:#F97316;
        border:2.5px solid #fff;
        box-shadow:0 0 10px rgba(249,115,22,0.7);
        position:relative;z-index:1;
      "></div>
    </div>
  `,
  iconSize:   [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
})

// ── Depot marker — small warehouse glyph in a circle ────────────────────────
const depotIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width:28px;height:28px;border-radius:50%;
      background:#1E3A5F;border:2.5px solid #fff;
      box-shadow:0 0 6px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2.2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 9.5L12 3l9 6.5M5 8v11a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V8"/>
      </svg>
    </div>
  `,
  iconSize:   [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
})

// ── Destination marker — Google-Maps-style dropped teardrop pin ────────────
const destinationIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:30px;height:42px;">
      <svg width="30" height="42" viewBox="0 0 30 42" style="position:absolute;top:0;left:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45));">
        <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.716 23.284 0 15 0z" fill="#EF4444"/>
        <circle cx="15" cy="15" r="6" fill="#fff"/>
      </svg>
    </div>
  `,
  iconSize:   [30, 42],
  iconAnchor: [15, 42], // tip of the pin points at the coordinate
  popupAnchor: [0, -40],
})

/**
 * Live Map — depot, vehicle, and destination markers plus the actual road
 * route split into two legs so the trip reads like real navigation instead
 * of a single dot on a blank map:
 *   - traveled  (depot → vehicle)   solid teal line — distance already covered
 *   - remaining (vehicle → destination) dashed amber line — distance still to go
 *
 * Both polylines come straight from the backend's routingService road-route
 * response (same call that produced the distance figures shown in
 * ResultCard), so the line drawn here always matches the numbers next to it.
 *
 * Props:
 *   vehicle:     { latitude, longitude, label, address }
 *   hub:         { latitude, longitude } | null
 *   destination: { latitude, longitude } | null
 *   route:       { traveled: [[lat,lng],...]|null, remaining: [[lat,lng],...]|null }
 *   vehicleStatus, distanceFromHubMeters, distanceToDestinationMeters — for the popup, sourced from the backend (never recomputed client-side)
 */
export default function MapView({
  vehicle, hub, destination, route,
  vehicleStatus, distanceFromHubMeters, distanceToDestinationMeters,
}) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const vehicleMarker = useRef(null)
  const depotMarker    = useRef(null)
  const destMarker      = useRef(null)
  const traveledLine     = useRef(null)
  const remainingLine     = useRef(null)

  const lat = parseFloat(vehicle?.latitude)
  const lng = parseFloat(vehicle?.longitude)
  const hasVehicleCoords = !isNaN(lat) && !isNaN(lng)

  useEffect(() => {
    if (!containerRef.current || !hasVehicleCoords) return

    // Inject pulse keyframe once
    if (!document.getElementById('ember-pulse-style')) {
      const style = document.createElement('style')
      style.id = 'ember-pulse-style'
      style.textContent = `
        @keyframes pulseRing {
          0%   { transform:scale(0.8); opacity:0.9; }
          70%  { transform:scale(1.8); opacity:0; }
          100% { transform:scale(1.8); opacity:0; }
        }
      `
      document.head.appendChild(style)
    }

    // Init map
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center:          [lat, lng],
        zoom:            14,
        zoomControl:     true,
        scrollWheelZoom: false,
        attributionControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current)
    }

    const map = mapRef.current
    const bounds = []

    // ── Vehicle marker ──
    if (vehicleMarker.current) {
      vehicleMarker.current.setLatLng([lat, lng])
    } else {
      vehicleMarker.current = L.marker([lat, lng], { icon: vehicleIcon }).addTo(map)
    }
    bounds.push([lat, lng])

    const statusColor = vehicleStatus === 'Reached' ? '#4ADE80' : vehicleStatus === 'At Hub' ? '#FB923C' : '#4ADE80'
    const statusSnippet = vehicleStatus ? `
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #1E293B;">
        <div style="font-size:10px;color:${statusColor};font-weight:600;margin-bottom:3px;">${vehicleStatus}</div>
        ${distanceFromHubMeters != null ? `<div style="font-size:10px;color:#64748B;font-family:'JetBrains Mono',monospace;">📍 ${(distanceFromHubMeters/1000).toFixed(2)} km from hub (road)</div>` : ''}
        ${distanceToDestinationMeters != null ? `<div style="font-size:10px;color:#64748B;font-family:'JetBrains Mono',monospace;">🏁 ${(distanceToDestinationMeters/1000).toFixed(2)} km to destination (road)</div>` : ''}
      </div>
    ` : ''

    vehicleMarker.current.bindPopup(`
      <div style="font-family:'Outfit',sans-serif;padding:4px 2px;min-width:170px;">
        <div style="font-weight:700;font-size:13px;color:#F1F5F9;margin-bottom:4px;">🚛 ${vehicle?.label || 'Vehicle'}</div>
        ${vehicle?.address ? `<div style="font-size:11px;color:#94A3B8;line-height:1.4;">${vehicle.address}</div>` : ''}
        <div style="font-size:10px;color:#64748B;margin-top:4px;font-family:'JetBrains Mono',monospace;">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        ${statusSnippet}
      </div>
    `).openPopup()

    // ── Depot marker ──
    if (hub?.latitude != null && hub?.longitude != null) {
      const hLat = parseFloat(hub.latitude), hLng = parseFloat(hub.longitude)
      if (depotMarker.current) depotMarker.current.setLatLng([hLat, hLng])
      else depotMarker.current = L.marker([hLat, hLng], { icon: depotIcon }).addTo(map)
      depotMarker.current.bindPopup(`<div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:12px;color:#F1F5F9;">🏭 Depot</div>`)
      bounds.push([hLat, hLng])
    } else if (depotMarker.current) {
      map.removeLayer(depotMarker.current); depotMarker.current = null
    }

    // ── Destination marker (dropped pin) ──
    if (destination?.latitude != null && destination?.longitude != null) {
      const dLat = parseFloat(destination.latitude), dLng = parseFloat(destination.longitude)
      if (destMarker.current) destMarker.current.setLatLng([dLat, dLng])
      else destMarker.current = L.marker([dLat, dLng], { icon: destinationIcon }).addTo(map)
      destMarker.current.bindPopup(`<div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:12px;color:#F1F5F9;">📍 Destination</div>`)
      bounds.push([dLat, dLng])
    } else if (destMarker.current) {
      map.removeLayer(destMarker.current); destMarker.current = null
    }

    // ── Traveled route (depot → vehicle), solid teal ──
    if (traveledLine.current) { map.removeLayer(traveledLine.current); traveledLine.current = null }
    if (route?.traveled?.length > 1) {
      traveledLine.current = L.polyline(route.traveled, { color: '#2DD4BF', weight: 4, opacity: 0.85 }).addTo(map)
      route.traveled.forEach(p => bounds.push(p))
    }

    // ── Remaining route (vehicle → destination), dashed amber ──
    if (remainingLine.current) { map.removeLayer(remainingLine.current); remainingLine.current = null }
    if (route?.remaining?.length > 1) {
      remainingLine.current = L.polyline(route.remaining, { color: '#F59E0B', weight: 4, opacity: 0.85, dashArray: '8, 8' }).addTo(map)
      route.remaining.forEach(p => bounds.push(p))
    }

    // Fit everything in view — depot, vehicle, destination, and both route
    // legs — so the whole trip reads like a real map, not just a dot.
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 })
    } else {
      map.setView([lat, lng], 14)
    }

    setTimeout(() => map.invalidateSize(), 100)
  }, [lat, lng, vehicle?.label, vehicle?.address, hub?.latitude, hub?.longitude,
      destination?.latitude, destination?.longitude, route, vehicleStatus,
      distanceFromHubMeters, distanceToDestinationMeters, hasVehicleCoords])

  // Full destroy on component unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        vehicleMarker.current = null
        depotMarker.current = null
        destMarker.current = null
        traveledLine.current = null
        remainingLine.current = null
      }
    }
  }, [])

  if (!hasVehicleCoords) {
    return (
      <div className="h-64 flex items-center justify-center bg-panel rounded-2xl border border-rim text-mist text-sm gap-2">
        <svg className="w-5 h-5 text-mist/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25l-4.5-4.5M9 20.25l4.5-4.5M9 20.25V4.5m6 15.75l4.5-4.5m-4.5 4.5l-4.5-4.5M15 20.25V4.5"/>
        </svg>
        Map unavailable — no coordinates
      </div>
    )
  }

  return (
    <div className="animate-fade-up rounded-2xl border border-rim overflow-hidden shadow-card" style={{ animationDelay: '0.1s' }}>
      {/* Map header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-panel border-b border-rim">
        <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
        </svg>
        <span className="text-sm font-semibold text-snow">Live Map</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-mist">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#2DD4BF]" />Traveled</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: 'repeating-linear-gradient(90deg,#F59E0B 0 4px,transparent 4px 8px)' }} />Remaining</span>
        </div>
      </div>

      {/* Leaflet map container */}
      <div ref={containerRef} style={{ height: '360px', width: '100%' }} />
    </div>
  )
}
