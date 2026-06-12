export default function StatCard({ icon: Icon, label, value, sub, color = 'cyan', trend }) {
  const colorMap = {
    cyan: { bg: 'bg-hub-accent/10', border: 'border-hub-accent/20', text: 'text-hub-accent', glow: 'shadow-[0_0_20px_rgba(0,212,255,0.08)]' },
    purple: { bg: 'bg-hub-accent2/10', border: 'border-hub-accent2/20', text: 'text-hub-accent2', glow: 'shadow-[0_0_20px_rgba(124,58,237,0.08)]' },
    green: { bg: 'bg-hub-green/10', border: 'border-hub-green/20', text: 'text-hub-green', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.08)]' },
    yellow: { bg: 'bg-hub-yellow/10', border: 'border-hub-yellow/20', text: 'text-hub-yellow', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.08)]' },
  }
  const c = colorMap[color] || colorMap.cyan

  return (
    <div className={`relative rounded-xl border ${c.border} bg-hub-card p-5 ${c.glow} animate-slide-up overflow-hidden`}>
      {/* BG glow blob */}
      <div className={`absolute -top-4 -right-4 w-24 h-24 rounded-full ${c.bg} blur-2xl opacity-50`} />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-hub-muted text-xs font-medium uppercase tracking-wider mb-2">{label}</p>
          <p className={`text-3xl font-display font-bold ${c.text}`}>{value ?? '—'}</p>
          {sub && <p className="text-hub-muted text-xs mt-1.5 font-mono">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon size={18} className={c.text} />
        </div>
      </div>
    </div>
  )
}
