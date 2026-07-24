import { Smartphone, Clock, Timer, Wifi, MapPin, Activity, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDevices } from '../hooks/useDevices'
import StatCard from '../components/StatCard'
import DeviceRow from '../components/DeviceRow'
import Header from '../components/Header'
import SessionExpiredBanner from '../components/SessionExpiredBanner'

export default function Dashboard() {
  const { devices, status, loading, refreshing, refresh } = useDevices()
  const navigate = useNavigate()

  const onlineDevices = devices.filter(d => d.status === 'Active')
  const lastSync = status?.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'

  return (
    <div className="min-h-screen bg-m-bg">
      <Header title="Dashboard" status={status} refreshing={refreshing} onRefresh={refresh} />

      {status?.sessionExpired && <SessionExpiredBanner />}

      <div className="p-6 space-y-6 animate-fade-in">

        {/* Welcome strip */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-m-text">Overview</h2>
            <p className="text-sm text-m-muted mt-0.5">Secondary dispatch tracking · real-time BLE data</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-m-surface border border-m-border shadow-card">
            <TrendingUp size={13} style={{ color: '#7DC242' }} />
            <span className="text-xs font-medium text-m-sub">
              {((onlineDevices.length / (devices.length || 1)) * 100).toFixed(0)}% devices active
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Smartphone} label="Total Devices"    value={devices.length}                            color="blue"  />
          <StatCard icon={Wifi}       label="Recently Active"  value={onlineDevices.length} sub="last few minutes" color="green" />
          <StatCard icon={Clock}      label="Last Sync"        value={lastSync}             sub="auto-refreshing"  color="teal"  />
          <StatCard
            icon={Timer}
            label="Fetch Interval"
            value={`${status?.scheduler?.interval ?? '—'}m`}
            sub="configurable"
            color="amber"
          />
        </div>

        {/* Devices table */}
        <div className="bg-m-surface rounded-xl shadow-card overflow-hidden border border-m-border">
          <div className="px-5 py-4 border-b border-m-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Activity size={15} style={{ color: '#003087' }} />
              <h2 className="font-bold text-sm text-m-text">All Devices</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: '#EBF3FF', color: '#003087' }}>
                {devices.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-m-border border-t-m-blue-mid rounded-full animate-spin"
                   style={{ borderTopColor: '#0052A5' }} />
              <p className="text-m-muted text-sm">Loading devices…</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="py-16 text-center">
              <Smartphone size={28} className="text-m-border mx-auto mb-3" />
              <p className="text-m-muted text-sm font-medium">No devices found</p>
              <p className="text-m-muted/60 text-xs mt-1">Run a refresh or check your session</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-m-border bg-m-bg">
                    {['Device', 'Coordinates', 'Location', 'Vehicle No.', 'Status', 'Last Seen', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-m-muted uppercase tracking-widest">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => <DeviceRow key={device.id} device={device} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Location preview grid */}
        {devices.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} style={{ color: '#7DC242' }} />
              <h2 className="font-bold text-sm text-m-text">Quick Location View</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map(device => (
                <div
                  key={device.id}
                  className="bg-m-surface rounded-xl shadow-card border border-m-border overflow-hidden cursor-pointer group hover:shadow-card-hover transition-shadow"
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  {/* Card header */}
                  <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-m-border">
                    {device.imageUrl ? (
                      <img src={device.imageUrl} alt={device.name}
                           className="w-8 h-8 rounded-lg object-contain border border-m-border bg-m-bg" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                           style={{ background: '#EBF3FF' }}>
                        <Smartphone size={14} style={{ color: '#0052A5' }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-m-text truncate group-hover:text-m-blue-mid transition-colors">
                        {device.name}
                      </p>
                      <p className="text-[11px] text-m-muted">{device.lastSeen || 'Unknown'}</p>
                    </div>
                    {device.battery && (
                      <span className="text-xs font-mono font-semibold"
                            style={{ color: parseInt(device.battery) > 30 ? '#7DC242' : '#DC2626' }}>
                        {device.battery}%
                      </span>
                    )}
                  </div>

                  {/* Map thumbnail */}
                  {device.latitude && device.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
                      target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="block"
                    >
                      <img
                        src={`https://maps.googleapis.com/maps/api/staticmap?center=${device.latitude},${device.longitude}&zoom=13&size=400x120&markers=color:0x003087|${device.latitude},${device.longitude}`}
                        alt="Location"
                        className="w-full h-28 object-cover"
                        onError={e => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                      <div className="hidden h-28 bg-m-bg items-center justify-center gap-2 text-xs text-m-muted">
                        <MapPin size={13} style={{ color: '#7DC242' }} />
                        {device.location || `${parseFloat(device.latitude).toFixed(4)}, ${parseFloat(device.longitude).toFixed(4)}`}
                      </div>
                    </a>
                  ) : (
                    <div className="h-28 bg-m-bg flex items-center justify-center">
                      <p className="text-xs text-m-muted">Location unavailable</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-4 py-2.5 flex items-center gap-1.5 text-xs text-m-muted">
                    <MapPin size={11} style={{ color: '#7DC242' }} />
                    {device.city || device.location || 'Unknown location'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
