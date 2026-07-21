import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getVehicleStatus } from '../vehicleUtils'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const MB  = '#1467B2'
const MG  = '#7DC242'
const MGD = '#5E9F2B'

// Custom Marico-blue pulsing marker
const maricoMarker = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <div style="
        position:absolute;width:40px;height:40px;border-radius:50%;
        background:rgba(20,103,178,0.15);
        animation:pulseRing 1.8s ease-out infinite;
      "></div>
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:${MB};
        border:3px solid #fff;
        box-shadow:0 2px 12px rgba(20,103,178,0.45);
        position:relative;z-index:1;
      "></div>
    </div>
  `,
  iconSize:   [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -24],
})

export default function MapView({ latitude, longitude, label, address }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)

  const lat = parseFloat(latitude)
  const lng = parseFloat(longitude)
  const { status, distance, isActive } = getVehicleStatus(lat, lng)

  useEffect(() => {
    if (!containerRef.current || isNaN(lat) || isNaN(lng)) return

    // Init map
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [lat, lng], zoom: 14,
        zoomControl: true, scrollWheelZoom: false, attributionControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current)
    } else {
      mapRef.current.setView([lat, lng], 14)
    }

    // Update marker
    if (markerRef.current) { markerRef.current.setLatLng([lat, lng]) }
    else { markerRef.current = L.marker([lat, lng], { icon: maricoMarker }).addTo(mapRef.current) }

    const statusSnippet = status ? `
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #E2E8F0;">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${isActive?MGD:'#D97706'};display:inline-block;"></span>
          <span style="font-size:10px;color:${isActive?MGD:'#D97706'};font-weight:600;">${status}</span>
        </div>
        <div style="font-size:10px;color:#64748B;font-family:'JetBrains Mono',monospace;">📍 ${distance.toFixed(2)} km from hub</div>
      </div>` : ''

    markerRef.current.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;padding:4px 2px;min-width:170px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${MB}" stroke-width="2.5">
            <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <span style="font-weight:700;font-size:13px;color:#0A1628;">${label || 'Vehicle'}</span>
        </div>
        ${address ? `<div style="font-size:11px;color:#64748B;line-height:1.4;margin-bottom:3px;">${address}</div>` : ''}
        <div style="font-size:10px;color:#94A3B8;font-family:'JetBrains Mono',monospace;">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        ${statusSnippet}
      </div>
    `).openPopup()

    setTimeout(() => mapRef.current?.invalidateSize(), 100)
  }, [lat, lng, label, address, status, distance, isActive])

  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
  }, [])

  if (isNaN(lat) || isNaN(lng)) return (
    <div className="h-64 flex items-center justify-center bg-panel rounded-2xl border border-rim text-slate text-sm gap-2">
      <svg className="w-5 h-5 text-mist" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25l-4.5-4.5M9 20.25l4.5-4.5M9 20.25V4.5m6 15.75l4.5-4.5m-4.5 4.5l-4.5-4.5M15 20.25V4.5"/>
      </svg>
      Map unavailable — no coordinates
    </div>
  )

  return (
    <div className="animate-fade-up rounded-2xl border border-rim overflow-hidden shadow-card" style={{ animationDelay:'0.1s' }}>
      {/* Map header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-panel border-b border-rim">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color:MB }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
        </svg>
        <span className="text-sm font-bold" style={{ color:MB }}>Live Map</span>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background:MG }} />
          <span className="text-[10px] text-slate font-mono uppercase tracking-widest font-semibold">Live</span>
        </div>
        <span className="ml-auto text-xs text-slate font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
      </div>

      <div ref={containerRef} style={{ height:'320px', width:'100%' }} />
    </div>
  )
}
