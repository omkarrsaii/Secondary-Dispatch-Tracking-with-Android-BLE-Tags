import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Smartphone, History, Settings, Radar, Satellite } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Smartphone, label: 'Devices' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-56 bg-hub-card border-r border-hub-border flex flex-col z-40 transition-all">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-hub-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-hub-accent/20 to-hub-accent2/20 border border-hub-accent/30 flex items-center justify-center flex-shrink-0">
          <Satellite size={16} className="text-hub-accent" />
        </div>
        <span className="hidden lg:block font-display font-semibold text-sm tracking-wide text-hub-text">
          Find Hub
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group
               ${isActive
                 ? 'bg-hub-accent/10 text-hub-accent border border-hub-accent/20'
                 : 'text-hub-muted hover:text-hub-text hover:bg-white/5'}`
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            <span className="hidden lg:block text-sm font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom badge */}
      <div className="p-3 border-t border-hub-border">
        <div className="hidden lg:flex items-center gap-2 px-2 py-2 rounded-lg bg-hub-bg/50">
          <div className="w-2 h-2 rounded-full bg-hub-green blink" />
          <span className="text-xs text-hub-muted font-mono">Tracking</span>
        </div>
      </div>
    </aside>
  )
}
