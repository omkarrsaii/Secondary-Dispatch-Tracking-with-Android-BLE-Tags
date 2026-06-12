import { AlertTriangle, Terminal } from 'lucide-react'

export default function SessionExpiredBanner() {
  return (
    <div className="mx-6 mt-4 rounded-xl border border-hub-red/30 bg-hub-red/5 p-4 flex items-start gap-3 animate-fade-in">
      <AlertTriangle size={18} className="text-hub-red flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-hub-red font-semibold text-sm">Session Expired — Please Login Again</p>
        <p className="text-hub-muted text-xs mt-1">
          Your Google session has expired. The scheduler has been paused.
        </p>
        <div className="mt-3 flex items-center gap-2 bg-hub-bg rounded-lg px-3 py-2 border border-hub-border w-fit">
          <Terminal size={13} className="text-hub-accent" />
          <code className="text-hub-accent text-xs font-mono">cd backend && npm run setup-login</code>
        </div>
      </div>
    </div>
  )
}
