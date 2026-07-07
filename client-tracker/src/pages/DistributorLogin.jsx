import { useState } from 'react'
import { loginDistributor } from '../distributorApi'

const MB = '#1467B2'
const MG = '#7DC242'

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
      onLoginSuccess(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not verify that distributor code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh dot-grid flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-rim shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl overflow-hidden p-1 border border-rim shadow-sm flex-shrink-0">
            <img src="/marico-logo.png" alt="Marico" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="font-extrabold text-sm leading-tight" style={{ color: MB }}>Marico</p>
            <p className="text-[10px] text-slate tracking-widest uppercase leading-none mt-0.5 font-mono">Distributor Vehicle Tracking Portal</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">

        {/* Card */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card-md border border-rim overflow-hidden animate-fade-up">

          {/* Gradient top bar — Marico blue → green */}
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${MB}, ${MG})` }} />

          <div className="p-8">
            {/* Marico logo centered */}
            <div className="flex justify-center mb-6">
              <img src="/marico-logo.png" alt="Marico" className="h-16 object-contain" />
            </div>

            <h1 className="font-extrabold text-xl text-center mb-1.5 leading-tight" style={{ color: MB }}>
              Distributor Sign In
            </h1>
            <p className="text-slate text-sm text-center mb-7 leading-relaxed">
              Enter your distributor code to view active invoices and track deliveries.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest mb-1.5 block"
                       style={{ color: MB }}>
                  Distributor Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="e.g. 16544"
                  autoFocus
                  className="w-full bg-mbg border border-rim rounded-xl px-4 py-3 text-snow placeholder-mist/60
                             font-mono text-sm focus:outline-none transition-colors"
                  onFocus={e => e.target.style.borderColor = MB}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-bad bg-bad/8 border border-bad/20 rounded-xl px-3 py-2.5 text-xs">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full py-3.5 rounded-xl text-white font-bold text-sm
                           transition-all disabled:opacity-40 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2 shadow-ember"
                style={{ background: MB }}
                onMouseEnter={e => !e.currentTarget.disabled && (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = '')}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Sign In
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-xs text-slate/50 mt-6 font-mono">
          Marico Secondary Dispatch Tracking · Live BLE data
        </p>
      </main>
    </div>
  )
}
