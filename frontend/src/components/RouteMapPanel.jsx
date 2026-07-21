import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin as MapPinIcon, AlertCircle } from 'lucide-react'
import { getRouteMap } from '../lib/api'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const MB   = '#1467B2'
const MG   = '#7DC242'
const MGD  = '#5E9F2B'
const GREY = '#94A3B8'

// Same live-position poll cadence already used by DeviceDetail.jsx, reused
// here so vehicle markers/distributor status move without a page refresh.
const REFRESH_MS = 30000

function depotIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:8px;background:${MB};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(20,103,178,.4);border:3px solid #fff;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
    </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18],
  })
}

function distributorIcon(deliveryStatus) {
  const color = deliveryStatus === 'completed' ? MGD : deliveryStatus === 'current' ? MB : GREY
  const pulse = deliveryStatus === 'current'
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
      ${pulse ? `<div style="position:absolute;width:26px;height:26px;border-radius:50%;background:${color}33;animation:pulseRing 1.8s ease-out infinite;"></div>` : ''}
      <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.3);position:relative;z-index:1;"></div>
    </div>`,
    iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -16],
  })
}

function vehicleIcon(status) {
  const color = status === 'out_for_delivery' ? MG : GREY
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:${color}33;animation:pulseRing 1.8s ease-out infinite;"></div>
      <div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;position:relative;z-index:1;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      </div>
    </div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -19],
  })
}

function deliveryStatusMeta(status) {
  if (status === 'completed') return { text: 'Delivered',          color: MGD }
  if (status === 'current')   return { text: 'Current destination', color: MB }
  return { text: 'Pending', color: GREY }
}

function LegendItem({ color, label, square }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block flex-shrink-0" style={{
        width: 10, height: 10, background: color,
        borderRadius: square ? 3 : '50%',
        border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.12)',
      }} />
      <span className="text-[11px] text-m-muted whitespace-nowrap">{label}</span>
    </div>
  )
}

export default function RouteMapPanel({ routeName, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const layerGroupRef  = useRef(null)

  const load = useCallback((isBackgroundRefresh) => {
    if (!isBackgroundRefresh) setLoading(true)
    setError(null)
    getRouteMap(routeName)
      .then(setData)
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => { if (!isBackgroundRefresh) setLoading(false) })
  }, [routeName])

  useEffect(() => { load(false) }, [load])

  // Automatic refresh — vehicle positions and distributor delivery status
  // update in place on the same map instance, no page/panel reload.
  useEffect(() => {
    const iv = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(iv)
  }, [load])

  // Initialize the Leaflet map exactly once for the life of this panel.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = L.map(containerRef.current, {
      zoomControl: true, scrollWheelZoom: true, attributionControl: true,
    }).setView([17.608504, 78.528605], 8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current)
    layerGroupRef.current = L.layerGroup().addTo(mapRef.current)

    return () => { mapRef.current?.remove(); mapRef.current = null; layerGroupRef.current = null }
  }, [])

  // Redraw everything whenever fresh data arrives (initial load or the
  // 30s auto-refresh) — this is what makes vehicle markers move and
  // distributor pins change color live, without touching the page.
  useEffect(() => {
    if (!data || !mapRef.current || !layerGroupRef.current) return
    layerGroupRef.current.clearLayers()
    const bounds = []

    if (data.depot) {
      const { latitude, longitude } = data.depot
      L.marker([latitude, longitude], { icon: depotIcon() })
        .bindPopup(`<div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;"><b>Depot</b><br/><span style="font-size:11px;color:#64748B;">Route start</span></div>`)
        .addTo(layerGroupRef.current)
      bounds.push([latitude, longitude])
    }

    // Actual road-route polyline (dashed if it had to fall back to a
    // straight line because the routing engine was unreachable).
    if (data.routePolyline?.length > 1) {
      L.polyline(data.routePolyline, {
        color: MB, weight: 4, opacity: 0.65,
        dashArray: data.routeSource === 'straight-line' ? '6,6' : null,
      }).addTo(layerGroupRef.current)
      data.routePolyline.forEach(p => bounds.push(p))
    }

    ;(data.distributors || []).forEach(d => {
      if (d.latitude == null || d.longitude == null) return
      const { text, color } = deliveryStatusMeta(d.deliveryStatus)
      L.marker([d.latitude, d.longitude], { icon: distributorIcon(d.deliveryStatus) })
        .bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;min-width:190px;">
            <div style="font-weight:700;font-size:13px;color:#0A1628;margin-bottom:2px;">${d.distributorName || d.distributorCode}</div>
            <div style="font-size:11px;color:#94A3B8;font-family:'JetBrains Mono',monospace;margin-bottom:4px;">${d.distributorCode}</div>
            <div style="font-size:11px;color:#64748B;line-height:1.6;">
              HQ: ${d.city || '—'}<br/>
              TSOE: ${d.tsoeName || '—'}<br/>
              Active invoices: ${d.invoiceCount}<br/>
              Vehicle: ${d.vehicleNo || 'Not assigned'}
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #E2E8F0;display:flex;align-items:center;gap:4px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>
              <span style="font-size:10px;color:${color};font-weight:700;">${text}</span>
            </div>
          </div>
        `)
        .addTo(layerGroupRef.current)
      bounds.push([d.latitude, d.longitude])
    })

    ;(data.vehicles || []).forEach(v => {
      if (v.latitude == null || v.longitude == null) return
      const isActive = v.status === 'out_for_delivery'
      L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.status), zIndexOffset: 1000 })
        .bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;min-width:190px;">
            <div style="font-weight:700;font-size:13px;color:#0A1628;margin-bottom:2px;font-family:'JetBrains Mono',monospace;">${v.vehicleNo}</div>
            <div style="font-size:11px;color:#64748B;line-height:1.6;">
              BLE Tag: ${v.deviceName || '—'}<br/>
              Location: ${v.location || '—'}<br/>
              Last updated: ${v.lastSeen || '—'}<br/>
              Active invoices: ${v.invoiceCount}
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #E2E8F0;display:flex;align-items:center;gap:4px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${isActive?MGD:'#94A3B8'};display:inline-block;"></span>
              <span style="font-size:10px;color:${isActive?MGD:'#94A3B8'};font-weight:700;">${isActive?'Out for delivery':v.status==='inactive'?'Inactive':'Unknown'}</span>
            </div>
          </div>
        `)
        .addTo(layerGroupRef.current)
      bounds.push([v.latitude, v.longitude])
    })

    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    setTimeout(() => mapRef.current?.invalidateSize(), 100)
  }, [data])

  const distributors     = data?.distributors || []
  const completedCount   = distributors.filter(d => d.deliveryStatus === 'completed').length
  const currentCount     = distributors.filter(d => d.deliveryStatus === 'current').length
  const pendingCount     = distributors.filter(d => d.deliveryStatus === 'pending').length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-m-text/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-screen bg-m-surface border-l border-m-border overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-m-border bg-m-bg flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPinIcon size={15} className="text-m-blue flex-shrink-0" />
              <h2 className="font-bold text-m-text truncate">{routeName}</h2>
            </div>
            {data && (
              <p className="text-xs text-m-muted mt-0.5 truncate">
                ASM: {data.asmName || '—'} · {distributors.length} distributors · {(data.vehicles || []).length} vehicles
                {' · '}<span style={{ color: MGD }}>{completedCount} delivered</span>
                {' · '}<span style={{ color: MB }}>{currentCount} in transit</span>
                {' · '}<span className="text-m-muted">{pendingCount} pending</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-m-muted hover:text-m-text transition-colors px-2 py-1 text-sm rounded-lg hover:bg-m-border/30 flex-shrink-0">✕ Close</button>
        </div>

        <div className="relative flex-1 min-h-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-m-surface z-[1000]">
              <div className="w-6 h-6 border-2 border-m-border rounded-full animate-spin" style={{ borderTopColor: MB }} />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-m-surface z-[1000] p-6">
              <div className="flex items-center gap-2 text-m-red bg-m-red-50 border border-m-red/25 rounded-xl p-4">
                <AlertCircle size={15} /><span className="text-sm">{error}</span>
              </div>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>

        <div className="px-5 py-3 border-t border-m-border bg-m-bg flex items-center gap-5 flex-wrap flex-shrink-0">
          <LegendItem color={MB}   label="Depot" square />
          <LegendItem color={GREY} label="Pending distributor" />
          <LegendItem color={MB}   label="Current destination" />
          <LegendItem color={MGD}  label="Delivered" />
          <LegendItem color={MG}   label="Vehicle — out for delivery" />
          <LegendItem color={GREY} label="Vehicle — inactive" />
        </div>
      </div>
    </div>
  )
}
