import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { getVehicleStatus } from '../vehicleUtils'

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

// Custom pulsing ember marker
const emberIcon = L.divIcon({
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

export default function MapView({ latitude, longitude, label, address }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)

  const lat = parseFloat(latitude)
  const lng = parseFloat(longitude)

  // Compute vehicle status for popup
  const { status, distance, isActive } = getVehicleStatus(lat, lng)

  useEffect(() => {
    if (!containerRef.current || isNaN(lat) || isNaN(lng)) return

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
    } else {
      mapRef.current.setView([lat, lng], 14)
    }

    // Update marker
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      markerRef.current = L.marker([lat, lng], { icon: emberIcon })
        .addTo(mapRef.current)
    }

    // Build status snippet for popup (only when coordinates are valid)
    const statusSnippet = status
      ? `
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid #1E293B;">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
            <span style="font-size:10px;">${isActive ? '🟢' : '🟠'}</span>
            <span style="font-size:10px;color:${isActive ? '#4ADE80' : '#FB923C'};font-weight:600;">
              ${status}
            </span>
          </div>
          <div style="font-size:10px;color:#64748B;font-family:'JetBrains Mono',monospace;">
            📍 ${distance.toFixed(2)} km from hub
          </div>
        </div>
      `
      : ''

    // Popup
    const popupContent = `
      <div style="font-family:'Outfit',sans-serif;padding:4px 2px;min-width:160px;">
        <div style="font-weight:700;font-size:13px;color:#F1F5F9;margin-bottom:4px;">
          🚛 ${label || 'Vehicle'}
        </div>
        ${address ? `<div style="font-size:11px;color:#94A3B8;line-height:1.4;">${address}</div>` : ''}
        <div style="font-size:10px;color:#64748B;margin-top:4px;font-family:'JetBrains Mono',monospace;">
          ${lat.toFixed(5)}, ${lng.toFixed(5)}
        </div>
        ${statusSnippet}
      </div>
    `
    markerRef.current.bindPopup(popupContent).openPopup()

    // Invalidate size after DOM paint
    setTimeout(() => mapRef.current?.invalidateSize(), 100)

    return () => {
      // Keep map alive for re-renders; only destroy on full unmount
    }
  }, [lat, lng, label, address, status, distance, isActive])

  // Full destroy on component unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current  = null
        markerRef.current = null
      }
    }
  }, [])

  if (isNaN(lat) || isNaN(lng)) {
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
        <span className="ml-auto text-xs text-mist font-mono">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
      </div>

      {/* Leaflet map container */}
      <div ref={containerRef} style={{ height: '320px', width: '100%' }} />
    </div>
  )
}
