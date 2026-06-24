import { useState } from 'react'
import DistributorLogin     from './pages/DistributorLogin'
import DistributorDashboard from './pages/DistributorDashboard'
import InvoiceTracker       from './pages/InvoiceTracker'

// Single-page state machine — no router, no separate portal/application.
// 'login' is the default screen. After a successful login the same app
// instance switches to 'dashboard'. Clicking an invoice switches to
// 'tracking', which reuses the existing tracking logic/components
// completely unmodified — it is just no longer the default landing view.
export default function App() {
  const [screen, setScreen]           = useState('login') // 'login' | 'dashboard' | 'tracking'
  const [distributor, setDistributor] = useState(null)     // { distributorCode, distributorName, totalActiveInvoices }
  const [trackedInvoice, setTrackedInvoice] = useState(null)

  const handleLoginSuccess = (data) => {
    setDistributor(data)
    setScreen('dashboard')
  }

  const handleInvoiceClick = (invoiceNo) => {
    setTrackedInvoice(invoiceNo)
    setScreen('tracking')
  }

  const handleBackToDashboard = () => {
    setTrackedInvoice(null)
    setScreen('dashboard')
  }

  const handleSignOut = () => {
    setDistributor(null)
    setTrackedInvoice(null)
    setScreen('login')
  }

  if (screen === 'dashboard' && distributor) {
    return (
      <DistributorDashboard
        distributor={distributor}
        onInvoiceClick={handleInvoiceClick}
        onSignOut={handleSignOut}
      />
    )
  }

  if (screen === 'tracking') {
    return (
      <InvoiceTracker
        initialInvoice={trackedInvoice}
        onBack={handleBackToDashboard}
      />
    )
  }

  // Default landing screen
  return <DistributorLogin onLoginSuccess={handleLoginSuccess} />
}
