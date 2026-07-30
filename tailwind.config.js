/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Single source of truth: CSS custom properties in src/index.css :root.
      // These reference the tokens so Tailwind utilities and the runtime palette never drift.
      colors: {
        bg:          'var(--bg)',
        'bg-2':      'var(--bg-2)',
        surface:     'var(--paper)',
        'surface-high': 'var(--paper-2)',
        paper:       'var(--paper)',
        'paper-2':   'var(--paper-2)',
        'paper-3':   'var(--paper-3)',
        border:      'var(--rule)',
        'border-hover': 'var(--rule-hover)',
        'border-subtle': 'var(--rule-soft)',
        gold:        'var(--gold)',
        'gold-2':    'var(--gold-2)',
        'gold-hover': 'var(--gold-hover)',
        accent:      'var(--accent)',
        parchment:   'var(--ink)',
        'parchment-warm': 'var(--ink-2)',
        muted:       'var(--ink-2)',
        dim:         'var(--ink-3)',
        faint:       'var(--ink-4)',
        moss:        'var(--moss)',
        sky:         'var(--sky)',
        red:         'var(--red)',
        success:     'var(--success)',
        info:        'var(--info)',
        warn:        'var(--warn)',
        orange:      'var(--orange)',
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'Cambria', 'serif'],
        display: ['"EB Garamond"', 'Georgia', 'Cambria', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // One control radius from the token scale; rounded-full stays a pill.
      borderRadius: {
        sm:        'var(--radius)',
        DEFAULT:   'var(--radius)',
        md:        'var(--radius)',
        lg:        'var(--radius-lg)',
        xl:        'var(--radius-xl)',
        '2xl':     'var(--radius-xl)',
      },
    },
  },
  plugins: [],
}
