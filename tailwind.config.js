/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:          '#0f0e17',
        surface:     '#1a1828',
        'surface-high': '#22203a',
        border:      '#3a3660',
        'border-hover': '#4a4870',
        'border-subtle': '#2e2c4a',
        gold:        '#c9a84c',
        'gold-dim':  '#a07830',
        parchment:   '#e8d5b0',
        'parchment-warm': '#c9b88a',
        muted:       '#9990b0',
        dim:         '#6a6490',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
}

