import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Smartphone, History, Settings,
  Route, Building2, Search, Radio
} from 'lucide-react'

const MARICO_BLUE = '#1467B2'
const MARICO_GREEN = '#7DC242'

const navItems = [
  { to: '/',          icon: Building2,       label: 'Hierarchy' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices',   icon: Smartphone,      label: 'Devices'   },
  { to: '/routes',    icon: Route,           label: 'Routes'    },
  { to: '/search',    icon: Search,          label: 'Search'    },
  { to: '/history',   icon: History,         label: 'History'   },
  { to: '/settings',  icon: Settings,        label: 'Settings'  },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-60 flex flex-col z-40"
           style={{ background: MARICO_BLUE }}>

      {/* Brand with real Marico logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10">
        {/* Logo mark — white bg so the blue/green logo reads clearly */}
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-1">
          <img
            src="/marico-logo.png"
            alt="Marico"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="hidden lg:block min-w-0">
          <p className="font-extrabold text-white text-sm leading-tight tracking-wide">Central Dashboard</p>
          <p className="text-white/45 text-[10px] tracking-widest uppercase leading-none mt-0.5 font-mono">BLE Dispatch Tracking</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group border-l-2
               ${isActive
                 ? 'text-white font-semibold'
                 : 'text-white/55 hover:text-white hover:bg-white/8 border-transparent'}`
            }
            style={({ isActive }) => isActive
              ? { borderLeftColor: MARICO_GREEN, background: 'linear-gradient(90deg,rgba(125,194,66,.16),rgba(125,194,66,.03))' }
              : {}}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`} />
                <span className="hidden lg:block text-[13px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Live badge */}
      <div className="p-3 border-t border-white/10">
        <div className="hidden lg:flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5">
          <Radio size={12} className="text-white/35" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0" style={{ background: MARICO_GREEN }} />
            <span className="text-[11px] text-white/45 truncate font-mono">BLE Live</span>
          </div>
        </div>
        <div className="lg:hidden flex justify-center">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: MARICO_GREEN }} />
        </div>
      </div>
    </aside>
  )
}
