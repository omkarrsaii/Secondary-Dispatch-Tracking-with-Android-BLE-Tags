import { useState } from 'react'
import { loginDistributor } from '../distributorApi'

export default function DistributorLogin({ onLoginSuccess }) {
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    try {
      const data = await loginDistributor(trimmed)
      // data = { success, distributorCode, distributorName, totalActiveInvoices }
      onLoginSuccess(data)
    } catch (err) {
      const message = err.response?.data?.message || 'Could not verify that distributor code. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh dot-grid flex flex-col">
      <header className="sticky top-0 z-30 border-b border-rim/60 bg-ink/90 backdrop-blur-md">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ember/15 border border-ember/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-extrabold text-snow leading-none text-base tracking-wide">FindMyInvoice</p>
            <p className="text-mist text-[10px] font-mono leading-none mt-0.5 tracking-widest uppercase">Invoice Tracker</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-sm mx-auto w-full px-4 pt-16 pb-16 flex flex-col">
        <div className="mb-8 text-center animate-fade-up">
          <h1 className="font-display font-extrabold text-2xl text-snow leading-tight">
            Distributor Sign In
          </h1>
          <p className="text-mist text-sm mt-1.5">
            Enter your distributor code to view your active invoices.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="animate-fade-up space-y-4" style={{ animationDelay: '0.05s' }}>
          <div>
            <label className="text-xs text-mist uppercase tracking-widest mb-1.5 block">Distributor Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. 16544"
              autoFocus
              className="w-full bg-panel border border-rim rounded-xl px-4 py-3 text-snow placeholder-mist/40 font-mono focus:outline-none focus:border-ember/50 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-bad bg-bad/10 border border-bad/20 rounded-xl px-3 py-2.5 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 rounded-xl bg-ember text-ink font-semibold hover:bg-ember/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                Verifying…
              </>
            ) : 'Sign In'}
          </button>
        </form>
      </main>

      <footer className="border-t border-rim/40 py-4 text-center">
        <p className="text-xs text-mist/40 font-mono">
          Powered by&nbsp;
          <span className="text-ember/60">Find Hub Tracker</span>
          &nbsp;· Live device data
        </p>
      </footer>
    </div>
  )
}
