/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:          '#15120e',
        'bg-2':      '#1e1a14',
        surface:     '#1c1814',
        'surface-high': '#211c16',
        paper:       '#1c1814',
        'paper-2':   '#211c16',
        border:      '#2e2820',
        'border-hover': '#3e3428',
        'border-subtle': '#26211a',
        gold:        '#c9a84c',
        'gold-2':    '#d8bd6b',
        'gold-dim':  '#a07830',
        accent:      '#c97a55',
        parchment:   '#e8dcc4',
        'parchment-warm': '#b9ac90',
        muted:       '#b9ac90',
        dim:         '#897f68',
        moss:        '#8aa56b',
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'Cambria', 'serif'],
        display: ['"EB Garamond"', 'Georgia', 'Cambria', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
