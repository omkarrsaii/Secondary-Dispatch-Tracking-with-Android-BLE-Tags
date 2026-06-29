import { Routes, Route } from 'react-router-dom'
import Sidebar      from './components/Sidebar'
import Dashboard    from './pages/Dashboard'
import DevicesPage  from './pages/DevicesPage'
import DeviceDetail from './pages/DeviceDetail'
import HistoryPage  from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import RoutesPage   from './pages/RoutesPage'
import HierarchyPage from './pages/HierarchyPage'
import SearchPage   from './pages/SearchPage'

export default function App() {
  return (
    <div className="flex min-h-screen grid-bg">
      <Sidebar />
      <main className="flex-1 ml-16 lg:ml-56 min-h-screen">
        <Routes>
          <Route path="/"           element={<HierarchyPage />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/devices"    element={<DevicesPage />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/routes"     element={<RoutesPage />} />
          <Route path="/hierarchy"  element={<HierarchyPage />} />
          <Route path="/search"     element={<SearchPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/settings"   element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
