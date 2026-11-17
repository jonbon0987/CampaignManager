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
      // The type scale from src/index.css :root (--fs-*). Names match the tokens,
      // so text-sm is 13px here (Tailwind's own text-sm was 14px: use text-md).
      // Line heights keep what Tailwind's defaults set for the sizes they replaced.
      fontSize: {
        micro:   ['var(--fs-micro)',   { lineHeight: '0.875rem' }],
        label:   ['var(--fs-label)',   { lineHeight: '1rem' }],
        xs:      ['var(--fs-xs)',      { lineHeight: '1rem' }],
        sm:      ['var(--fs-sm)',      { lineHeight: '1.25rem' }],
        md:      ['var(--fs-md)',      { lineHeight: '1.25rem' }],
        body:    ['var(--fs-body)',    { lineHeight: '1.5rem' }],
        lg:      ['var(--fs-lg)',      { lineHeight: '1.75rem' }],
        h3:      ['var(--fs-h3)',      { lineHeight: '1.75rem' }],
        h2:      ['var(--fs-h2)',      { lineHeight: '2rem' }],
        h1:      ['var(--fs-h1)',      { lineHeight: '2.5rem' }],
        display: ['var(--fs-display)', { lineHeight: '1' }],
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
