import { useState, useEffect } from 'react'
import { Settings, Clock, Terminal, CheckCircle, AlertTriangle, RefreshCw, Bug, Image } from 'lucide-react'
import { updateScheduler, triggerRefreshSync } from '../lib/api'
import { useDevices } from '../hooks/useDevices'
import Header from '../components/Header'
import api from '../lib/api'

const INTERVALS = [10, 15, 20, 30, 60]

export default function SettingsPage() {
  const { status, refreshing, refresh, refetch } = useDevices()
  const [selectedInterval, setSelectedInterval] = useState(status?.scheduler?.interval || 10)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [syncResult, setSyncResult] = useState(null)
  const [debugFiles, setDebugFiles] = useState([])
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    if (showDebug) {
      api.get('/debug/snapshots').then(r => setDebugFiles(r.data.files || [])).catch(() => {})
    }
  }, [showDebug])

  async function saveScheduler() {
    setSaving(true); setSaveMsg(null)
    try {
      await updateScheduler(selectedInterval)
      setSaveMsg({ ok: true, text: `Scheduler updated to every ${selectedInterval} minutes` })
      refetch()
    } catch (err) {
      setSaveMsg({ ok: false, text: err.response?.data?.error || err.message })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  async function runSyncNow() {
    setSyncing(true); setSyncResult(null)
    try {
      const result = await triggerRefreshSync()
      setSyncResult({ ok: true, text: `Synced ${result.count} devices in ${result.duration}s` })
      refetch()
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      setSyncResult({ ok: false, text: msg })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen">
      <Header title="Settings" status={status} refreshing={refreshing} onRefresh={refresh} />

      <div className="p-6 max-w-2xl animate-fade-in space-y-5">

        {/* Scheduler interval */}
        <div className="rounded-xl border border-hub-border bg-hub-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-hub-text">Fetch Interval</h2>
          </div>
          <p className="text-sm text-hub-muted mb-4">How often to fetch device locations automatically.</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {INTERVALS.map(interval => (
              <button key={interval} onClick={() => setSelectedInterval(interval)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all
                  ${selectedInterval === interval
                    ? 'bg-hub-accent/20 border-hub-accent/50 text-hub-accent'
                    : 'bg-hub-bg border-hub-border text-hub-muted hover:text-hub-text hover:border-hub-accent/30'}`}>
                {interval === 60 ? '1 hour' : `${interval} min`}
              </button>
            ))}
          </div>
          {saveMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm
              ${saveMsg.ok ? 'bg-hub-green/10 text-hub-green border border-hub-green/20'
                           : 'bg-hub-red/10 text-hub-red border border-hub-red/20'}`}>
              {saveMsg.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {saveMsg.text}
            </div>
          )}
          <button onClick={saveScheduler} disabled={saving}
            className="px-4 py-2 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent border border-hub-accent/20 text-sm font-medium transition-all disabled:opacity-40">
            {saving ? 'Saving...' : 'Save Interval'}
          </button>
        </div>

        {/* Manual sync */}
        <div className="rounded-xl border border-hub-border bg-hub-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-hub-text">Manual Sync</h2>
          </div>
          <p className="text-sm text-hub-muted mb-4">Trigger an immediate fetch and wait for the result.</p>
          {syncResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm
              ${syncResult.ok ? 'bg-hub-green/10 text-hub-green border border-hub-green/20'
                              : 'bg-hub-red/10 text-hub-red border border-hub-red/20'}`}>
              {syncResult.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {syncResult.text}
            </div>
          )}
          <button onClick={runSyncNow} disabled={syncing || status?.sessionExpired}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent border border-hub-accent/20 text-sm font-medium transition-all disabled:opacity-40">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing (may take ~30s)...' : 'Sync Now'}
          </button>
        </div>

        {/* Session info */}
        <div className="rounded-xl border border-hub-border bg-hub-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-hub-text">Session Management</h2>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4
            ${status?.sessionExpired ? 'bg-hub-red/10 border border-hub-red/30 text-hub-red'
              : status?.session === 'ok' ? 'bg-hub-green/10 border border-hub-green/30 text-hub-green'
              : 'bg-hub-yellow/10 border border-hub-yellow/30 text-hub-yellow'}`}>
            {status?.sessionExpired ? <><AlertTriangle size={14} /> Session Expired</>
              : status?.session === 'ok' ? <><CheckCircle size={14} /> Session Active</>
              : <><AlertTriangle size={14} /> No session — login required</>}
          </div>
          <p className="text-sm text-hub-muted mb-3">To create or renew your Google session:</p>
          <div className="bg-hub-bg rounded-lg border border-hub-border p-3 font-mono text-xs text-hub-accent">
            cd backend &amp;&amp; npm run setup-login
          </div>
          <p className="text-xs text-hub-muted mt-3">
            A browser window opens. Log in, navigate to <span className="text-hub-accent">google.com/android/find</span>,
            wait for your devices to appear in the sidebar, then press <kbd className="px-1 py-0.5 bg-hub-border rounded text-hub-text">ENTER</kbd>.
          </p>
        </div>

        {/* System status */}
        <div className="rounded-xl border border-hub-border bg-hub-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-hub-accent" />
            <h2 className="font-display font-semibold text-hub-text">System Status</h2>
          </div>
          <div className="space-y-0 font-mono text-xs">
            {[
              ['Scheduler Running', status?.scheduler?.running ? '✓ Yes' : '✗ No'],
              ['Fetch Interval', status?.scheduler?.interval ? `${status.scheduler.interval} minutes` : '—'],
              ['Cron Expression', status?.scheduler?.cronExpr || '—'],
              ['Last Sync', status?.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'],
              ['Last Sync Count', status?.lastSyncCount || '0'],
              ['Currently Fetching', status?.fetching ? '⟳ Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-hub-border/50 last:border-0">
                <span className="text-hub-muted">{label}</span>
                <span className="text-hub-text">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Debug panel */}
        <div className="rounded-xl border border-hub-border bg-hub-card p-5">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-2 w-full text-left">
            <Bug size={16} className="text-hub-yellow" />
            <h2 className="font-display font-semibold text-hub-text flex-1">Debug Snapshots</h2>
            <span className="text-xs text-hub-muted">{showDebug ? '▲ hide' : '▼ show'}</span>
          </button>

          {showDebug && (
            <div className="mt-4">
              <p className="text-sm text-hub-muted mb-3">
                When a fetch fails, screenshots and DOM dumps are saved to <code className="text-hub-accent text-xs">backend/data/debug/</code>.
                These help diagnose DOM selector issues.
              </p>
              {debugFiles.length === 0 ? (
                <p className="text-xs text-hub-muted italic">No debug snapshots yet. A failed fetch will create them.</p>
              ) : (
                <div className="space-y-2">
                  {debugFiles.filter(f => f.name.endsWith('.png')).map(f => (
                    <div key={f.name} className="rounded-lg overflow-hidden border border-hub-border">
                      <p className="text-xs text-hub-muted px-3 py-1.5 bg-hub-bg border-b border-hub-border font-mono">{f.name}</p>
                      <img src={f.url} alt={f.name} className="w-full max-h-64 object-cover object-top" />
                    </div>
                  ))}
                  {debugFiles.filter(f => f.name.endsWith('.txt')).map(f => (
                    <a key={f.name} href={f.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hub-bg border border-hub-border hover:border-hub-accent/30 text-xs text-hub-muted hover:text-hub-text transition-colors">
                      <Image size={12} /> {f.name} — DOM dump
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
