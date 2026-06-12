import { useNavigate } from 'react-router-dom'
import { MapPin, Battery, Wifi, Clock, ExternalLink, Smartphone } from 'lucide-react'

function BatteryBar({ value }) {
  const pct = parseInt(value)
  if (isNaN(pct)) return <span className="text-hub-muted text-xs">—</span>
  const color = pct > 50 ? 'bg-hub-green' : pct > 20 ? 'bg-hub-yellow' : 'bg-hub-red'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-hub-border overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-hub-text font-mono">{pct}%</span>
    </div>
  )
}

export default function DeviceRow({ device }) {
  const navigate = useNavigate()
  const hasLocation = device.latitude && device.longitude

  return (
    <tr
      className="border-b border-hub-border hover:bg-white/[0.02] cursor-pointer transition-colors group"
      onClick={() => navigate(`/devices/${device.id}`)}
    >
      {/* Device */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {device.imageUrl ? (
            <img src={device.imageUrl} alt={device.name} className="w-8 h-8 rounded-lg object-contain bg-hub-bg border border-hub-border" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-hub-bg border border-hub-border flex items-center justify-center">
              <Smartphone size={14} className="text-hub-muted" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-hub-text group-hover:text-hub-accent transition-colors">{device.name}</p>
            <p className="text-xs text-hub-muted font-mono">ID:{device.id}</p>
          </div>
        </div>
      </td>

      {/* Coordinates */}
      <td className="px-4 py-3">
        {hasLocation ? (
          <div className="font-mono text-xs">
            <p className="text-hub-text">{parseFloat(device.latitude).toFixed(5)}</p>
            <p className="text-hub-muted">{parseFloat(device.longitude).toFixed(5)}</p>
          </div>
        ) : (
          <span className="text-hub-muted text-xs">Unknown</span>
        )}
      </td>

      {/* Location */}
      <td className="px-4 py-3">
        <div className="flex items-start gap-1.5">
          <MapPin size={13} className="text-hub-accent mt-0.5 flex-shrink-0" />
          <span className="text-xs text-hub-text leading-relaxed">
            {device.location || 'Unknown'}
          </span>
        </div>
      </td>

      {/* Battery */}
      <td className="px-4 py-3">
        <BatteryBar value={device.battery} />
      </td>

      {/* Network */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Wifi size={12} className="text-hub-green" />
          <span className="text-xs text-hub-text">{device.network || '—'}</span>
        </div>
      </td>

      {/* Last Seen */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-hub-muted" />
          <span className="text-xs text-hub-muted">{device.lastSeen || '—'}</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasLocation && (
            <a
              href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent transition-colors"
              title="Open in Maps"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}
