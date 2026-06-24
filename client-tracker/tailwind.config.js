/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Outfit"',        'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"','monospace'],
        display: ['"Unbounded"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink:   '#0B0F1A',
        panel: '#121828',
        rim:   '#1E2D42',
        ember: '#F97316',
        glow:  '#FB923C',
        slate: '#94A3B8',
        mist:  '#64748B',
        snow:  '#F1F5F9',
        ok:    '#22C55E',
        warn:  '#EAB308',
        bad:   '#EF4444',
      },
      animation: {
        'fade-up':   'fadeUp 0.45s ease-out both',
        'fade-in':   'fadeIn 0.3s ease-out both',
        'spin-slow': 'spin 1.6s linear infinite',
        'pulse-ring':'pulseRing 1.8s ease-out infinite',
      },
      keyframes: {
        fadeUp:    { from: { opacity: 0, transform: 'translateY(18px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:    { from: { opacity: 0 },                                 to: { opacity: 1 } },
        pulseRing: {
          '0%':   { transform: 'scale(0.9)', opacity: 0.8 },
          '70%':  { transform: 'scale(1.4)', opacity: 0 },
          '100%': { transform: 'scale(1.4)', opacity: 0 },
        },
      },
      boxShadow: {
        ember: '0 0 24px rgba(249,115,22,0.35)',
        card:  '0 4px 32px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
