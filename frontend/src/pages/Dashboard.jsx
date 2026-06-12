import { Smartphone, Clock, Timer, Wifi, MapPin, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDevices } from '../hooks/useDevices'
import StatCard from '../components/StatCard'
import DeviceRow from '../components/DeviceRow'
import Header from '../components/Header'
import SessionExpiredBanner from '../components/SessionExpiredBanner'

export default function Dashboard() {
  const { devices, status, loading, refreshing, refresh } = useDevices()
  const navigate = useNavigate()

  const onlineDevices = devices.filter(d => {
    if (!d.lastSeen) return false
    return d.lastSeen.match(/minute|just now|second/i)
  })

  const lastSync = status?.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'

  return (
    <div className="min-h-screen">
      <Header title="Dashboard" status={status} refreshing={refreshing} onRefresh={refresh} />

      {status?.sessionExpired && <SessionExpiredBanner />}

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Smartphone} label="Total Devices" value={devices.length} color="cyan" />
          <StatCard icon={Clock} label="Last Sync" value={lastSync} sub="auto-refreshing" color="purple" />
          <StatCard
            icon={Timer}
            label="Fetch Interval"
            value={`${status?.scheduler?.interval || '—'}m`}
            sub="configurable"
            color="yellow"
          />
          <StatCard
            icon={Wifi}
            label="Recently Seen"
            value={onlineDevices.length}
            sub="last few minutes"
            color="green"
          />
        </div>

        {/* Devices table */}
        <div className="rounded-xl border border-hub-border bg-hub-card overflow-hidden">
          <div className="px-5 py-4 border-b border-hub-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-hub-accent" />
              <h2 className="font-display font-semibold text-sm text-hub-text">All Devices</h2>
              <span className="px-2 py-0.5 rounded-full bg-hub-accent/10 text-hub-accent text-xs font-mono border border-hub-accent/20">
                {devices.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-hub-muted text-sm">Loading devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="p-12 text-center">
              <Smartphone size={32} className="text-hub-border mx-auto mb-3" />
              <p className="text-hub-muted text-sm">No devices found.</p>
              <p className="text-hub-muted text-xs mt-1">Run a refresh or check your session.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hub-border">
                    {['Device', 'Coordinates', 'Location', 'Battery', 'Network', 'Last Seen', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-hub-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <DeviceRow key={device.id} device={device} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Map grid - quick location preview cards */}
        {devices.length > 0 && (
          <div>
            <h2 className="font-display font-semibold text-sm text-hub-text mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-hub-accent" /> Quick Location View
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map(device => (
                <div
                  key={device.id}
                  className="rounded-xl border border-hub-border bg-hub-card p-4 hover:border-hub-accent/30 cursor-pointer transition-all group"
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {device.imageUrl ? (
                      <img src={device.imageUrl} alt={device.name} className="w-9 h-9 rounded-lg object-contain bg-hub-bg border border-hub-border" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-hub-bg border border-hub-border flex items-center justify-center">
                        <Smartphone size={15} className="text-hub-muted" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-hub-text truncate group-hover:text-hub-accent transition-colors">
                        {device.name}
                      </p>
                      <p className="text-xs text-hub-muted">{device.lastSeen || 'Unknown'}</p>
                    </div>
                  </div>

                  {device.latitude && device.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="block w-full rounded-lg overflow-hidden border border-hub-border hover:border-hub-accent/30 transition-colors"
                    >
                      <img
                        src={`https://maps.googleapis.com/maps/api/staticmap?center=${device.latitude},${device.longitude}&zoom=13&size=400x120&markers=color:red|${device.latitude},${device.longitude}&style=feature:all|element:labels.text.fill|color:0xffffff&style=feature:all|element:geometry|color:0x1a2035`}
                        alt="Location map"
                        className="w-full h-28 object-cover"
                        onError={e => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                      <div className="hidden h-28 bg-hub-bg items-center justify-center text-xs text-hub-muted gap-2">
                        <MapPin size={14} className="text-hub-accent" />
                        {device.location || `${parseFloat(device.latitude).toFixed(4)}, ${parseFloat(device.longitude).toFixed(4)}`}
                      </div>
                    </a>
                  ) : (
                    <div className="h-28 rounded-lg bg-hub-bg border border-hub-border flex items-center justify-center">
                      <p className="text-xs text-hub-muted">Location unavailable</p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-hub-muted flex items-center gap-1">
                      <MapPin size={11} className="text-hub-accent" />
                      {device.city || device.location || 'Unknown'}
                    </span>
                    <span className="text-hub-muted font-mono">
                      {device.battery ? `${device.battery}%` : '—'}
                    </span>
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
