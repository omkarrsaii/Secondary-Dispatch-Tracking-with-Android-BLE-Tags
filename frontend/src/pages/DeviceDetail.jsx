import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Battery, Wifi, Clock, Smartphone, History, ExternalLink } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getDevice, getDeviceHistory } from '../lib/api'
import { useDevices } from '../hooks/useDevices'
import Header from '../components/Header'

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-hub-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-hub-bg border border-hub-border flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-hub-accent" />
      </div>
      <div>
        <p className="text-xs text-hub-muted uppercase tracking-wider">{label}</p>
        <p className={`text-sm text-hub-text mt-0.5 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
      </div>
    </div>
  )
}

export default function DeviceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, refreshing, refresh } = useDevices()
  const [device, setDevice] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [dev, hist] = await Promise.all([
          getDevice(id),
          getDeviceHistory(id, 50)
        ])
        setDevice(dev)
        setHistory(hist)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [id])

  const chartData = history.slice().reverse().map((h, i) => ({
    time: new Date(h.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    battery: parseInt(h.battery) || null,
    lat: parseFloat(h.latitude) || null,
    lng: parseFloat(h.longitude) || null,
  }))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-hub-muted">Device not found</p>
          <button onClick={() => navigate('/devices')} className="mt-4 text-hub-accent text-sm hover:underline">
            ← Back to devices
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header title={device.device_name} status={status} refreshing={refreshing} onRefresh={refresh} />

      <div className="p-6 animate-fade-in">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-hub-muted hover:text-hub-text text-sm mb-5 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Device info card */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border border-hub-border bg-hub-card p-5">
              {/* Device header */}
              <div className="flex items-center gap-4 mb-5 pb-5 border-b border-hub-border">
                {device.image_url ? (
                  <img src={device.image_url} alt={device.device_name} className="w-16 h-16 rounded-xl object-contain bg-hub-bg border border-hub-border p-1" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-hub-bg border border-hub-border flex items-center justify-center">
                    <Smartphone size={24} className="text-hub-muted" />
                  </div>
                )}
                <div>
                  <h2 className="font-display font-semibold text-hub-text">{device.device_name}</h2>
                  <p className="text-xs text-hub-muted mt-1">ID: {device.id}</p>
                </div>
              </div>

              <InfoRow icon={Battery} label="Battery" value={device.battery ? `${device.battery}%` : null} />
              <InfoRow icon={Wifi} label="Network" value={device.network} />
              <InfoRow icon={Clock} label="Last Seen" value={device.last_seen_text} />
              <InfoRow icon={Clock} label="Last Fetch" value={device.last_fetch_time ? new Date(device.last_fetch_time).toLocaleString() : null} />
              <InfoRow icon={MapPin} label="Location" value={[device.city, device.state, device.country].filter(Boolean).join(', ')} />
              <InfoRow icon={MapPin} label="Coordinates" value={device.latitude && device.longitude ? `${device.latitude}, ${device.longitude}` : null} mono />
            </div>

            {/* Maps link */}
            {device.latitude && device.longitude && (
              <a
                href={device.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-hub-accent/30 bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent text-sm font-medium transition-colors"
              >
                <ExternalLink size={14} /> Open in Google Maps
              </a>
            )}
          </div>

          {/* Map + Charts */}
          <div className="lg:col-span-2 space-y-4">
            {/* Static map */}
            {device.latitude && device.longitude && (
              <div className="rounded-xl border border-hub-border overflow-hidden">
                <a href={device.mapsUrl} target="_blank" rel="noreferrer">
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${device.latitude},${device.longitude}&zoom=14&size=800x280&markers=color:red|label:D|${device.latitude},${device.longitude}`}
                    alt="Device location"
                    className="w-full h-52 object-cover"
                    onError={e => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                </a>
                <div className="hidden h-52 bg-hub-bg items-center justify-center gap-3 border border-hub-border rounded-xl">
                  <MapPin size={20} className="text-hub-accent" />
                  <div>
                    <p className="text-sm text-hub-text">{[device.city, device.state].filter(Boolean).join(', ')}</p>
                    <p className="text-xs text-hub-muted font-mono">{device.latitude}, {device.longitude}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Battery history chart */}
            {chartData.length > 1 && (
              <div className="rounded-xl border border-hub-border bg-hub-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <History size={14} className="text-hub-accent" />
                  <h3 className="text-sm font-semibold text-hub-text font-display">Battery History</h3>
                  <span className="text-xs text-hub-muted ml-auto">{chartData.length} readings</span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3B" />
                    <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #1E2A3B', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#E2E8F0' }}
                    />
                    <Line type="monotone" dataKey="battery" stroke="#00D4FF" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* History table */}
            <div className="rounded-xl border border-hub-border bg-hub-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-hub-border flex items-center gap-2">
                <History size={14} className="text-hub-accent" />
                <h3 className="text-sm font-semibold text-hub-text font-display">Location History</h3>
                <span className="text-xs text-hub-muted ml-auto">{history.length} records</span>
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-hub-muted text-sm">No history yet</div>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-hub-card">
                      <tr className="border-b border-hub-border">
                        {['Time', 'Latitude', 'Longitude', 'Battery', 'Network'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-hub-muted uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.id} className="border-b border-hub-border/50 hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 text-xs text-hub-muted font-mono whitespace-nowrap">
                            {new Date(h.captured_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-hub-text font-mono">{h.latitude || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hub-text font-mono">{h.longitude || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hub-text">{h.battery ? `${h.battery}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-hub-text">{h.network || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
