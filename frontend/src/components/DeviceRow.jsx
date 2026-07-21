import { useNavigate } from 'react-router-dom'
import { MapPin, Signal, ChevronRight } from 'lucide-react'

function VehicleNoCell({ vehicleNo }) {
  if (!vehicleNo) return <span className="text-xs text-m-muted">Not Assigned</span>
  return <span className="text-xs font-mono font-semibold text-m-text">{vehicleNo}</span>
}

// Same green-pill / red-pill visual language as InvoiceStatusPill and
// VehicleStatusPill elsewhere in the app (a filled dot + colored border-pill),
// just with the Active/Inactive palette this column needs.
function DeviceStatusPill({ status }) {
  if (status === 'Active') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
          style={{ background:'rgba(94,159,43,.12)', color:'#5E9F2B', borderColor:'rgba(94,159,43,.25)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />Active
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-m-red-50 text-m-red border-m-red/25">
      <span className="w-1.5 h-1.5 rounded-full bg-current" />Inactive
    </span>
  )
}

function LastSeenBadge({ value }) {
  if (!value) return <span className="text-m-muted/40 text-xs">—</span>
  const isRecent = /minute|just now|second/i.test(value)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
      ${isRecent
        ? 'bg-m-green/10 text-m-green-dk border border-m-green/20'
        : 'bg-m-bg text-m-muted border border-m-border'}`}>
      {isRecent && <span className="w-1.5 h-1.5 rounded-full bg-m-green pulse-dot inline-block" style={{ background:'#7DC242' }} />}
      {value}
    </span>
  )
}

export default function DeviceRow({ device }) {
  const nav = useNavigate()
  return (
    <tr
      className="group border-b border-m-border last:border-0 hover:bg-m-bg cursor-pointer transition-colors"
      onClick={() => nav(`/devices/${device.id}`)}
    >
      {/* Device */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          {device.imageUrl ? (
            <img src={device.imageUrl} alt={device.name}
                 className="w-8 h-8 rounded-lg object-contain border border-m-border bg-m-bg" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-m-blue-50 border border-m-blue-100 flex items-center justify-center flex-shrink-0">
              <Signal size={13} style={{ color: '#0052A5' }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-m-text truncate group-hover:text-m-blue-mid transition-colors"
               style={{ color: undefined }}>
              {device.name}
            </p>
            <p className="text-[11px] text-m-muted font-mono truncate">{device.id}</p>
          </div>
        </div>
      </td>

      {/* Coordinates */}
      <td className="px-4 py-3.5">
        {device.latitude && device.longitude ? (
          <span className="text-xs font-mono text-m-muted">
            {parseFloat(device.latitude).toFixed(4)}, {parseFloat(device.longitude).toFixed(4)}
          </span>
        ) : (
          <span className="text-m-muted/40 text-xs">—</span>
        )}
      </td>

      {/* Location */}
      <td className="px-4 py-3.5">
        <span className="flex items-center gap-1 text-xs text-m-sub">
          <MapPin size={11} style={{ color: '#7DC242' }} />
          {device.city || device.location || '—'}
        </span>
      </td>

      {/* Vehicle No. */}
      <td className="px-4 py-3.5">
        <VehicleNoCell vehicleNo={device.vehicleNo} />
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <DeviceStatusPill status={device.status} />
      </td>

      {/* Last seen */}
      <td className="px-4 py-3.5">
        <LastSeenBadge value={device.lastSeen} />
      </td>

      {/* Arrow */}
      <td className="px-4 py-3.5">
        <ChevronRight size={14} className="text-m-border group-hover:text-m-muted transition-colors" />
      </td>
    </tr>
  )
}
