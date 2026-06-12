import { RefreshCw, Download, AlertTriangle, Wifi, WifiOff } from 'lucide-react'

export default function Header({ status, refreshing, onRefresh, title }) {
  const sessionOk = status?.session === 'ok'
  const sessionExpired = status?.sessionExpired

  return (
    <header className="sticky top-0 z-30 bg-hub-bg/80 backdrop-blur border-b border-hub-border px-6 py-3 flex items-center justify-between">
      <div>
        <h1 className="font-display font-semibold text-hub-text text-lg">{title}</h1>
        {status?.lastSync && (
          <p className="text-xs text-hub-muted font-mono mt-0.5">
            Last sync: {new Date(status.lastSync).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Session status */}
        {sessionExpired ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-red/10 border border-hub-red/30 text-hub-red text-xs font-medium">
            <AlertTriangle size={13} />
            <span>Session Expired</span>
          </div>
        ) : sessionOk ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-green/10 border border-hub-green/30 text-hub-green text-xs font-medium">
            <Wifi size={13} />
            <span className="hidden sm:inline">Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-yellow/10 border border-hub-yellow/30 text-hub-yellow text-xs font-medium">
            <WifiOff size={13} />
            <span className="hidden sm:inline">No Session</span>
          </div>
        )}

        {/* Export buttons */}
        <a
          href="/api/export/csv"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-border/60 hover:bg-hub-border text-hub-muted hover:text-hub-text text-xs font-medium transition-colors"
        >
          <Download size={13} />
          CSV
        </a>
        <a
          href="/api/export/excel"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent border border-hub-accent/20 text-xs font-medium transition-colors"
        >
          <Download size={13} />
          Excel
        </a>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={refreshing || sessionExpired}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent border border-hub-accent/20 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  )
}
