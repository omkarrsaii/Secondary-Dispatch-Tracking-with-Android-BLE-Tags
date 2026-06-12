import { useState } from 'react'

export default function SearchBar({ onSearch, loading }) {
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  const isValid = value.trim().length >= 3

  function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (isValid && !loading) onSearch(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative group">
        {/* Animated glow border */}
        <div
          className={`absolute -inset-px rounded-2xl transition-all duration-300 ${
            loading
              ? 'bg-gradient-to-r from-ember via-glow to-ember animate-pulse opacity-60'
              : 'bg-gradient-to-r from-ember/40 via-rim to-ember/40 group-focus-within:from-ember group-focus-within:via-glow group-focus-within:to-ember'
          }`}
        />

        <div className="relative flex items-center bg-panel rounded-2xl overflow-hidden">
          {/* Prefix icon */}
          <div className="pl-5 pr-3 flex-shrink-0">
            {loading ? (
              <svg className="w-5 h-5 text-ember animate-spin-slow" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-mist group-focus-within:text-ember transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            type="text"
            value={value}
            onChange={e => { setValue(e.target.value); setTouched(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
            placeholder="Enter Invoice Number…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 py-4 pr-4 bg-transparent text-snow placeholder:text-mist/50 font-mono text-base outline-none tracking-wide"
            disabled={loading}
          />

          {/* Clear button */}
          {value && !loading && (
            <button
              type="button"
              onClick={() => { setValue(''); setTouched(false) }}
              className="px-2 text-mist hover:text-slate transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Track button */}
          <button
            type="submit"
            disabled={loading || !isValid}
            className={`m-1.5 px-6 py-3 rounded-xl font-display font-bold text-sm tracking-wide transition-all duration-200 flex-shrink-0 ${
              isValid && !loading
                ? 'bg-ember text-white hover:bg-glow shadow-ember hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-rim text-mist cursor-not-allowed'
            }`}
          >
            {loading ? 'Tracking…' : 'Track'}
          </button>
        </div>
      </div>

      {/* Validation hint */}
      {touched && !isValid && (
        <p className="mt-2 text-xs text-bad/80 pl-1 animate-fade-in">
          Please enter a valid invoice number (at least 3 characters).
        </p>
      )}
    </form>
  )
}
