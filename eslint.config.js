import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // ─── Audit F10 — button guardrail ─────────────────────────────────────────
  // Root cause of F4: <Button> is opt-in, so every new feature reaches for a
  // styled raw <button> (Ideas minted five new classes this way). This flags a
  // styled raw <button> anywhere OUTSIDE the ui/ primitives, so the frictionless
  // move becomes the component, not a new CSS class.
  //
  // Ships at 'warn' so it does not block the build DURING the F4 migration.
  // Flip both to 'error' once the migration lands (see README, step 5).
  //
  // Genuinely bespoke controls (e.g. WorldSidebar's .ws-selector menu trigger)
  // stay legal via an inline:
  //   // eslint-disable-next-line no-restricted-syntax -- bespoke menu trigger, not an action button
  {
    files: ['src/**/*.tsx'],
    ignores: [
      'src/components/ui/**',   // Button, IconButton and the other primitives live here
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className']",
          message: "Use <Button>/<IconButton> from components/ui instead of a styled raw <button className>. Bespoke control? Add an eslint-disable-next-line with a reason.",
        },
        {
          selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='style']",
          message: "Use <Button>/<IconButton> (pass `style` as an escape hatch on the component) instead of a styled raw <button style>. Bespoke control? Add an eslint-disable-next-line with a reason.",
        },
      ],
    },
  },
])
